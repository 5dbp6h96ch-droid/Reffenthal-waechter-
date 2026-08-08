import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Keyboard,
  Linking,
  Platform,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, {
  Path,
  Line as SvgLine,
  Circle,
  Text as SvgText,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from 'react-native-svg';
import {
  useGetWaechterState,
  useGetWaechterTreffer,
  useGetWaechterStatus,
  useGetWaechterClubs,
} from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import type { NfbList } from '@workspace/api-client-react';
// Local type aliases matching the generated API schemas (api-client-react types
// are not resolved by the mobile tsconfig due to missing project references).

type TimeRange = 7 | 30 | 90;
const TIME_RANGE_OPTIONS: { label: string; value: TimeRange }[] = [
  { label: '7 T', value: 7 },
  { label: '30 T', value: 30 },
  { label: '3 M', value: 90 },
];
const STORAGE_KEY = 'pegel_chart_range';

function filterHistory(
  history: { cm: number; ts: string }[],
  days: TimeRange,
): { cm: number; ts: string }[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return history.filter((h) => new Date(h.ts).getTime() >= cutoff);
}

// ─── Chart constants ────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const CARD_PADDING = 16;
const CHART_W = SCREEN_W - CARD_PADDING * 2 - 32; // full card minus side padding
const CHART_H = 140;
const PAD = { top: 10, right: 36, bottom: 26, left: 38 };

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) +
    ' · ' +
    d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  );
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Nie';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.floor(diffH / 24);
  return `vor ${diffD} Tag${diffD === 1 ? '' : 'en'}`;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getPathAndQuery(url: string): string {
  try {
    const u = new URL(url);
    const full = u.pathname + (u.search || '');
    return full.length > 60 ? full.slice(0, 58) + '…' : full;
  } catch {
    return url;
  }
}

// ─── Pegel Chart ─────────────────────────────────────────────────────────────

interface PegelChartProps {
  history: { cm: number; ts: string }[];
  threshold: number;
}

function PegelChart({ history, threshold }: PegelChartProps) {
  const colors = useColors();

  if (history.length < 2) {
    return (
      <View
        style={{
          height: 80,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderRadius: 8,
          borderColor: colors.border,
        }}
      >
        <Feather name="bar-chart-2" size={22} color={colors.mutedForeground} />
        <Text
          style={{
            fontSize: 13,
            fontFamily: 'SpaceGrotesk_400Regular',
            color: colors.mutedForeground,
          }}
        >
          Keine Verlaufsdaten
        </Text>
      </View>
    );
  }

  // History is chronological (oldest-first) — do NOT reverse
  const raw = [...history];
  // Downsample: max 200 points for performance
  const step = Math.max(1, Math.floor(raw.length / 200));
  const data = raw.filter((_, i) => i % step === 0);

  const cmValues = data.map((d) => d.cm);
  const dataMin = Math.min(...cmValues);
  const dataMax = Math.max(...cmValues);
  const padding = Math.max(10, (dataMax - dataMin) * 0.12);
  const minCm = Math.min(dataMin, threshold) - padding;
  const maxCm = Math.max(dataMax, threshold) + padding;
  const range = maxCm - minCm || 1;

  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const n = data.length - 1;

  const toX = (i: number): number => PAD.left + (i / (n || 1)) * plotW;
  const toY = (cm: number): number =>
    PAD.top + plotH - ((cm - minCm) / range) * plotH;

  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.cm).toFixed(1)}`)
    .join(' ');

  const baseY = (PAD.top + plotH).toFixed(1);
  const areaPath =
    linePath +
    ` L${toX(n).toFixed(1)},${baseY}` +
    ` L${PAD.left.toFixed(1)},${baseY} Z`;

  const threshY = toY(threshold);
  // last entry = newest = rightmost dot
  const lastCm = data[data.length - 1].cm;
  const isAlarm = lastCm < threshold;
  const lineColor = isAlarm ? colors.alarm : colors.safe;

  // Y-axis: 3 evenly-spaced values
  const yTicks = [
    Math.round(maxCm - padding),
    Math.round((minCm + maxCm) / 2),
    Math.round(minCm + padding),
  ];

  // X-axis time labels (4 evenly-spaced)
  const startMs = new Date(data[0].ts).getTime();
  const endMs   = new Date(data[data.length - 1].ts).getTime();
  const totalMs = endMs - startMs || 1;
  const totalDays = totalMs / 86_400_000;
  const xTicks = Array.from({ length: 5 }, (_, i) => {
    const frac = i / 4;
    const ms   = startMs + frac * totalMs;
    const x    = PAD.left + frac * plotW;
    const d    = new Date(ms);
    let label: string;
    if (totalDays <= 8) {
      label = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    } else if (totalDays <= 35) {
      label = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    } else {
      label = d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
    }
    return { x, label, anchor: i === 0 ? 'start' : i === 4 ? 'end' : 'middle' };
  });

  return (
    <Svg width={CHART_W} height={CHART_H}>
      <Defs>
        <SvgGradient id="pegelGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lineColor} stopOpacity="0.25" />
          <Stop offset="1" stopColor={lineColor} stopOpacity="0.01" />
        </SvgGradient>
      </Defs>

      {/* Y-axis tick labels */}
      {yTicks.map((cm) => (
        <SvgText
          key={cm}
          x={PAD.left - 6}
          y={toY(cm) + 4}
          fontSize={9}
          fill={colors.mutedForeground}
          textAnchor="end"
        >
          {cm}
        </SvgText>
      ))}

      {/* Threshold dashed line */}
      <SvgLine
        x1={PAD.left}
        y1={threshY}
        x2={CHART_W - PAD.right}
        y2={threshY}
        stroke={colors.accent}
        strokeWidth={1}
        strokeDasharray="5,3"
        strokeOpacity={0.85}
      />
      {/* Threshold label — inside right edge to avoid clipping */}
      <SvgText
        x={CHART_W - PAD.right - 2}
        y={threshY - 3}
        fontSize={8}
        fill={colors.accent}
        textAnchor="end"
        opacity={0.85}
      >
        {threshold} cm
      </SvgText>

      {/* Area fill */}
      <Path d={areaPath} fill="url(#pegelGrad)" />

      {/* Line */}
      <Path
        d={linePath}
        stroke={lineColor}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Latest point dot (rightmost = newest) */}
      <Circle cx={toX(n)} cy={toY(lastCm)} r={4} fill={lineColor} />
      <Circle cx={toX(n)} cy={toY(lastCm)} r={7} fill={lineColor} fillOpacity={0.2} />

      {/* X-axis time labels */}
      {xTicks.map((tick, i) => (
        <SvgText
          key={i}
          x={tick.x}
          y={CHART_H - 4}
          fontSize={8}
          fill={colors.mutedForeground}
          textAnchor={tick.anchor as 'start' | 'middle' | 'end'}
          opacity={0.75}
        >
          {tick.label}
        </SvgText>
      ))}
    </Svg>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const [chartRange, setChartRange] = useState<TimeRange>(30);
  const [newsOpen, setNewsOpen] = useState(true);
  const [vereineOpen, setVereineOpen] = useState(true);
  const [nfbOpen, setNfbOpen] = useState(true);

  // NfB km-Bereich
  const NFB_KM_DEFAULT_VON = 380;
  const NFB_KM_DEFAULT_BIS = 415;
  const NFB_KM_KEY = 'nfb_km_range';
  const [nfbKmVon, setNfbKmVon] = useState(NFB_KM_DEFAULT_VON);
  const [nfbKmBis, setNfbKmBis] = useState(NFB_KM_DEFAULT_BIS);
  const [nfbKmEdit, setNfbKmEdit] = useState(false);
  const [nfbKmInputVon, setNfbKmInputVon] = useState(String(NFB_KM_DEFAULT_VON));
  const [nfbKmInputBis, setNfbKmInputBis] = useState(String(NFB_KM_DEFAULT_BIS));
  const nfbKmBisRef = useRef<TextInput>(null);

  // Load persisted ranges on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => {
        if (val === '7' || val === '30' || val === '90') {
          setChartRange(Number(val) as TimeRange);
        }
      })
      .catch(() => {});

    AsyncStorage.getItem(NFB_KM_KEY)
      .then((val) => {
        if (val) {
          const parsed = JSON.parse(val) as { von: number; bis: number };
          if (typeof parsed.von === 'number' && typeof parsed.bis === 'number') {
            setNfbKmVon(parsed.von);
            setNfbKmBis(parsed.bis);
            setNfbKmInputVon(String(parsed.von));
            setNfbKmInputBis(String(parsed.bis));
          }
        }
      })
      .catch(() => {});
  }, []);

  const applyNfbKm = () => {
    const von = parseInt(nfbKmInputVon, 10);
    const bis = parseInt(nfbKmInputBis, 10);
    if (!isNaN(von) && !isNaN(bis) && von <= bis) {
      setNfbKmVon(von);
      setNfbKmBis(bis);
      AsyncStorage.setItem(NFB_KM_KEY, JSON.stringify({ von, bis })).catch(() => {});
    } else {
      // Reset inputs to current valid values on invalid input
      setNfbKmInputVon(String(nfbKmVon));
      setNfbKmInputBis(String(nfbKmBis));
    }
    setNfbKmEdit(false);
    Keyboard.dismiss();
  };

  const handleRangeChange = (range: TimeRange) => {
    setChartRange(range);
    AsyncStorage.setItem(STORAGE_KEY, String(range)).catch(() => {});
  };

  const {
    data: state,
    isLoading: stateLoading,
    isError: stateError,
    refetch: refetchState,
    isRefetching: stateRefetching,
  } = useGetWaechterState();

  const {
    data: treffer,
    isLoading: trefferLoading,
    isError: trefferError,
    refetch: refetchTreffer,
    isRefetching: trefferRefetching,
  } = useGetWaechterTreffer();

  const {
    data: waechterStatus,
    isLoading: statusLoading,
    refetch: refetchStatus,
    isRefetching: statusRefetching,
  } = useGetWaechterStatus();

  const {
    data: clubsData,
    isLoading: clubsLoading,
    isError: clubsError,
    refetch: refetchClubs,
    isRefetching: clubsRefetching,
  } = useGetWaechterClubs();

  // NfB mit km-Bereich-Filter — eigener useQuery statt generiertem Hook
  const nfbApiBase = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : '';
  const {
    data: nfbData,
    isLoading: nfbLoading,
    isError: nfbError,
    refetch: refetchNfb,
    isRefetching: nfbRefetching,
  } = useQuery<NfbList>({
    queryKey: ['nfb', nfbKmVon, nfbKmBis],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        km_von: String(nfbKmVon),
        km_bis: String(nfbKmBis),
      });
      const res = await fetch(`${nfbApiBase}/api/nfb?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<NfbList>;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 2,
  });

  // ── NfB notifications ────────────────────────────────────────────────────
  useNfbNotifications(nfbData?.meldungen);

  // Deep-link: open the NfB section when user taps a notification
  const scrollRef = useRef<ScrollView>(null);
  const nfbCardRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let sub: { remove: () => void } | null = null;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        sub = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as { screen?: string };
          if (data?.screen === 'nfb') {
            setNfbOpen(true);
            // Small delay lets the section expand before we scroll
            setTimeout(() => {
              nfbCardRef.current?.measureLayout(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                scrollRef.current as any,
                (_x, y) => scrollRef.current?.scrollTo({ y, animated: true }),
                () => {},
              );
            }, 300);
          }
        });
      } catch {
        // notifications unavailable – ignore
      }
    })();
    return () => { sub?.remove(); };
  }, []);

  // Count new notices that overlap the displayed watch range km 380–415
  const nfbNewCount = nfbData?.meldungen.filter(
    (m: NfbMeldung) =>
      m.is_new &&
      (m.km_von == null || m.km_bis == null || (m.km_von <= 415 && m.km_bis >= 380)),
  ).length ?? 0;

  const isRefreshing = stateRefetching || trefferRefetching || statusRefetching || clubsRefetching || nfbRefetching;

  const onRefresh = () => {
    void refetchState();
    void refetchTreffer();
    void refetchStatus();
    void refetchClubs();
    void refetchNfb();
  };

  const lastRunAt = waechterStatus?.last_run_at ?? null;
  const lastRunMs = lastRunAt ? Date.now() - new Date(lastRunAt).getTime() : null;
  const isStale = lastRunMs !== null && lastRunMs > 2 * 60 * 60 * 1000;
  const lastError = waechterStatus?.last_error ?? null;
  const neverRan = !statusLoading && !lastRunAt;
  const rssNewCount = waechterStatus?.rss_new_count ?? 0;

  const currentCm = state?.last_pegel_cm ?? null;
  const threshold = state?.threshold_cm ?? 225;
  const isAlarm = currentCm !== null && currentCm < threshold;
  const isSafe = currentCm !== null && currentCm >= threshold;
  const statusColor = isAlarm
    ? colors.alarm
    : isSafe
      ? colors.safe
      : colors.mutedForeground;
  const statusLabel = isAlarm ? 'ALARM' : isSafe ? 'SICHER' : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: topPad + 20,
          paddingBottom: botPad + 32,
          paddingHorizontal: 16,
          gap: 14,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 2,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Live status dot */}
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: statusColor,
              }}
            />
            <Text
              style={{
                fontSize: 13,
                fontFamily: 'SpaceGrotesk_600SemiBold',
                color: colors.foreground,
                letterSpacing: 2.5,
                textTransform: 'uppercase',
              }}
            >
              Rhein Infos
            </Text>
          </View>

          {state?.last_pegel_time ? (
            <Text
              style={{
                fontSize: 11,
                fontFamily: 'SpaceGrotesk_400Regular',
                color: colors.mutedForeground,
              }}
            >
              Speyer · {formatTime(state.last_pegel_time)}
            </Text>
          ) : null}
        </View>

        {/* ── Pegel Hero Card ── */}
        <View
          style={{
            backgroundColor: colors.primary,
            borderRadius: colors.radius + 4,
            padding: 20,
            gap: 14,
          }}
        >
          {/* Row: label + status badge */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontFamily: 'SpaceGrotesk_500Medium',
                color: colors.primaryForeground,
                opacity: 0.55,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              Pegel Speyer
            </Text>
            {statusLabel && (
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 99,
                  backgroundColor: statusColor,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontFamily: 'SpaceGrotesk_700Bold',
                    color: '#FFFFFF',
                    letterSpacing: 2,
                  }}
                >
                  {statusLabel}
                </Text>
              </View>
            )}
          </View>

          {/* Big number */}
          {stateLoading ? (
            <ActivityIndicator
              size="large"
              color={colors.primaryForeground}
              style={{ marginVertical: 8 }}
            />
          ) : stateError ? (
            <Text
              style={{
                fontSize: 48,
                fontFamily: 'SpaceGrotesk_400Regular',
                color: colors.primaryForeground,
                opacity: 0.3,
              }}
            >
              —
            </Text>
          ) : (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 56,
                  fontFamily: 'SpaceGrotesk_700Bold',
                  color: colors.primaryForeground,
                  lineHeight: 62,
                  includeFontPadding: false,
                }}
              >
                {currentCm ?? '—'}
              </Text>
              {currentCm !== null && (
                <Text
                  style={{
                    fontSize: 22,
                    fontFamily: 'SpaceGrotesk_400Regular',
                    color: colors.primaryForeground,
                    opacity: 0.55,
                    marginBottom: 6,
                  }}
                >
                  cm
                </Text>
              )}
            </View>
          )}

          {/* Footer row: timestamp + threshold */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontFamily: 'SpaceGrotesk_400Regular',
                color: colors.primaryForeground,
                opacity: 0.5,
              }}
            >
              {state?.last_pegel_time
                ? formatDateTime(state.last_pegel_time)
                : 'Kein Messwert'}
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontFamily: 'SpaceGrotesk_500Medium',
                color: colors.primaryForeground,
                opacity: 0.5,
              }}
            >
              Schwelle: {threshold} cm
            </Text>
          </View>
        </View>

        {/* ── Chart Card ── */}
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: colors.radius,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 12,
          }}
        >
          {/* Header row: label + range tabs */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontFamily: 'SpaceGrotesk_600SemiBold',
                color: colors.mutedForeground,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              Verlauf
            </Text>

            {/* Range selector tabs */}
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: colors.muted,
                borderRadius: 8,
                padding: 2,
                gap: 2,
              }}
            >
              {TIME_RANGE_OPTIONS.map(({ label, value }) => {
                const active = chartRange === value;
                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => handleRangeChange(value)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: active ? colors.card : 'transparent',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: active
                          ? 'SpaceGrotesk_600SemiBold'
                          : 'SpaceGrotesk_400Regular',
                        color: active ? colors.foreground : colors.mutedForeground,
                      }}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {stateLoading ? (
            <View style={{ height: 80, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : stateError ? (
            <TouchableOpacity
              style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}
              onPress={() => void refetchState()}
            >
              <Feather name="alert-circle" size={20} color={colors.destructive} />
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.destructive,
                }}
              >
                Fehler beim Laden
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: colors.muted,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 8,
                  marginTop: 4,
                }}
              >
                <Feather name="refresh-cw" size={13} color={colors.foreground} />
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: 'SpaceGrotesk_500Medium',
                    color: colors.foreground,
                  }}
                >
                  Erneut versuchen
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <PegelChart
              history={filterHistory(state?.history ?? [], chartRange)}
              threshold={threshold}
            />
          )}
        </View>

        {/* ── Meta Card ── */}
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: colors.radius,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {/* Schwellenwert */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 13,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Feather name="sliders" size={13} color={colors.mutedForeground} />
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  color: colors.mutedForeground,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                }}
              >
                Schwellenwert
              </Text>
            </View>
            <Text
              style={{
                fontSize: 13,
                fontFamily: 'SpaceGrotesk_600SemiBold',
                color: colors.foreground,
              }}
            >
              {threshold} cm
            </Text>
          </View>

          <View style={{ height: 1, backgroundColor: colors.border }} />

          {/* Letzter Tagesbericht */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 13,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Feather name="calendar" size={13} color={colors.mutedForeground} />
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  color: colors.mutedForeground,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                }}
              >
                Letzter Bericht
              </Text>
            </View>
            {stateLoading ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  color: colors.foreground,
                }}
              >
                {state?.last_daily_report_date
                  ? new Date(state.last_daily_report_date).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })
                  : '—'}
              </Text>
            )}
          </View>

          <View style={{ height: 1, backgroundColor: colors.border }} />

          {/* News gesamt */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 13,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Feather name="list" size={13} color={colors.mutedForeground} />
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  color: colors.mutedForeground,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                }}
              >
                News gesamt
              </Text>
            </View>
            {trefferLoading ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  color: colors.foreground,
                }}
              >
                {treffer?.count ?? 0}
              </Text>
            )}
          </View>
        </View>

        {/* ── Wächter-Status Card ── */}
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: colors.radius,
            padding: 16,
            borderWidth: 1,
            borderColor: isStale || neverRan ? colors.alarm : colors.border,
            gap: 10,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontFamily: 'SpaceGrotesk_600SemiBold',
                color: colors.mutedForeground,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              Wächter
            </Text>
            {isStale && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: colors.alarm + '22',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 99,
                }}
              >
                <Feather name="alert-triangle" size={11} color={colors.alarm} />
                <Text
                  style={{
                    fontSize: 10,
                    fontFamily: 'SpaceGrotesk_600SemiBold',
                    color: colors.alarm,
                    letterSpacing: 1,
                  }}
                >
                  INAKTIV
                </Text>
              </View>
            )}
          </View>

          {/* Last run + rss_new_count */}
          {statusLoading ? (
            <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />
          ) : (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather
                  name="clock"
                  size={14}
                  color={isStale || neverRan ? colors.alarm : colors.mutedForeground}
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: 'SpaceGrotesk_400Regular',
                    color: isStale || neverRan ? colors.alarm : colors.foreground,
                  }}
                >
                  Letzter Lauf:{' '}
                  <Text
                    style={{
                      fontFamily: 'SpaceGrotesk_600SemiBold',
                      color: isStale || neverRan ? colors.alarm : colors.foreground,
                    }}
                  >
                    {neverRan ? 'Nie' : formatRelativeTime(lastRunAt)}
                  </Text>
                </Text>
              </View>

              {/* Neue Treffer (rss_new_count) */}
              {!neverRan && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontFamily: 'SpaceGrotesk_400Regular',
                      color: colors.mutedForeground,
                    }}
                  >
                    Neue Treffer
                  </Text>
                  <Text
                    style={{
                      fontSize: 15,
                      fontFamily: 'SpaceGrotesk_700Bold',
                      color: rssNewCount > 0 ? colors.accent : colors.foreground,
                    }}
                  >
                    {rssNewCount}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Never ran warning */}
          {neverRan && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                backgroundColor: colors.alarm + '18',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              <Feather name="alert-triangle" size={13} color={colors.alarm} />
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.alarm,
                }}
              >
                Wächter wurde noch nicht ausgeführt.
              </Text>
            </View>
          )}

          {/* Last error (only if present) */}
          {lastError ? (
            <View
              style={{
                backgroundColor: colors.destructive + '18',
                borderRadius: 8,
                padding: 10,
                gap: 4,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="x-circle" size={13} color={colors.destructive} />
                <Text
                  style={{
                    fontSize: 10,
                    fontFamily: 'SpaceGrotesk_600SemiBold',
                    color: colors.destructive,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                  }}
                >
                  Letzter Fehler
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.destructive,
                  opacity: 0.85,
                }}
                numberOfLines={3}
              >
                {lastError}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── NEWS Card ── */}
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: colors.radius,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 12,
          }}
        >
          {/* Section header – anklickbar zum Auf-/Zuklappen */}
          <TouchableOpacity
            onPress={() => setNewsOpen(o => !o)}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontFamily: 'SpaceGrotesk_600SemiBold',
                color: colors.mutedForeground,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              NEWS
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {treffer != null && (
                <View
                  style={{
                    backgroundColor: colors.muted,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 99,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: 'SpaceGrotesk_600SemiBold',
                      color: colors.accent,
                    }}
                  >
                    {treffer.count}
                  </Text>
                </View>
              )}
              <Feather
                name={newsOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.mutedForeground}
              />
            </View>
          </TouchableOpacity>

          {/* Treffer content – nur sichtbar wenn aufgeklappt */}
          {newsOpen && (trefferLoading ? (
            <View style={{ height: 60, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : trefferError ? (
            <TouchableOpacity
              style={{ alignItems: 'center', gap: 8, paddingVertical: 16 }}
              onPress={() => void refetchTreffer()}
            >
              <Feather name="alert-circle" size={20} color={colors.destructive} />
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.destructive,
                }}
              >
                Fehler beim Laden
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: colors.muted,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 8,
                  marginTop: 4,
                }}
              >
                <Feather name="refresh-cw" size={13} color={colors.foreground} />
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: 'SpaceGrotesk_500Medium',
                    color: colors.foreground,
                  }}
                >
                  Erneut versuchen
                </Text>
              </View>
            </TouchableOpacity>
          ) : !treffer?.urls.length ? (
            <View style={{ alignItems: 'center', paddingVertical: 16, gap: 6 }}>
              <Feather name="inbox" size={20} color={colors.mutedForeground} />
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.mutedForeground,
                }}
              >
                Noch keine News
              </Text>
            </View>
          ) : (
            treffer.urls.slice().reverse().slice(0, 10).map((url: string, i: number, arr: string[]) => {
              const isLast = i === arr.length - 1;
              return (
                <TouchableOpacity
                  key={`${url}-${i}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 10,
                    borderBottomWidth: isLast ? 0 : 1,
                    borderBottomColor: colors.border,
                  }}
                  onPress={() => void Linking.openURL(url)}
                  activeOpacity={0.65}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: 'SpaceGrotesk_500Medium',
                        color: colors.foreground,
                      }}
                      numberOfLines={1}
                    >
                      {getDomain(url)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: 'SpaceGrotesk_400Regular',
                        color: colors.mutedForeground,
                        marginTop: 1,
                      }}
                      numberOfLines={1}
                    >
                      {getPathAndQuery(url)}
                    </Text>
                  </View>
                  <Feather
                    name="external-link"
                    size={14}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              );
            })
          ))}
        </View>

        {/* ── Vereine Card ── */}
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: colors.radius,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 12,
          }}
        >
          {/* Section header – anklickbar zum Auf-/Zuklappen */}
          <TouchableOpacity
            onPress={() => setVereineOpen(o => !o)}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontFamily: 'SpaceGrotesk_600SemiBold',
                color: colors.mutedForeground,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              Vereine
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {clubsData != null && clubsData.count > 0 && (
                <View
                  style={{
                    backgroundColor: colors.muted,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 99,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: 'SpaceGrotesk_600SemiBold',
                      color: colors.accent,
                    }}
                  >
                    {clubsData.count}
                  </Text>
                </View>
              )}
              <Feather
                name={vereineOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.mutedForeground}
              />
            </View>
          </TouchableOpacity>

          {/* Clubs content – nur sichtbar wenn aufgeklappt */}
          {vereineOpen && (clubsLoading ? (
            <View style={{ height: 60, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : clubsError ? (
            <TouchableOpacity
              style={{ alignItems: 'center', gap: 8, paddingVertical: 16 }}
              onPress={() => void refetchClubs()}
            >
              <Feather name="alert-circle" size={20} color={colors.destructive} />
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.destructive,
                }}
              >
                Fehler beim Laden
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: colors.muted,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 8,
                  marginTop: 4,
                }}
              >
                <Feather name="refresh-cw" size={13} color={colors.foreground} />
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: 'SpaceGrotesk_500Medium',
                    color: colors.foreground,
                  }}
                >
                  Erneut versuchen
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            (() => {
              // Zeige alle überwachten Vereine; Meldungen werden drunter eingeblendet
              const knownClubs = clubsData?.known_clubs ?? [];
              const findings = clubsData?.clubs ?? [];

              // Für schnellen Domain-Abgleich
              const domainOf = (u: string) => {
                try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
              };

              // Letzten Treffer pro Domain (findings sind chronologisch, letzter = neuester)
              const latestByDomain = new Map<string, typeof findings[0]>();
              for (const f of findings) {
                const d = domainOf(f.url);
                latestByDomain.set(d, f);
              }

              type RowItem = { name: string; icon: string; url: string };
              const rows: RowItem[] = knownClubs.length > 0 ? knownClubs : findings.slice().reverse().slice(0, 10).map((f: WaechterClubHit) => ({
                name: f.name, icon: f.icon, url: f.url,
              }));

              return rows.map((club: RowItem, i: number) => {
                const finding = latestByDomain.get(domainOf(club.url));
                const isLast = i === rows.length - 1;
                return (
                  <TouchableOpacity
                    key={club.url}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 10,
                      paddingVertical: 10,
                      borderBottomWidth: isLast ? 0 : 1,
                      borderBottomColor: colors.border,
                    }}
                    onPress={() => void Linking.openURL(club.url)}
                    activeOpacity={0.65}
                  >
                    {/* Icon badge */}
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: finding ? colors.primary + '22' : colors.muted,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>{club.icon}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontFamily: 'SpaceGrotesk_600SemiBold',
                          color: colors.foreground,
                        }}
                        numberOfLines={1}
                      >
                        {club.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: 'SpaceGrotesk_400Regular',
                          color: finding ? colors.mutedForeground : colors.mutedForeground + '88',
                          marginTop: 2,
                          lineHeight: 16,
                        }}
                        numberOfLines={2}
                      >
                        {finding ? finding.snippet : 'Keine aktuellen Meldungen'}
                      </Text>
                    </View>
                    <Feather
                      name="external-link"
                      size={14}
                      color={colors.mutedForeground}
                      style={{ marginTop: 2 }}
                    />
                  </TouchableOpacity>
                );
              });
            })()
          ))}
        </View>

        {/* ── NfB-Meldungen Card ── */}
        <View
          ref={nfbCardRef}
          style={{
            backgroundColor: colors.card,
            borderRadius: colors.radius,
            padding: 16,
            borderWidth: 1,
            borderColor: nfbNewCount > 0 ? colors.accent : colors.border,
            gap: 12,
          }}
        >
          {/* Section header – anklickbar zum Auf-/Zuklappen */}
          <TouchableOpacity
            onPress={() => { if (!nfbKmEdit) setNfbOpen(o => !o); }}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  color: colors.mutedForeground,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                }}
              >
                NfB
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {nfbNewCount > 0 && (
                <View
                  style={{
                    backgroundColor: colors.accent,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 99,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: 'SpaceGrotesk_700Bold',
                      color: '#FFFFFF',
                      letterSpacing: 1,
                    }}
                  >
                    {nfbNewCount} NEU
                  </Text>
                </View>
              )}
              {nfbData != null && nfbData.count > 0 && nfbNewCount === 0 && (
                <View
                  style={{
                    backgroundColor: colors.muted,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 99,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: 'SpaceGrotesk_600SemiBold',
                      color: colors.accent,
                    }}
                  >
                    {nfbData.count}
                  </Text>
                </View>
              )}
              <Feather
                name={nfbOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={nfbNewCount > 0 ? colors.accent : colors.mutedForeground}
              />
            </View>
          </TouchableOpacity>

          {/* km-Bereich – immer sichtbar, editierbar */}
          {nfbKmEdit ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.muted,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
                km
              </Text>
              <TextInput
                value={nfbKmInputVon}
                onChangeText={setNfbKmInputVon}
                keyboardType="number-pad"
                returnKeyType="next"
                onSubmitEditing={() => nfbKmBisRef.current?.focus()}
                style={{
                  fontSize: 13,
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  color: colors.foreground,
                  backgroundColor: colors.card,
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  minWidth: 52,
                  textAlign: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                selectTextOnFocus
              />
              <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>–</Text>
              <TextInput
                ref={nfbKmBisRef}
                value={nfbKmInputBis}
                onChangeText={setNfbKmInputBis}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={applyNfbKm}
                style={{
                  fontSize: 13,
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  color: colors.foreground,
                  backgroundColor: colors.card,
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  minWidth: 52,
                  textAlign: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                selectTextOnFocus
              />
              <TouchableOpacity
                onPress={applyNfbKm}
                style={{
                  marginLeft: 4,
                  backgroundColor: colors.primary,
                  borderRadius: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Feather name="check" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setNfbKmEdit(true)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                alignSelf: 'flex-start',
                backgroundColor: colors.muted,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Feather name="map-pin" size={12} color={colors.mutedForeground} />
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: 'SpaceGrotesk_500Medium',
                  color: colors.mutedForeground,
                }}
              >
                km {nfbKmVon}–{nfbKmBis}
              </Text>
              <Feather name="edit-2" size={11} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}

          {/* NfB content – nur sichtbar wenn aufgeklappt */}
          {nfbOpen && (nfbLoading ? (
            <View style={{ height: 60, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : nfbError ? (
            <TouchableOpacity
              style={{ alignItems: 'center', gap: 8, paddingVertical: 16 }}
              onPress={() => void refetchNfb()}
            >
              <Feather name="alert-circle" size={20} color={colors.destructive} />
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.destructive,
                }}
              >
                Fehler beim Laden
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: colors.muted,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 8,
                  marginTop: 4,
                }}
              >
                <Feather name="refresh-cw" size={13} color={colors.foreground} />
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: 'SpaceGrotesk_500Medium',
                    color: colors.foreground,
                  }}
                >
                  Erneut versuchen
                </Text>
              </View>
            </TouchableOpacity>
          ) : !nfbData?.meldungen.length ? (
            <View style={{ alignItems: 'center', paddingVertical: 16, gap: 6 }}>
              <Feather name="check-circle" size={20} color={colors.mutedForeground} />
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.mutedForeground,
                }}
              >
                Keine aktiven Meldungen
              </Text>
            </View>
          ) : (
            nfbData.meldungen.map((m: NfbMeldung, i: number) => {
              const isLast = i === nfbData.meldungen.length - 1;
              const kmRange =
                m.km_von != null && m.km_bis != null
                  ? `km ${m.km_von}–${m.km_bis}`
                  : m.km_von != null
                    ? `km ${m.km_von}`
                    : null;
              const validity =
                m.gueltig_ab || m.gueltig_bis
                  ? [m.gueltig_ab, m.gueltig_bis].filter(Boolean).join(' – ')
                  : null;

              return (
                <View
                  key={m.nfb_id}
                  style={{
                    paddingVertical: 10,
                    borderBottomWidth: isLast ? 0 : 1,
                    borderBottomColor: colors.border,
                    gap: 6,
                  }}
                >
                  {/* Top row: NfB-ID + "NEU" badge */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: 'SpaceGrotesk_500Medium',
                        color: colors.mutedForeground,
                      }}
                    >
                      {m.nfb_id}
                    </Text>
                    {m.is_new && (
                      <View
                        style={{
                          backgroundColor: colors.accent + '28',
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                          borderRadius: 99,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontFamily: 'SpaceGrotesk_700Bold',
                            color: colors.accent,
                            letterSpacing: 1.5,
                          }}
                        >
                          NEU
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Title */}
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: 'SpaceGrotesk_600SemiBold',
                      color: m.is_new ? colors.foreground : colors.foreground,
                      lineHeight: 18,
                    }}
                  >
                    {m.titel}
                  </Text>

                  {/* Meta row: km range + validity */}
                  {(kmRange || validity) && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {kmRange && (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                          <Text
                            style={{
                              fontSize: 11,
                              fontFamily: 'SpaceGrotesk_400Regular',
                              color: colors.mutedForeground,
                            }}
                          >
                            {kmRange}
                          </Text>
                        </View>
                      )}
                      {validity && (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Feather name="calendar" size={11} color={colors.mutedForeground} />
                          <Text
                            style={{
                              fontSize: 11,
                              fontFamily: 'SpaceGrotesk_400Regular',
                              color: colors.mutedForeground,
                            }}
                          >
                            {validity}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* ELWIS link */}
                  {m.url && (
                    <TouchableOpacity
                      onPress={() => void Linking.openURL(m.url!)}
                      activeOpacity={0.65}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}
                    >
                      <Feather name="external-link" size={11} color={colors.primary} />
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: 'SpaceGrotesk_500Medium',
                          color: colors.primary,
                        }}
                        numberOfLines={1}
                      >
                        ELWIS
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

type NfbMeldung = {
  nfb_id: string; titel: string; km_von: number | null; km_bis: number | null;
  gueltig_ab: string | null; gueltig_bis: string | null; url: string | null;
  first_seen: string; is_new: boolean;
};

type WaechterClubHit = { name: string; icon: string; url: string; snippet: string; dedup_key: string; seen_at: string };
