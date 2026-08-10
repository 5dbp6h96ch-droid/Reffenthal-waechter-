/**
 * redesign.tsx – Testversion des neuen UI-Designs für R(h)einschiffer.
 *
 * ⚠️  TESTVERSION – KEIN MERGE in die Produktionsversion (index.tsx).
 *
 * Ziele:
 *  · Moderne, saubere Mobile-Oberfläche optimiert für iPhone
 *  · Alle bestehenden Hooks, Datenquellen und Komponenten wiederverwendet
 *  · index.tsx bleibt vollständig unverändert
 *
 * Wiederverwendete Komponenten / Hooks:
 *  · useGetWaechterState / Treffer / Status / Clubs  (@workspace/api-client-react)
 *  · useQuery für NfB und MCK  (@tanstack/react-query)
 *  · useColors, useNfbNotifications, useSinceLastVisit  (@/hooks/*)
 *  · RheinKarte  (@/components/RheinKarte)
 *  · PegelChart  (lokale Kopie aus index.tsx – gleicher Code)
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  Linking, Platform, Dimensions, ActivityIndicator,
  Animated, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, {
  Path, Line as SvgLine, Circle,
  Text as SvgText, Defs,
  LinearGradient as SvgGradient, Stop,
} from 'react-native-svg';
import {
  useGetWaechterState,
  useGetWaechterTreffer,
  useGetWaechterStatus,
  useGetWaechterClubs,
} from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import type { NfbList } from '@workspace/api-client-react';
import { useNfbNotifications } from '@/hooks/useNfbNotifications';
import { useColors } from '@/hooks/useColors';
import { useSinceLastVisit } from '@/hooks/useSinceLastVisit';
import RheinKarte from '@/components/RheinKarte';

// ── Lokale Typ-Aliase (identisch mit index.tsx) ──────────────────────────────
type TimeRange = 7 | 30 | 90;
type MckData = {
  source: string; petrol: number | null; diesel: number | null;
  unit: string; sourceDate?: string | null; checkedAt?: string | null; error?: string;
};
type NfbMeldung = {
  nfb_id: string; titel: string; km_von: number | null; km_bis: number | null;
  gueltig_ab: string | null; gueltig_bis: string | null; url: string | null;
  first_seen: string; is_new: boolean;
};

// ── Konstanten ────────────────────────────────────────────────────────────────
const TIME_RANGE_OPTIONS: { label: string; value: TimeRange }[] = [
  { label: '7 T', value: 7 },
  { label: '30 T', value: 30 },
  { label: '3 M', value: 90 },
];
const STORAGE_KEY  = 'pegel_chart_range';
const NFB_KM_KEY   = 'nfb_km_range';
const NFB_KM_VON   = 1;
const NFB_KM_BIS   = 900;

// ── Chart-Konstanten (identisch mit index.tsx) ───────────────────────────────
const SCREEN_W   = Dimensions.get('window').width;
const CARD_PAD   = 16;
const CHART_W    = SCREEN_W - CARD_PAD * 2 - 32;
const CHART_H    = 140;
const PAD        = { top: 10, right: 36, bottom: 26, left: 38 };

// ── Hilfsfunktionen (identisch mit index.tsx) ─────────────────────────────────
function filterHistory(
  history: { cm: number; ts: string }[],
  days: TimeRange,
): { cm: number; ts: string }[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return history.filter((h) => new Date(h.ts).getTime() >= cutoff);
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Nie';
  const diffMs  = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return 'Gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `vor ${diffH} Std.`;
  const diffD = Math.floor(diffH / 24);
  return `vor ${diffD} Tag${diffD === 1 ? '' : 'en'}`;
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// ── PegelChart (identische Kopie aus index.tsx) ───────────────────────────────
interface PegelChartProps {
  history: { cm: number; ts: string }[];
  threshold: number;
}
function PegelChart({ history, threshold }: PegelChartProps) {
  const colors = useColors();

  if (history.length < 2) {
    return (
      <View style={{
        height: 80, alignItems: 'center', justifyContent: 'center', gap: 8,
        borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, borderColor: colors.border,
      }}>
        <Feather name="bar-chart-2" size={22} color={colors.mutedForeground} />
        <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
          Keine Verlaufsdaten
        </Text>
      </View>
    );
  }

  const raw  = [...history];
  const step = Math.max(1, Math.floor(raw.length / 200));
  const data = raw.filter((_, i) => i % step === 0);
  const cmValues = data.map((d) => d.cm);
  const dataMin  = Math.min(...cmValues);
  const dataMax  = Math.max(...cmValues);
  const padding  = Math.max(10, (dataMax - dataMin) * 0.12);
  const minCm    = Math.min(dataMin, threshold) - padding;
  const maxCm    = Math.max(dataMax, threshold) + padding;
  const range    = maxCm - minCm || 1;
  const plotW    = CHART_W - PAD.left - PAD.right;
  const plotH    = CHART_H - PAD.top  - PAD.bottom;
  const n        = data.length - 1;
  const toX = (i: number) => PAD.left + (i / (n || 1)) * plotW;
  const toY = (cm: number) => PAD.top + plotH - ((cm - minCm) / range) * plotH;
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.cm).toFixed(1)}`).join(' ');
  const baseY    = (PAD.top + plotH).toFixed(1);
  const areaPath = linePath + ` L${toX(n).toFixed(1)},${baseY} L${PAD.left.toFixed(1)},${baseY} Z`;
  const threshY  = toY(threshold);
  const lastCm   = data[data.length - 1].cm;
  const isAlarm  = lastCm < threshold;
  const lineColor = isAlarm ? colors.alarm : colors.safe;
  const yTicks   = [Math.round(maxCm - padding), Math.round((minCm + maxCm) / 2), Math.round(minCm + padding)];
  const startMs  = new Date(data[0].ts).getTime();
  const endMs    = new Date(data[data.length - 1].ts).getTime();
  const totalMs  = endMs - startMs || 1;
  const totalDays = totalMs / 86_400_000;
  const xTicks   = Array.from({ length: 5 }, (_, i) => {
    const frac = i / 4;
    const ms   = startMs + frac * totalMs;
    const x    = PAD.left + frac * plotW;
    const d    = new Date(ms);
    const label = totalDays <= 35
      ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
      : d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
    return { x, label, anchor: i === 0 ? 'start' : i === 4 ? 'end' : 'middle' };
  });

  return (
    <Svg width={CHART_W} height={CHART_H}>
      <Defs>
        <SvgGradient id="rdGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lineColor} stopOpacity="0.25" />
          <Stop offset="1" stopColor={lineColor} stopOpacity="0.01" />
        </SvgGradient>
      </Defs>
      {yTicks.map((cm) => (
        <SvgText key={cm} x={PAD.left - 6} y={toY(cm) + 4} fontSize={9}
          fill={colors.mutedForeground} textAnchor="end">{cm}</SvgText>
      ))}
      <SvgLine x1={PAD.left} y1={threshY} x2={CHART_W - PAD.right} y2={threshY}
        stroke={colors.accent} strokeWidth={1} strokeDasharray="5,3" strokeOpacity={0.85} />
      <SvgText x={CHART_W - PAD.right - 2} y={threshY - 3} fontSize={8}
        fill={colors.accent} textAnchor="end" opacity={0.85}>{threshold} cm</SvgText>
      <Path d={areaPath} fill="url(#rdGrad)" />
      <Path d={linePath} stroke={lineColor} strokeWidth={2} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={toX(n)} cy={toY(lastCm)} r={4} fill={lineColor} />
      <Circle cx={toX(n)} cy={toY(lastCm)} r={7} fill={lineColor} fillOpacity={0.2} />
      {xTicks.map((tick, i) => (
        <SvgText key={i} x={tick.x} y={CHART_H - 4} fontSize={8}
          fill={colors.mutedForeground}
          textAnchor={tick.anchor as 'start' | 'middle' | 'end'} opacity={0.75}>
          {tick.label}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Hilfskomponente: Abschnitts-Überschrift ───────────────────────────────────
function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text style={{
      fontSize: 10, fontFamily: 'SpaceGrotesk_600SemiBold',
      color, letterSpacing: 1.5, textTransform: 'uppercase',
    }}>
      {label}
    </Text>
  );
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function RedesignScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const topPad  = Platform.OS === 'web' ? 67 : insets.top;
  const botPad  = Platform.OS === 'web' ? 34 : insets.bottom;

  // Pegelverlauf-Zeitraum (persistiert)
  const [chartRange, setChartRange] = useState<TimeRange>(30);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === '7' || val === '30' || val === '90')
        setChartRange(Number(val) as TimeRange);
    }).catch(() => {});
  }, []);
  const handleRangeChange = (range: TimeRange) => {
    setChartRange(range);
    AsyncStorage.setItem(STORAGE_KEY, String(range)).catch(() => {});
  };

  // NfB km-Bereich (persistiert)
  const [nfbKmVon, setNfbKmVon] = useState(NFB_KM_VON);
  const [nfbKmBis, setNfbKmBis] = useState(NFB_KM_BIS);
  useEffect(() => {
    AsyncStorage.getItem(NFB_KM_KEY).then((val) => {
      if (val) {
        const p = JSON.parse(val) as { von: number; bis: number };
        if (typeof p.von === 'number' && typeof p.bis === 'number') {
          setNfbKmVon(p.von);
          setNfbKmBis(p.bis);
        }
      }
    }).catch(() => {});
  }, []);

  // HVZ Cache-Busting (alle 5 Min)
  const [hvzTs, setHvzTs] = useState(() => Math.floor(Date.now() / 300_000));
  useEffect(() => {
    const t = setInterval(() => setHvzTs(Math.floor(Date.now() / 300_000)), 300_000);
    return () => clearInterval(t);
  }, []);

  // ── Daten-Hooks (identisch mit index.tsx) ──────────────────────────────────
  const {
    data: state, isLoading: stateLoading, isError: stateError,
    refetch: refetchState, isRefetching: stateRefetching,
  } = useGetWaechterState();

  const {
    data: treffer, isLoading: trefferLoading,
    refetch: refetchTreffer, isRefetching: trefferRefetching,
  } = useGetWaechterTreffer();

  const {
    data: waechterStatus, isLoading: statusLoading,
    refetch: refetchStatus, isRefetching: statusRefetching,
  } = useGetWaechterStatus();

  const {
    data: clubsData, isLoading: clubsLoading,
    refetch: refetchClubs, isRefetching: clubsRefetching,
  } = useGetWaechterClubs();

  const nfbApiBase = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : '';

  const {
    data: nfbData, isLoading: nfbLoading, isError: nfbError,
    refetch: refetchNfb, isRefetching: nfbRefetching,
    dataUpdatedAt: nfbDataUpdatedAt,
  } = useQuery<NfbList>({
    queryKey: ['nfb', nfbKmVon, nfbKmBis],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ km_von: String(nfbKmVon), km_bis: String(nfbKmBis) });
      const res = await fetch(`${nfbApiBase}/api/nfb?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<NfbList>;
    },
    staleTime: 60_000, refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false, retry: 2,
  });

  const {
    data: mckData, isLoading: mckLoading, isError: mckIsError,
    refetch: refetchMck, isRefetching: mckRefetching,
  } = useQuery<MckData>({
    queryKey: ['mck'],
    queryFn: async () => {
      const res = await fetch(`${nfbApiBase}/api/mck`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<MckData>;
    },
    staleTime: 60 * 60_000, refetchInterval: 60 * 60_000,
    refetchIntervalInBackground: false, retry: 2,
  });

  // ── Abgeleitete Werte ──────────────────────────────────────────────────────
  const currentCm  = state?.last_pegel_cm ?? null;
  const threshold  = state?.threshold_cm ?? 225;
  const isAlarm    = currentCm !== null && currentCm < threshold;
  const isSafe     = currentCm !== null && currentCm >= threshold;
  const statusColor = isAlarm ? colors.alarm : isSafe ? colors.safe : colors.mutedForeground;

  const nfbNewCount = nfbData?.meldungen.filter(
    (m: NfbMeldung) =>
      m.is_new &&
      (m.km_von == null || m.km_bis == null ||
        (m.km_von <= nfbKmBis && m.km_bis >= nfbKmVon)),
  ).length ?? 0;

  const lastRunAt   = waechterStatus?.last_run_at ?? null;
  const lastRunMs   = lastRunAt ? Date.now() - new Date(lastRunAt).getTime() : null;
  const isStale     = lastRunMs !== null && lastRunMs > 2 * 60 * 60 * 1000;
  const neverRan    = !statusLoading && !lastRunAt;
  const rssNewCount = waechterStatus?.rss_new_count ?? 0;

  // Seit deinem letzten Besuch
  const sinceLastVisitChanges = useSinceLastVisit(
    nfbData?.meldungen,
    !nfbLoading && !nfbError && nfbData !== undefined,
    currentCm,
    !stateLoading && !stateError && state !== undefined,
    mckData,
    !mckLoading && !mckIsError && mckData !== undefined,
  );

  // NfB Notifications
  const { notifEnabled: nfbNotifEnabled, osPermission: nfbOsPermission, toggleNotifEnabled: toggleNfbNotif } =
    useNfbNotifications(nfbData?.meldungen, nfbKmVon, nfbKmBis);

  // ── Refresh ────────────────────────────────────────────────────────────────
  const isRefreshing = stateRefetching || trefferRefetching || statusRefetching ||
    clubsRefetching || nfbRefetching || mckRefetching;

  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (isRefreshing) {
      spinAnim.setValue(0);
      spinLoop.current = Animated.loop(Animated.timing(spinAnim, { toValue: 1, duration: 700, useNativeDriver: true }));
      spinLoop.current.start();
    } else { spinLoop.current?.stop(); spinAnim.setValue(0); }
  }, [isRefreshing, spinAnim]);
  const spinInterpolate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const scrollRef = useRef<ScrollView>(null);
  const onRefresh = useCallback(() => {
    void refetchState(); void refetchTreffer(); void refetchStatus();
    void refetchClubs(); void refetchNfb(); void refetchMck();
  }, [refetchState, refetchTreffer, refetchStatus, refetchClubs, refetchNfb, refetchMck]);

  // ── Daten-Aufbereitung ─────────────────────────────────────────────────────
  const chartHistory = useMemo(
    () => filterHistory((state as { history?: { cm: number; ts: string }[] })?.history ?? [], chartRange),
    [state, chartRange],
  );

  const newsItems = useMemo(
    () => (treffer?.urls ?? []).slice().reverse().slice(0, 10),
    [treffer],
  );

  const knownClubs = useMemo(() => clubsData?.known_clubs ?? [], [clubsData]);

  const nfbMeldungen: NfbMeldung[] = useMemo(
    () => (nfbData?.meldungen ?? []).filter((m: NfbMeldung) => !('expired' in m && (m as NfbMeldung & { expired?: boolean }).expired)),
    [nfbData],
  );

  // ── Card-Style-Helfer ─────────────────────────────────────────────────────
  const card = (extra?: object) => ({
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14 as number,
    ...extra,
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: topPad + 8,
          paddingBottom: botPad + 40,
          paddingHorizontal: 16,
          gap: 16,
        }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh}
            tintColor={colors.primary} colors={[colors.primary]} />
        }
        showsVerticalScrollIndicator={false}
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={{ alignItems: 'center', paddingVertical: 8, position: 'relative' }}>
          <Image
            source={require('../assets/images/icon.png')}
            style={{ width: 72, height: 72, marginBottom: 8 }}
            resizeMode="contain"
          />
          <Text style={{
            fontSize: 28, fontFamily: 'SpaceGrotesk_700Bold',
            color: colors.primary, textAlign: 'center',
          }}>
            R(h)einschiffer
          </Text>
          <Text style={{
            fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular',
            color: colors.mutedForeground, textAlign: 'center', marginTop: 2,
          }}>
            Pegelvorhersage und News
          </Text>

          {/* Refresh-Button */}
          <TouchableOpacity
            onPress={onRefresh}
            disabled={isRefreshing}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.6}
            style={{ position: 'absolute', right: 0, top: 10 }}
          >
            <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
              <Feather name="refresh-cw" size={18}
                color={isRefreshing ? colors.primary : colors.mutedForeground} />
            </Animated.View>
          </TouchableOpacity>
        </View>

        {/* ── Seit deinem letzten Besuch ──────────────────────────────────── */}
        {sinceLastVisitChanges.length > 0 && (
          <View style={{
            backgroundColor: colors.secondary, borderRadius: 14,
            borderWidth: 1, borderColor: colors.border,
            paddingHorizontal: 16, paddingVertical: 12, gap: 8,
          }}>
            <Text style={{
              fontSize: 10, fontFamily: 'SpaceGrotesk_500Medium',
              color: colors.mutedForeground, letterSpacing: 1.5, textTransform: 'uppercase',
            }}>
              🕐 Seit deinem letzten Besuch
            </Text>
            {sinceLastVisitChanges
              .slice().sort((a, b) => {
                const O: Record<string, number> = { nfb: 0, pegel: 1, sperrung: 2, mck: 3 };
                return (O[a.kind] ?? 99) - (O[b.kind] ?? 99);
              })
              .map((change) => {
                if (change.kind === 'nfb') return (
                  <Text key="nfb" style={{ fontSize: 14, fontFamily: 'SpaceGrotesk_500Medium', color: colors.foreground }}>
                    🟠 {change.newCount} {change.newCount === 1 ? 'neue NfB' : 'neue NfBs'}
                  </Text>
                );
                if (change.kind === 'pegel') {
                  const up = change.deltaCm > 0;
                  return (
                    <Text key="pegel" style={{ fontSize: 14, fontFamily: 'SpaceGrotesk_500Medium', color: colors.foreground }}>
                      {up ? '📈' : '📉'} Pegel Speyer {up ? '+' : ''}{change.deltaCm} cm
                      {'  '}<Text style={{ fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground, fontSize: 12 }}>
                        {change.oldCm} → {change.newCm} cm
                      </Text>
                    </Text>
                  );
                }
                if (change.kind === 'sperrung') return (
                  <Text key="sperrung" style={{ fontSize: 14, fontFamily: 'SpaceGrotesk_500Medium', color: colors.foreground }}>
                    🚧 {change.count} {change.count === 1 ? 'neue Sperrmeldung' : 'neue Sperrmeldungen'}
                  </Text>
                );
                if (change.kind === 'mck') {
                  const lines: string[] = [];
                  if (change.oldPetrol !== null && change.newPetrol !== null && change.oldPetrol !== change.newPetrol)
                    lines.push(`Benzin ${change.oldPetrol.toFixed(2)} → ${change.newPetrol.toFixed(2)} €/l`);
                  if (change.oldDiesel !== null && change.newDiesel !== null && change.oldDiesel !== change.newDiesel)
                    lines.push(`Diesel ${change.oldDiesel.toFixed(2)} → ${change.newDiesel.toFixed(2)} €/l`);
                  if (lines.length === 0) return null;
                  return (
                    <Text key="mck" style={{ fontSize: 14, fontFamily: 'SpaceGrotesk_500Medium', color: colors.foreground }}>
                      ⛽ {lines.join(' · ')}
                    </Text>
                  );
                }
                return null;
              })}
          </View>
        )}

        {/* ── Pegelstand ──────────────────────────────────────────────────── */}
        <View style={card()}>
          <SectionLabel label="Pegelstand · Speyer" color={colors.mutedForeground} />

          {/* Großer Pegelwert */}
          {stateLoading ? (
            <View style={{ height: 56, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : stateError ? (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}
              onPress={() => void refetchState()}
            >
              <Feather name="alert-circle" size={18} color={colors.destructive} />
              <Text style={{ fontSize: 14, fontFamily: 'SpaceGrotesk_500Medium', color: colors.destructive }}>
                Fehler · Antippen zum Neuladen
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
              <Text style={{
                fontSize: 52, fontFamily: 'SpaceGrotesk_700Bold',
                color: statusColor, lineHeight: 56,
              }}>
                {currentCm !== null ? `${currentCm}` : '—'}
              </Text>
              <View style={{ paddingBottom: 6, gap: 4 }}>
                <Text style={{
                  fontSize: 16, fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.mutedForeground,
                }}>cm</Text>
                {(isAlarm || isSafe) && (
                  <View style={{
                    backgroundColor: isAlarm ? colors.alarm : colors.safe,
                    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
                  }}>
                    <Text style={{
                      fontSize: 11, fontFamily: 'SpaceGrotesk_700Bold',
                      color: '#FFFFFF', letterSpacing: 1,
                    }}>
                      {isAlarm ? 'ALARM' : 'SICHER'}
                    </Text>
                  </View>
                )}
              </View>
              {state?.last_pegel_time ? (
                <Text style={{
                  fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.mutedForeground, paddingBottom: 6, marginLeft: 'auto',
                }}>
                  Stand {formatTime(state.last_pegel_time)}
                </Text>
              ) : null}
            </View>
          )}

          {/* Verlauf-Label + Zeitraum-Tabs */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{
              fontSize: 10, fontFamily: 'SpaceGrotesk_600SemiBold',
              color: colors.mutedForeground, letterSpacing: 1, textTransform: 'uppercase',
            }}>Verlauf</Text>
            <View style={{
              flexDirection: 'row', backgroundColor: colors.muted,
              borderRadius: 8, padding: 2, gap: 2,
            }}>
              {TIME_RANGE_OPTIONS.map(({ label, value }) => {
                const active = chartRange === value;
                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => handleRangeChange(value)}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
                      backgroundColor: active ? colors.card : 'transparent',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{
                      fontSize: 11,
                      fontFamily: active ? 'SpaceGrotesk_600SemiBold' : 'SpaceGrotesk_400Regular',
                      color: active ? colors.foreground : colors.mutedForeground,
                    }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Chart */}
          {stateLoading ? (
            <View style={{ height: 80, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <PegelChart history={chartHistory} threshold={threshold} />
          )}
        </View>

        {/* ── Pegelvorhersage ─────────────────────────────────────────────── */}
        <View style={card()}>
          <SectionLabel label="Pegelvorhersage · Reffenthal" color={colors.mutedForeground} />
          <Image
            source={{ uri: `https://www.hvz.baden-wuerttemberg.de/gifs/09017-2001.GIF?t=${hvzTs}` }}
            style={{
              width: '100%', height: undefined,
              aspectRatio: 1.6,
              borderRadius: 10,
              backgroundColor: colors.muted,
            }}
            resizeMode="contain"
          />
          <TouchableOpacity
            onPress={() => void Linking.openURL('https://www.hvz.baden-wuerttemberg.de/pegel.html?id=09017-2001')}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Feather name="external-link" size={12} color={colors.primary} />
            <Text style={{ fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium', color: colors.primary }}>
              Vollständige Vorhersage · LUBW / HVZ
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── WSV / News ──────────────────────────────────────────────────── */}
        <View style={card()}>
          <SectionLabel label="WSV · Nachrichten für die Binnenschifffahrt" color={colors.mutedForeground} />
          {trefferLoading ? (
            <ActivityIndicator color={colors.primary} style={{ alignSelf: 'center' }} />
          ) : newsItems.length === 0 ? (
            <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
              Keine aktuellen Meldungen.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {newsItems.map((url: string, i: number) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => void Linking.openURL(url)}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}
                >
                  <View style={{
                    width: 28, height: 28, borderRadius: 8,
                    backgroundColor: colors.muted,
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    marginTop: 1,
                  }}>
                    <Feather name="file-text" size={13} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium',
                      color: colors.primary,
                    }} numberOfLines={1}>
                      {getDomain(url)}
                    </Text>
                    <Text style={{
                      fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular',
                      color: colors.mutedForeground, marginTop: 1,
                    }} numberOfLines={2}>
                      {url.replace(/^https?:\/\/[^/]+/, '').slice(0, 80)}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={14} color={colors.mutedForeground}
                    style={{ marginTop: 4 }} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {rssNewCount > 0 && (
            <View style={{
              backgroundColor: colors.secondary, borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 6,
              flexDirection: 'row', alignItems: 'center', gap: 6,
            }}>
              <Feather name="bell" size={12} color={colors.primary} />
              <Text style={{ fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium', color: colors.primary }}>
                {rssNewCount} {rssNewCount === 1 ? 'neue Meldung' : 'neue Meldungen'} seit letztem Abruf
              </Text>
            </View>
          )}
        </View>

        {/* ── Clubs ───────────────────────────────────────────────────────── */}
        <View style={card()}>
          <SectionLabel label="Vereine & Clubs" color={colors.mutedForeground} />
          {clubsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ alignSelf: 'center' }} />
          ) : knownClubs.length === 0 ? (
            <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
              Keine Clubs verfügbar.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {knownClubs.map((club: { name: string; icon: string; url: string }, i: number) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => void Linking.openURL(club.url)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingVertical: 6, paddingHorizontal: 4,
                    borderBottomWidth: i < knownClubs.length - 1 ? 1 : 0,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{club.icon}</Text>
                  <Text style={{
                    flex: 1, fontSize: 14,
                    fontFamily: 'SpaceGrotesk_500Medium', color: colors.foreground,
                  }}>
                    {club.name}
                  </Text>
                  <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── Tankstelle (MCK) ────────────────────────────────────────────── */}
        <View style={card()}>
          <SectionLabel label="⛽ Tankstelle · MCK Mannheim" color={colors.mutedForeground} />
          {mckLoading ? (
            <ActivityIndicator color={colors.primary} style={{ alignSelf: 'center' }} />
          ) : mckIsError || !mckData ? (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              onPress={() => void refetchMck()}
            >
              <Feather name="alert-circle" size={16} color={colors.destructive} />
              <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_500Medium', color: colors.destructive }}>
                Fehler · Antippen zum Neuladen
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {mckData.petrol !== null && (
                  <View style={{
                    flex: 1, backgroundColor: colors.muted,
                    borderRadius: 12, padding: 14, alignItems: 'center', gap: 4,
                  }}>
                    <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_500Medium', color: colors.mutedForeground }}>
                      Benzin
                    </Text>
                    <Text style={{ fontSize: 24, fontFamily: 'SpaceGrotesk_700Bold', color: colors.foreground }}>
                      {mckData.petrol.toFixed(3).replace('.', ',')}
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
                      {mckData.unit}
                    </Text>
                  </View>
                )}
                {mckData.diesel !== null && (
                  <View style={{
                    flex: 1, backgroundColor: colors.muted,
                    borderRadius: 12, padding: 14, alignItems: 'center', gap: 4,
                  }}>
                    <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_500Medium', color: colors.mutedForeground }}>
                      Diesel
                    </Text>
                    <Text style={{ fontSize: 24, fontFamily: 'SpaceGrotesk_700Bold', color: colors.foreground }}>
                      {mckData.diesel.toFixed(3).replace('.', ',')}
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
                      {mckData.unit}
                    </Text>
                  </View>
                )}
              </View>
              {mckData.sourceDate && (
                <Text style={{
                  fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.mutedForeground, textAlign: 'center',
                }}>
                  Stand: {mckData.sourceDate} · {mckData.source}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* ── Rhein-Karte ─────────────────────────────────────────────────── */}
        <View style={card({ gap: 12 })}>
          <SectionLabel label="🗺️ Rhein-Karte" color={colors.mutedForeground} />
          <RheinKarte
            pegelCm={currentCm}
            pegelTime={state?.last_pegel_time ?? null}
            mckData={mckData}
            knownClubs={knownClubs}
            nfbMeldungen={nfbMeldungen}
            isOffline={false}
            colors={colors}
          />
        </View>

        {/* ── Aktuelle Warnungen / NfB-Meldungen ─────────────────────────── */}
        <View style={card({
          borderColor: nfbNewCount > 0 ? colors.accent : colors.border,
        })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionLabel label="🚧 Aktuelle Warnungen / Meldungen" color={colors.mutedForeground} />
            {nfbNewCount > 0 && (
              <View style={{
                backgroundColor: colors.accent, borderRadius: 99,
                paddingHorizontal: 8, paddingVertical: 2,
              }}>
                <Text style={{
                  fontSize: 11, fontFamily: 'SpaceGrotesk_700Bold',
                  color: '#FFFFFF', letterSpacing: 1,
                }}>
                  {nfbNewCount} NEU
                </Text>
              </View>
            )}
            {nfbData != null && nfbData.count > 0 && nfbNewCount === 0 && (
              <View style={{
                backgroundColor: colors.muted, borderRadius: 99,
                paddingHorizontal: 8, paddingVertical: 2,
              }}>
                <Text style={{
                  fontSize: 11, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.accent,
                }}>
                  {nfbData.count}
                </Text>
              </View>
            )}
          </View>

          {/* Benachrichtigungen */}
          {nfbOsPermission && (
            <TouchableOpacity
              onPress={() => void toggleNfbNotif()}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: colors.muted, borderRadius: 10,
                paddingHorizontal: 12, paddingVertical: 8,
              }}
            >
              <Feather
                name={nfbNotifEnabled ? 'bell' : 'bell-off'}
                size={14} color={nfbNotifEnabled ? colors.primary : colors.mutedForeground}
              />
              <Text style={{
                fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium',
                color: nfbNotifEnabled ? colors.primary : colors.mutedForeground, flex: 1,
              }}>
                {nfbNotifEnabled ? 'NfB-Benachrichtigungen aktiv' : 'NfB-Benachrichtigungen deaktiviert'}
              </Text>
              <Feather name="chevron-right" size={13} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}

          {nfbLoading ? (
            <ActivityIndicator color={colors.primary} style={{ alignSelf: 'center' }} />
          ) : nfbMeldungen.length === 0 ? (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingVertical: 8,
            }}>
              <Feather name="check-circle" size={16} color={colors.safe} />
              <Text style={{ fontSize: 14, fontFamily: 'SpaceGrotesk_500Medium', color: colors.safe }}>
                Keine aktiven Meldungen
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {nfbMeldungen.slice(0, 8).map((m: NfbMeldung) => (
                <TouchableOpacity
                  key={m.nfb_id}
                  onPress={() => m.url && void Linking.openURL(m.url)}
                  activeOpacity={m.url ? 0.7 : 1}
                  style={{
                    backgroundColor: m.is_new ? `${colors.accent}15` : colors.muted,
                    borderRadius: 10, padding: 12, gap: 4,
                    borderWidth: m.is_new ? 1 : 0,
                    borderColor: m.is_new ? `${colors.accent}60` : 'transparent',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {m.is_new && (
                      <View style={{
                        backgroundColor: colors.accent, borderRadius: 4,
                        paddingHorizontal: 5, paddingVertical: 1,
                      }}>
                        <Text style={{ fontSize: 9, fontFamily: 'SpaceGrotesk_700Bold', color: '#FFF' }}>NEU</Text>
                      </View>
                    )}
                    <Text style={{
                      flex: 1, fontSize: 13,
                      fontFamily: 'SpaceGrotesk_500Medium', color: colors.foreground,
                    }} numberOfLines={2}>
                      {m.titel}
                    </Text>
                  </View>
                  <Text style={{
                    fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground,
                  }}>
                    km {m.km_von ?? '?'} – {m.km_bis ?? '?'}
                    {(m.gueltig_ab || m.gueltig_bis)
                      ? `  ·  ${m.gueltig_ab ?? '?'} – ${m.gueltig_bis ?? '?'}`
                      : ''}
                  </Text>
                </TouchableOpacity>
              ))}
              {nfbMeldungen.length > 8 && (
                <Text style={{
                  fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.mutedForeground, textAlign: 'center',
                }}>
                  + {nfbMeldungen.length - 8} weitere Meldungen
                </Text>
              )}
            </View>
          )}
        </View>

        {/* ── Wächter (dezent, ganz unten) ────────────────────────────────── */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: (isStale || neverRan || waechterStatus?.last_error)
            ? `${colors.alarm}40` : colors.border,
          paddingHorizontal: 14,
          paddingVertical: 10,
          gap: 4,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{
              width: 6, height: 6, borderRadius: 3,
              backgroundColor: (isStale || neverRan) ? colors.alarm : colors.safe,
            }} />
            <Text style={{
              fontSize: 10, fontFamily: 'SpaceGrotesk_500Medium',
              color: colors.mutedForeground, letterSpacing: 0.5,
            }}>
              Wächter
            </Text>
            {statusLoading && (
              <ActivityIndicator size="small" color={colors.mutedForeground} style={{ marginLeft: 4 }} />
            )}
            <Text style={{
              fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular',
              color: colors.mutedForeground, marginLeft: 'auto',
            }}>
              {neverRan ? 'Noch nie gelaufen' : formatRelativeTime(lastRunAt)}
            </Text>
          </View>
          {waechterStatus?.last_error ? (
            <Text style={{
              fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular',
              color: colors.alarm, marginLeft: 12,
            }} numberOfLines={1}>
              {waechterStatus.last_error}
            </Text>
          ) : isStale ? (
            <Text style={{
              fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular',
              color: colors.accent, marginLeft: 12,
            }}>
              Letzter Abruf vor mehr als 2 Stunden
            </Text>
          ) : null}
        </View>

      </ScrollView>
    </View>
  );
}
