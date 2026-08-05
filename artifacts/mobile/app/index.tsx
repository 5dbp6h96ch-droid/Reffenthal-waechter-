import React from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Platform,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
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
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

// ─── Chart constants ────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const CARD_PADDING = 16;
const CHART_W = SCREEN_W - CARD_PADDING * 2 - 32; // full card minus side padding
const CHART_H = 130;
const PAD = { top: 10, right: 8, bottom: 22, left: 38 };

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

  // History arrives newest-first; reverse to get chronological order
  const raw = [...history].reverse();
  // Downsample: max 200 points for performance
  const step = Math.max(1, Math.floor(raw.length / 200));
  const data = raw.filter((_, i) => i % step === 0);

  const cmValues = data.map((d) => d.cm);
  const dataMin = Math.min(...cmValues);
  const dataMax = Math.max(...cmValues);
  const padding = Math.max(10, (dataMax - dataMin) * 0.15);
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
  const lastCm = data[data.length - 1].cm;
  const isAlarm = lastCm < threshold;
  const lineColor = isAlarm ? colors.alarm : colors.safe;

  // Y-axis: show 3 evenly-spaced values
  const yTicks = [
    Math.round(maxCm - padding),
    Math.round((minCm + maxCm) / 2),
    Math.round(minCm + padding),
  ];

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
      <SvgText
        x={CHART_W - PAD.right + 2}
        y={threshY + 4}
        fontSize={8}
        fill={colors.accent}
        opacity={0.85}
      >
        {threshold}
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

      {/* Latest point dot */}
      <Circle
        cx={toX(n)}
        cy={toY(lastCm)}
        r={4}
        fill={lineColor}
      />
      <Circle
        cx={toX(n)}
        cy={toY(lastCm)}
        r={7}
        fill={lineColor}
        fillOpacity={0.2}
      />
    </Svg>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

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

  const isRefreshing = stateRefetching || trefferRefetching;

  const onRefresh = () => {
    void refetchState();
    void refetchTreffer();
  };

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
              Reffenthal
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
          <Text
            style={{
              fontSize: 10,
              fontFamily: 'SpaceGrotesk_600SemiBold',
              color: colors.mutedForeground,
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Verlauf · 30 Tage
          </Text>

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
              history={state?.history ?? []}
              threshold={threshold}
            />
          )}
        </View>

        {/* ── Treffer Card ── */}
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
          {/* Section header */}
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
              Treffer
            </Text>
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
          </View>

          {/* Treffer content */}
          {trefferLoading ? (
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
                Noch keine Treffer
              </Text>
            </View>
          ) : (
            treffer.urls.map((url, i) => {
              const isLast = i === treffer.urls.length - 1;
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
          )}
        </View>
      </ScrollView>
    </View>
  );
}
