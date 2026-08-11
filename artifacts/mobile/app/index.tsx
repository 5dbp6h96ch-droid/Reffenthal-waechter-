/**
 * index.tsx – PRODUKTION R(h)einschiffer
 *
 * Struktur:
 *   1. Logo + Titel (Logo links neben Titel)
 *   2. Pegelstand-Kachel (Rheinkilometer / Datum·Uhrzeit / cm / Schwelle)
 *   3. Verlauf-Chart (7T / 30T / 3M)
 *   4. MENÜ – kompakte aufklappbare Zeilen:
 *        Vorhersage / WSV / Tankstelle / Clubs / Rhein-Karte / News / Wächter
 *
 * Basis: freigegebener Teststand fcf1e7b (test.tsx)
 * Einziger Unterschied zu test.tsx: kein TEST-Banner.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Animated,
  Switch,
  Image,
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
import { useNfbNotifications } from '@/hooks/useNfbNotifications';
import { useColors } from '@/hooks/useColors';
import { useSinceLastVisit } from '@/hooks/useSinceLastVisit';
import RheinKarte from '@/components/RheinKarte';
import { useAuth } from '@/hooks/useAuth';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useGauges } from '@/hooks/useGauges';
import { useUserGaugeSettings } from '@/hooks/useUserGaugeSettings';
import { GaugeAlertRow } from '@/components/GaugeAlertRow';

// ─── Typen (identisch mit index.tsx) ─────────────────────────────────────────

type MckData = {
  source: string;
  petrol: number | null;
  diesel: number | null;
  unit: string;
  sourceDate?: string | null;
  checkedAt?: string | null;
  error?: string;
};

type NfbMeldung = {
  nfb_id: string; titel: string; km_von: number | null; km_bis: number | null;
  gueltig_ab: string | null; gueltig_bis: string | null; url: string | null;
  first_seen: string; is_new: boolean;
};

type WaechterClubHit = {
  name: string; icon: string; url: string; snippet: string;
  dedup_key: string; seen_at: string;
};

// ─── Konstanten (identisch mit index.tsx) ────────────────────────────────────

type TimeRange = 7 | 30 | 90;
const TIME_RANGE_OPTIONS: { label: string; value: TimeRange }[] = [
  { label: '7 T', value: 7 },
  { label: '30 T', value: 30 },
  { label: '3 M', value: 90 },
];
const STORAGE_KEY = 'pegel_chart_range';
const NFB_KM_DEFAULT_VON = 1;
const NFB_KM_DEFAULT_BIS = 900;
const NFB_KM_KEY = 'nfb_km_range';

const SCREEN_W = Dimensions.get('window').width;
const CARD_PADDING = 16;
const CHART_W = SCREEN_W - CARD_PADDING * 2 - 32;
const CHART_H = 140;
const PAD = { top: 10, right: 36, bottom: 26, left: 38 };

// Speyer Rheinkilometer (geografische Konstante, ändert sich nicht)
const SPEYER_RHEINKILOMETER = '400,4';

// ─── Hilfsfunktionen (identisch mit index.tsx) ───────────────────────────────

function filterHistory(
  history: { cm: number; ts: string }[],
  days: TimeRange,
): { cm: number; ts: string }[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return history.filter((h) => new Date(h.ts).getTime() >= cutoff);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit',
  });
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
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function getPathAndQuery(url: string): string {
  try {
    const u = new URL(url);
    const full = u.pathname + (u.search || '');
    return full.length > 60 ? full.slice(0, 58) + '…' : full;
  } catch { return url; }
}

// ─── PegelChart (identisch mit index.tsx) ────────────────────────────────────

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
  const raw = [...history];
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
  const toY = (cm: number): number => PAD.top + plotH - ((cm - minCm) / range) * plotH;
  const linePath = data.map((d, i) =>
    `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.cm).toFixed(1)}`
  ).join(' ');
  const baseY = (PAD.top + plotH).toFixed(1);
  const areaPath = linePath + ` L${toX(n).toFixed(1)},${baseY} L${PAD.left.toFixed(1)},${baseY} Z`;
  const threshY = toY(threshold);
  const lastCm = data[data.length - 1].cm;
  const isAlarm = lastCm < threshold;
  const lineColor = isAlarm ? colors.alarm : colors.safe;
  const yTicks = [
    Math.round(maxCm - padding),
    Math.round((minCm + maxCm) / 2),
    Math.round(minCm + padding),
  ];
  const startMs = new Date(data[0].ts).getTime();
  const endMs = new Date(data[data.length - 1].ts).getTime();
  const totalMs = endMs - startMs || 1;
  const totalDays = totalMs / 86_400_000;
  const xTicks = Array.from({ length: 5 }, (_, i) => {
    const frac = i / 4;
    const ms = startMs + frac * totalMs;
    const x = PAD.left + frac * plotW;
    const d = new Date(ms);
    const label = totalDays <= 35
      ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
      : d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
    return { x, label, anchor: i === 0 ? 'start' : i === 4 ? 'end' : 'middle' };
  });
  return (
    <Svg width={CHART_W} height={CHART_H}>
      <Defs>
        <SvgGradient id="pegelGradTest" x1="0" y1="0" x2="0" y2="1">
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
      <Path d={areaPath} fill="url(#pegelGradTest)" />
      <Path d={linePath} stroke={lineColor} strokeWidth={2} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={toX(n)} cy={toY(lastCm)} r={4} fill={lineColor} />
      <Circle cx={toX(n)} cy={toY(lastCm)} r={7} fill={lineColor} fillOpacity={0.2} />
      {xTicks.map((tick, i) => (
        <SvgText key={i} x={tick.x} y={CHART_H - 4} fontSize={8}
          fill={colors.mutedForeground} textAnchor={tick.anchor as 'start' | 'middle' | 'end'}
          opacity={0.75}>{tick.label}</SvgText>
      ))}
    </Svg>
  );
}

// ─── Produktionsscreen ───────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 0 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  // ── Expand/Collapse-Zustand ──────────────────────────────────────────────
  const [chartRange, setChartRange] = useState<TimeRange>(30);
  const [hvzOpen, setHvzOpen] = useState(false);
  const [nfbOpen, setNfbOpen] = useState(false);
  const [mckOpen, setMckOpen] = useState(false);
  const [vereineOpen, setVereineOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [waechterOpen, setWaechterOpen] = useState(false);
  const [kontoOpen, setKontoOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // ── Supabase Auth + User Settings + Gauges ──────────────────────────────
  const { user, signIn, signUp, signOut } = useAuth();
  const { settings, updateSettings } = useUserSettings(user?.id);
  const { gauges } = useGauges();
  const { getGaugeSetting, updateGaugeSetting } = useUserGaugeSettings(user?.id);

  // HVZ-Vorhersage: Cache-Busting-Timestamp, alle 5 Min aktualisiert (= HVZ-Takt)
  const [hvzTs, setHvzTs] = useState(() => Math.floor(Date.now() / 300_000));
  useEffect(() => {
    const timer = setInterval(() => setHvzTs(Math.floor(Date.now() / 300_000)), 300_000);
    return () => clearInterval(timer);
  }, []);

  // ── NfB km-Bereich ───────────────────────────────────────────────────────
  const [nfbKmVon, setNfbKmVon] = useState(NFB_KM_DEFAULT_VON);
  const [nfbKmBis, setNfbKmBis] = useState(NFB_KM_DEFAULT_BIS);
  const [nfbKmEdit, setNfbKmEdit] = useState(false);
  const [nfbKmInputVon, setNfbKmInputVon] = useState(String(NFB_KM_DEFAULT_VON));
  const [nfbKmInputBis, setNfbKmInputBis] = useState(String(NFB_KM_DEFAULT_BIS));
  const nfbKmBisRef = useRef<TextInput>(null);

  // ── Persistierte Einstellungen laden ────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === '7' || val === '30' || val === '90') setChartRange(Number(val) as TimeRange);
    }).catch(() => {});
    AsyncStorage.getItem(NFB_KM_KEY).then((val) => {
      if (val) {
        const parsed = JSON.parse(val) as { von: number; bis: number };
        if (typeof parsed.von === 'number' && typeof parsed.bis === 'number') {
          setNfbKmVon(parsed.von);
          setNfbKmBis(parsed.bis);
          setNfbKmInputVon(String(parsed.von));
          setNfbKmInputBis(String(parsed.bis));
        }
      }
    }).catch(() => {});
  }, []);

  const applyNfbKm = () => {
    const von = parseInt(nfbKmInputVon, 10);
    const bis = parseInt(nfbKmInputBis, 10);
    if (!isNaN(von) && !isNaN(bis) && von <= bis) {
      setNfbKmVon(von);
      setNfbKmBis(bis);
      AsyncStorage.setItem(NFB_KM_KEY, JSON.stringify({ von, bis })).catch(() => {});
    } else {
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

  // ── API-Hooks (identisch mit Produktion) ─────────────────────────────────
  const {
    data: state, isLoading: stateLoading, isError: stateError,
    refetch: refetchState, isRefetching: stateRefetching,
  } = useGetWaechterState();
  const {
    data: treffer, isLoading: trefferLoading, isError: trefferError,
    refetch: refetchTreffer, isRefetching: trefferRefetching,
  } = useGetWaechterTreffer();
  const {
    data: waechterStatus, isLoading: statusLoading,
    refetch: refetchStatus, isRefetching: statusRefetching,
  } = useGetWaechterStatus();
  const {
    data: clubsData, isLoading: clubsLoading, isError: clubsError,
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

  const {
    notifEnabled: nfbNotifEnabled,
    osPermission: nfbOsPermission,
    toggleNotifEnabled: toggleNfbNotif,
  } = useNfbNotifications(nfbData?.meldungen, nfbKmVon, nfbKmBis);

  // Deep-link: NfB-Bereich öffnen bei Notification-Tap
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
            setTimeout(() => {
              nfbCardRef.current?.measureLayout(
                scrollRef.current as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                (_x, y) => scrollRef.current?.scrollTo({ y, animated: true }),
                () => {},
              );
            }, 300);
          }
        });
      } catch { /* notifications unavailable */ }
    })();
    return () => { sub?.remove(); };
  }, []);

  // ── Abgeleitete Werte ────────────────────────────────────────────────────
  const nfbNewCount = nfbData?.meldungen.filter(
    (m: NfbMeldung) => m.is_new &&
      (m.km_von == null || m.km_bis == null ||
        (m.km_von <= nfbKmBis && m.km_bis >= nfbKmVon)),
  ).length ?? 0;

  const isRefreshing =
    stateRefetching || trefferRefetching || statusRefetching ||
    clubsRefetching || nfbRefetching || mckRefetching;

  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (isRefreshing) {
      spinAnim.setValue(0);
      spinLoop.current = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      );
      spinLoop.current.start();
    } else {
      spinLoop.current?.stop();
      spinAnim.setValue(0);
    }
  }, [isRefreshing, spinAnim]);

  const onRefresh = useCallback(() => {
    void refetchState(); void refetchTreffer(); void refetchStatus();
    void refetchClubs(); void refetchNfb(); void refetchMck();
  }, [refetchState, refetchTreffer, refetchStatus, refetchClubs, refetchNfb, refetchMck]);

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
  const statusColor = isAlarm ? colors.alarm : isSafe ? colors.safe : colors.mutedForeground;
  const statusLabel = isAlarm ? 'ALARM' : isSafe ? 'SICHER' : null;

  // useSinceLastVisit – Datenquelle aktiv halten (keine UI-Ausgabe in diesem Layout)
  useSinceLastVisit(
    nfbData?.meldungen, !nfbLoading && !nfbError && nfbData !== undefined,
    currentCm, !stateLoading && !stateError && state !== undefined,
    mckData, !mckLoading && !mckIsError && mckData !== undefined,
  );

  // ── Stil-Helfer für Menüzeilen ────────────────────────────────────────────
  const menuRow: object = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
  };
  const menuDivider = { height: 1, backgroundColor: colors.border };
  const menuContent: object = {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    gap: 12,
  };

  // Linke Seite einer Menüzeile: Icon + Text
  const MenuRowLeft = ({
    icon, label, color,
  }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; color?: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
      <View style={{
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: (color ?? colors.primary) + '18',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Feather name={icon} size={15} color={color ?? colors.primary} />
      </View>
      <Text style={{
        fontSize: 14, fontFamily: 'SpaceGrotesk_500Medium',
        color: colors.foreground, flex: 1,
      }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  // Trefferzähler-Badge (neutral / grau)
  const CountBadge = ({ count }: { count: number }) => (
    <View style={{
      backgroundColor: colors.muted, paddingHorizontal: 8,
      paddingVertical: 2, borderRadius: 99, marginRight: 4,
    }}>
      <Text style={{
        fontSize: 12, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.primary,
      }}>{count}</Text>
    </View>
  );

  // ─── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>


      {/* ── ScrollView ──────────────────────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: CARD_PADDING,
          paddingBottom: botPad + 32,
          gap: 12,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >

        {/* ── Logo + Titel (Logo links neben Titel) ────────────────────────── */}
        <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Image
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              source={require('../assets/images/icon.png')}
              style={{ width: 68, height: 68, borderRadius: 18 }}
              resizeMode="contain"
            />
            <View style={{ gap: 3 }}>
              <Text style={{
                fontSize: 30,
                fontFamily: 'SpaceGrotesk_700Bold',
                color: colors.foreground,
              }}>
                R(h)einschiffer
              </Text>
              <Text style={{
                fontSize: 13,
                fontFamily: 'SpaceGrotesk_400Regular',
                color: colors.mutedForeground,
              }}>
                Pegelvorhersage und News
              </Text>
            </View>
          </View>
        </View>

        {/* ── Pegelstand-Kachel (Spec-Hierarchie) ─────────────────────────── */}
        <View style={{
          backgroundColor: colors.primary,
          borderRadius: (colors.radius as number) + 4,
          padding: 20,
          gap: 10,
        }}>

          {/* Zeile 1: Rheinkilometer · Datum · Uhrzeit + ALARM-Badge rechts */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'nowrap',
          }}>
            <Text style={{
              fontSize: 11,
              fontFamily: 'SpaceGrotesk_600SemiBold',
              color: colors.primaryForeground,
              opacity: 0.75,
              letterSpacing: 0.5,
              flex: 1,
              flexShrink: 1,
            }} numberOfLines={1}>
              {`RHEINKILOMETER ${SPEYER_RHEINKILOMETER}`}
              {state?.last_pegel_time
                ? ` · ${formatDate(state.last_pegel_time)} · ${formatTime(state.last_pegel_time)}`
                : ''}
            </Text>
            {statusLabel && (
              <View style={{
                paddingHorizontal: 10, paddingVertical: 4,
                borderRadius: 99, backgroundColor: statusColor,
                marginLeft: 8, flexShrink: 0,
              }}>
                <Text style={{
                  fontSize: 10, fontFamily: 'SpaceGrotesk_700Bold',
                  color: '#FFFFFF', letterSpacing: 2,
                }}>
                  {statusLabel}
                </Text>
              </View>
            )}
          </View>

          {/* Zeile 3: Großer cm-Wert */}
          {stateLoading ? (
            <ActivityIndicator
              size="large"
              color={colors.primaryForeground}
              style={{ marginVertical: 4 }}
            />
          ) : stateError ? (
            <Text style={{
              fontSize: 52, fontFamily: 'SpaceGrotesk_400Regular',
              color: colors.primaryForeground, opacity: 0.3,
            }}>—</Text>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
              <Text style={{
                fontSize: 60,
                fontFamily: 'SpaceGrotesk_700Bold',
                color: colors.primaryForeground,
                lineHeight: 66,
                includeFontPadding: false,
              }}>
                {currentCm ?? '—'}
              </Text>
              {currentCm !== null && (
                <Text style={{
                  fontSize: 22,
                  fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.primaryForeground,
                  opacity: 0.55,
                  marginBottom: 6,
                }}>
                  cm
                </Text>
              )}
            </View>
          )}

          {/* Zeile 4: Schwelle */}
          <Text style={{
            fontSize: 12,
            fontFamily: 'SpaceGrotesk_500Medium',
            color: colors.primaryForeground,
            opacity: 0.55,
          }}>
            Schwelle: {threshold} cm
          </Text>


        </View>

        {/* ── Verlauf-Chart ──────────────────────────────────────────────────── */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: colors.radius,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 12,
        }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <Text style={{
              fontSize: 10,
              fontFamily: 'SpaceGrotesk_600SemiBold',
              color: colors.mutedForeground,
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}>
              Verlauf
            </Text>
            <View style={{
              flexDirection: 'row',
              backgroundColor: colors.muted,
              borderRadius: 8,
              padding: 2,
              gap: 2,
            }}>
              {TIME_RANGE_OPTIONS.map(({ label, value }) => {
                const active = chartRange === value;
                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => handleRangeChange(value)}
                    activeOpacity={0.7}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 6,
                      backgroundColor: active ? colors.card : 'transparent',
                    }}
                  >
                    <Text style={{
                      fontSize: 12,
                      fontFamily: active ? 'SpaceGrotesk_600SemiBold' : 'SpaceGrotesk_400Regular',
                      color: active ? colors.foreground : colors.mutedForeground,
                    }}>
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
              <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: colors.destructive }}>
                Fehler beim Laden
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: colors.muted, paddingHorizontal: 14,
                paddingVertical: 7, borderRadius: 8, marginTop: 4,
              }}>
                <Feather name="refresh-cw" size={13} color={colors.foreground} />
                <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_500Medium', color: colors.foreground }}>
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

        {/* ── MENÜ-Label ─────────────────────────────────────────────────────── */}
        <Text style={{
          fontSize: 11,
          fontFamily: 'SpaceGrotesk_600SemiBold',
          color: colors.mutedForeground,
          letterSpacing: 2,
          textTransform: 'uppercase',
          paddingTop: 4,
          paddingHorizontal: 2,
        }}>
          Menü
        </Text>

        {/* ── Menü-Karte ─────────────────────────────────────────────────────── */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: colors.radius,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}>

          {/* ── 1. Vorhersage ── */}
          {(() => {
            const imgW = SCREEN_W - CARD_PADDING * 2 - 32;
            const imgH = Math.round(imgW * (600 / 800));
            return (
              <>
                <TouchableOpacity
                  onPress={() => setHvzOpen(o => !o)}
                  activeOpacity={0.7}
                  style={menuRow}
                >
                  <MenuRowLeft icon="trending-up" label="Vorhersage" />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => void Linking.openURL(
                        'https://www.hvz.baden-wuerttemberg.de/pegel.html?id=09017',
                      )}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                    >
                      <Text style={{
                        fontSize: 11,
                        fontFamily: 'SpaceGrotesk_400Regular',
                        color: colors.mutedForeground,
                      }}>
                        LUBW
                      </Text>
                      <Feather name="external-link" size={11} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <Feather
                      name={hvzOpen ? 'chevron-up' : 'chevron-right'}
                      size={16}
                      color={colors.mutedForeground}
                    />
                  </View>
                </TouchableOpacity>

                {hvzOpen && (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 }}>
                    <Image
                      source={{
                        uri: `https://www.hvz.baden-wuerttemberg.de/gifs/09017-2001.GIF?t=${hvzTs}`,
                      }}
                      style={{ width: imgW, height: imgH, borderRadius: 8, alignSelf: 'center' }}
                      resizeMode="contain"
                    />
                  </View>
                )}
              </>
            );
          })()}

          <View style={menuDivider} />

          {/* ── 2. WSV – Nachrichten für die Binnenschifffahrt ── */}
          <View ref={nfbCardRef}>
            <TouchableOpacity
              onPress={() => { if (!nfbKmEdit) setNfbOpen(o => !o); }}
              activeOpacity={0.7}
              style={[
                menuRow,
                nfbNewCount > 0
                  ? { borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 13 }
                  : {},
              ]}
            >
              <MenuRowLeft icon="alert-circle" label="WSV – Nachrichten" />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {/* NEU-Badge BLAU */}
                {nfbNewCount > 0 && (
                  <View style={{
                    backgroundColor: colors.primary,
                    paddingHorizontal: 8, paddingVertical: 3,
                    borderRadius: 99,
                  }}>
                    <Text style={{
                      fontSize: 11, fontFamily: 'SpaceGrotesk_700Bold',
                      color: colors.primaryForeground, letterSpacing: 1,
                    }}>
                      {nfbNewCount} NEU
                    </Text>
                  </View>
                )}
                {nfbData != null && nfbData.count > 0 && nfbNewCount === 0 && (
                  <CountBadge count={nfbData.count} />
                )}
                <Feather
                  name={nfbOpen ? 'chevron-up' : 'chevron-right'}
                  size={16}
                  color={colors.mutedForeground}
                />
              </View>
            </TouchableOpacity>

            {nfbOpen && (
              <View style={menuContent}>
                {/* Aktualisierungshinweis */}
                {nfbDataUpdatedAt > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {nfbError && (
                      <Feather name="alert-circle" size={11} color="#E8620A" />
                    )}
                    <Text style={{
                      fontSize: 10,
                      fontFamily: 'SpaceGrotesk_400Regular',
                      color: nfbError ? '#E8620A' : colors.mutedForeground,
                      opacity: nfbError ? 1 : 0.7,
                    }}>
                      {nfbError
                        ? `Fehler · Stand ${formatRelativeTime(new Date(nfbDataUpdatedAt).toISOString())}`
                        : `Aktualisiert ${formatRelativeTime(new Date(nfbDataUpdatedAt).toISOString())}`}
                    </Text>
                  </View>
                )}

                {/* km-Bereich */}
                {nfbKmEdit ? (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: colors.muted, borderRadius: 8,
                    paddingHorizontal: 10, paddingVertical: 6,
                  }}>
                    <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>km</Text>
                    <TextInput
                      value={nfbKmInputVon}
                      onChangeText={setNfbKmInputVon}
                      keyboardType="number-pad"
                      returnKeyType="next"
                      onSubmitEditing={() => nfbKmBisRef.current?.focus()}
                      style={{
                        fontSize: 13, fontFamily: 'SpaceGrotesk_600SemiBold',
                        color: colors.foreground, backgroundColor: colors.card,
                        borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
                        minWidth: 52, textAlign: 'center',
                        borderWidth: 1, borderColor: colors.border,
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
                        fontSize: 13, fontFamily: 'SpaceGrotesk_600SemiBold',
                        color: colors.foreground, backgroundColor: colors.card,
                        borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
                        minWidth: 52, textAlign: 'center',
                        borderWidth: 1, borderColor: colors.border,
                      }}
                      selectTextOnFocus
                    />
                    <TouchableOpacity
                      onPress={applyNfbKm}
                      style={{
                        marginLeft: 4, backgroundColor: colors.primary,
                        borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5,
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
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      alignSelf: 'flex-start', backgroundColor: colors.muted,
                      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
                    }}
                  >
                    <Feather name="map-pin" size={12} color={colors.mutedForeground} />
                    <Text style={{ fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium', color: colors.mutedForeground }}>
                      km {nfbKmVon}–{nfbKmBis}
                    </Text>
                    <Feather name="edit-2" size={11} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}

                {/* Benachrichtigungs-Toggle */}
                {Platform.OS !== 'web' && (
                  <View>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      justifyContent: 'space-between', backgroundColor: colors.muted,
                      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <Feather
                          name={nfbNotifEnabled ? 'bell' : 'bell-off'}
                          size={13}
                          color={nfbNotifEnabled ? colors.foreground : colors.mutedForeground}
                        />
                        <Text style={{ fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium', color: colors.foreground }}>
                          Benachrichtigungen
                        </Text>
                        <Text style={{
                          fontSize: 11, fontFamily: 'SpaceGrotesk_600SemiBold',
                          color: nfbNotifEnabled && nfbOsPermission !== 'denied'
                            ? colors.safe : colors.mutedForeground,
                        }}>
                          {nfbNotifEnabled && nfbOsPermission !== 'denied' ? 'AN' : 'AUS'}
                        </Text>
                      </View>
                      <Switch
                        value={nfbNotifEnabled}
                        onValueChange={toggleNfbNotif}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor="#ffffff"
                      />
                    </View>
                    {nfbOsPermission === 'denied' && nfbNotifEnabled && (
                      <TouchableOpacity
                        onPress={() => void Linking.openSettings()}
                        activeOpacity={0.7}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
                          backgroundColor: colors.alarm + '18', borderRadius: 7,
                          paddingHorizontal: 10, paddingVertical: 7,
                        }}
                      >
                        <Feather name="alert-circle" size={13} color={colors.alarm} />
                        <Text style={{
                          fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular',
                          color: colors.alarm, flex: 1,
                        }}>
                          Benachrichtigungen sind in den Systemeinstellungen gesperrt.
                        </Text>
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          backgroundColor: colors.alarm + '28', borderRadius: 6,
                          paddingHorizontal: 8, paddingVertical: 4,
                        }}>
                          <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.alarm }}>
                            Einstellungen
                          </Text>
                          <Feather name="external-link" size={11} color={colors.alarm} />
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* NfB-Liste */}
                {nfbLoading ? (
                  <View style={{ height: 60, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : nfbError ? (
                  <TouchableOpacity
                    style={{ alignItems: 'center', gap: 8, paddingVertical: 16 }}
                    onPress={() => void refetchNfb()}
                  >
                    <Feather name="alert-circle" size={20} color={colors.destructive} />
                    <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: colors.destructive }}>
                      Fehler beim Laden
                    </Text>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: colors.muted, paddingHorizontal: 14,
                      paddingVertical: 7, borderRadius: 8, marginTop: 4,
                    }}>
                      <Feather name="refresh-cw" size={13} color={colors.foreground} />
                      <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_500Medium', color: colors.foreground }}>
                        Erneut versuchen
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : !nfbData?.meldungen.length ? (
                  <View style={{ alignItems: 'center', paddingVertical: 16, gap: 6 }}>
                    <Feather name="check-circle" size={20} color={colors.mutedForeground} />
                    <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
                      Keine aktiven Meldungen
                    </Text>
                  </View>
                ) : (
                  [...nfbData.meldungen]
                    .sort((a, b) => (a.km_von ?? 0) - (b.km_von ?? 0))
                    .map((m: NfbMeldung, i: number) => {
                      const isLast = i === nfbData.meldungen.length - 1;
                      const kmRange = m.km_von != null && m.km_bis != null
                        ? `km ${m.km_von}–${m.km_bis}`
                        : m.km_von != null ? `km ${m.km_von}` : null;
                      const validity = m.gueltig_ab || m.gueltig_bis
                        ? [m.gueltig_ab, m.gueltig_bis].filter(Boolean).join(' – ')
                        : null;
                      return (
                        <View key={m.nfb_id} style={{
                          paddingVertical: 10,
                          borderBottomWidth: isLast ? 0 : 1,
                          borderBottomColor: colors.border,
                          gap: 6,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_500Medium', color: colors.mutedForeground }}>
                              {m.nfb_id}
                            </Text>
                            {m.is_new && (
                              <View style={{
                                backgroundColor: colors.primary + '28',
                                paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
                              }}>
                                <Text style={{
                                  fontSize: 9, fontFamily: 'SpaceGrotesk_700Bold',
                                  color: colors.primary, letterSpacing: 1.5,
                                }}>NEU</Text>
                              </View>
                            )}
                          </View>
                          <Text style={{
                            fontSize: 13, fontFamily: 'SpaceGrotesk_600SemiBold',
                            color: colors.foreground, lineHeight: 18,
                          }}>
                            {m.titel}
                          </Text>
                          {(kmRange || validity) && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {kmRange && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                                  <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
                                    {kmRange}
                                  </Text>
                                </View>
                              )}
                              {validity && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Feather name="calendar" size={11} color={colors.mutedForeground} />
                                  <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
                                    {validity}
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}
                          {m.url && (
                            <TouchableOpacity
                              onPress={() => void Linking.openURL(m.url!)}
                              activeOpacity={0.65}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}
                            >
                              <Feather name="external-link" size={11} color={colors.primary} />
                              <Text style={{
                                fontSize: 11, fontFamily: 'SpaceGrotesk_500Medium', color: colors.primary,
                              }} numberOfLines={1}>ELWIS</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })
                )}
              </View>
            )}
          </View>

          <View style={menuDivider} />

          {/* ── 3. Tankstelle ── */}
          <TouchableOpacity
            onPress={() => { if (!mckOpen) void refetchMck(); setMckOpen(o => !o); }}
            activeOpacity={0.7}
            style={menuRow}
          >
            <MenuRowLeft icon="droplet" label="Tankstelle" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!mckOpen && mckData?.petrol != null && mckData?.diesel != null && (
                <Text style={{
                  fontSize: 12,
                  fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.mutedForeground,
                }}>
                  B {mckData.petrol.toFixed(3).replace('.', ',')} | D {mckData.diesel.toFixed(3).replace('.', ',')}
                </Text>
              )}
              <Feather
                name={mckOpen ? 'chevron-up' : 'chevron-right'}
                size={16}
                color={colors.mutedForeground}
              />
            </View>
          </TouchableOpacity>

          {mckOpen && (
            <View style={menuContent}>
              {mckLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (mckIsError || (mckData && mckData.petrol == null && mckData.diesel == null)) ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
                    ⚠️ Tankstellenpreise momentan nicht abrufbar
                  </Text>
                  <TouchableOpacity onPress={() => void Linking.openURL('https://www.mck-mannheim.de/')} activeOpacity={0.7}>
                    <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.primary }}>
                      Quelle: MCK Kurpfalz Mannheim ↗
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : mckData ? (
                <View style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {([['Benzin', mckData.petrol], ['Diesel', mckData.diesel]] as [string, number | null][]).map(
                      ([label, price]) => (
                        <View key={label} style={{
                          flex: 1, backgroundColor: colors.background,
                          borderRadius: (colors.radius as number) - 2,
                          padding: 12, alignItems: 'center', gap: 2,
                        }}>
                          <Text style={{
                            fontSize: 10, fontFamily: 'SpaceGrotesk_600SemiBold',
                            color: colors.mutedForeground,
                            textTransform: 'uppercase', letterSpacing: 1.5,
                          }}>{label}</Text>
                          <Text style={{
                            fontSize: 22, fontFamily: 'SpaceGrotesk_700Bold',
                            color: colors.foreground,
                          }}>
                            {price != null ? price.toFixed(3).replace('.', ',') : '–'}
                          </Text>
                          <Text style={{
                            fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular',
                            color: colors.mutedForeground,
                          }}>€/l</Text>
                        </View>
                      ),
                    )}
                  </View>
                  <View style={{ gap: 3, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_500Medium', color: colors.mutedForeground }}>
                      24/7 SB-Automaten-Tankstelle
                    </Text>
                    {mckData.sourceDate && (
                      <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
                        Stand: {mckData.sourceDate}
                      </Text>
                    )}
                    {mckData.checkedAt && (
                      <Text style={{ fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
                        Zuletzt geprüft: {new Date(mckData.checkedAt).toLocaleString('de-DE', {
                          day: '2-digit', month: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })} Uhr
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => void Linking.openURL('https://www.mck-mannheim.de/')}
                    activeOpacity={0.7}
                    style={{ alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.primary }}>
                      Quelle: MCK Kurpfalz Mannheim ↗
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}

          <View style={menuDivider} />

          {/* ── 4. Clubs ── */}
          <TouchableOpacity onPress={() => setVereineOpen(o => !o)} activeOpacity={0.7} style={menuRow}>
            <MenuRowLeft icon="users" label="Clubs" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {clubsData != null && clubsData.count > 0 && (
                <CountBadge count={clubsData.count} />
              )}
              <Feather
                name={vereineOpen ? 'chevron-up' : 'chevron-right'}
                size={16}
                color={colors.mutedForeground}
              />
            </View>
          </TouchableOpacity>

          {vereineOpen && (
            <View style={menuContent}>
              {clubsLoading ? (
                <View style={{ height: 60, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : clubsError ? (
                <TouchableOpacity
                  style={{ alignItems: 'center', gap: 8, paddingVertical: 16 }}
                  onPress={() => void refetchClubs()}
                >
                  <Feather name="alert-circle" size={20} color={colors.destructive} />
                  <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: colors.destructive }}>
                    Fehler beim Laden
                  </Text>
                </TouchableOpacity>
              ) : (
                (() => {
                  const knownClubs = clubsData?.known_clubs ?? [];
                  const findings = clubsData?.clubs ?? [];
                  const domainOf = (u: string) => {
                    try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
                  };
                  const latestByDomain = new Map<string, typeof findings[0]>();
                  for (const f of findings) latestByDomain.set(domainOf(f.url), f);
                  type RowItem = { name: string; icon: string; url: string };
                  const rows: RowItem[] = knownClubs.length > 0
                    ? knownClubs
                    : findings.slice().reverse().slice(0, 10).map((f: WaechterClubHit) => ({
                        name: f.name, icon: f.icon, url: f.url,
                      }));
                  return rows.map((club: RowItem, i: number) => {
                    const finding = latestByDomain.get(domainOf(club.url));
                    const isLast = i === rows.length - 1;
                    return (
                      <TouchableOpacity
                        key={club.url}
                        style={{
                          flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                          paddingVertical: 10,
                          borderBottomWidth: isLast ? 0 : 1,
                          borderBottomColor: colors.border,
                        }}
                        onPress={() => void Linking.openURL(club.url)}
                        activeOpacity={0.65}
                      >
                        <View style={{
                          width: 32, height: 32, borderRadius: 8,
                          backgroundColor: finding ? colors.primary + '22' : colors.muted,
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <Text style={{ fontSize: 16 }}>{club.icon}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{
                            fontSize: 13, fontFamily: 'SpaceGrotesk_600SemiBold',
                            color: colors.foreground,
                          }} numberOfLines={1}>{club.name}</Text>
                          <Text style={{
                            fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular',
                            color: finding ? colors.mutedForeground : colors.mutedForeground + '88',
                            marginTop: 2, lineHeight: 16,
                          }} numberOfLines={2}>
                            {finding ? finding.snippet : 'Keine aktuellen Meldungen'}
                          </Text>
                        </View>
                        <Feather name="external-link" size={14} color={colors.mutedForeground} style={{ marginTop: 2 }} />
                      </TouchableOpacity>
                    );
                  });
                })()
              )}
            </View>
          )}

          <View style={menuDivider} />

          {/* ── 5. Rhein-Karte ── */}
          <TouchableOpacity onPress={() => setMapOpen(o => !o)} activeOpacity={0.7} style={menuRow}>
            <MenuRowLeft icon="map" label="Rhein-Karte" />
            <Feather
              name={mapOpen ? 'chevron-up' : 'chevron-right'}
              size={16}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>

          {mapOpen && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 }}>
              <RheinKarte
                pegelCm={state?.last_pegel_cm ?? null}
                pegelTime={state?.last_pegel_time ?? null}
                mckData={mckData}
                knownClubs={clubsData?.known_clubs ?? []}
                nfbMeldungen={nfbData?.meldungen ?? []}
                isOffline={stateError}
                colors={colors}
              />
            </View>
          )}

          <View style={menuDivider} />

          {/* ── 6. News ── */}
          <TouchableOpacity onPress={() => setNewsOpen(o => !o)} activeOpacity={0.7} style={menuRow}>
            <MenuRowLeft icon="rss" label="News" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {treffer != null && treffer.count > 0 && (
                <CountBadge count={treffer.count} />
              )}
              <Feather
                name={newsOpen ? 'chevron-up' : 'chevron-right'}
                size={16}
                color={colors.mutedForeground}
              />
            </View>
          </TouchableOpacity>

          {newsOpen && (
            <View style={menuContent}>
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
                  <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: colors.destructive }}>
                    Fehler beim Laden
                  </Text>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: colors.muted, paddingHorizontal: 14,
                    paddingVertical: 7, borderRadius: 8, marginTop: 4,
                  }}>
                    <Feather name="refresh-cw" size={13} color={colors.foreground} />
                    <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_500Medium', color: colors.foreground }}>
                      Erneut versuchen
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : !treffer?.urls.length ? (
                <View style={{ alignItems: 'center', paddingVertical: 16, gap: 6 }}>
                  <Feather name="inbox" size={20} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
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
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingVertical: 10,
                        borderBottomWidth: isLast ? 0 : 1,
                        borderBottomColor: colors.border,
                      }}
                      onPress={() => void Linking.openURL(url)}
                      activeOpacity={0.65}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{
                          fontSize: 13, fontFamily: 'SpaceGrotesk_500Medium',
                          color: colors.foreground,
                        }} numberOfLines={1}>{getDomain(url)}</Text>
                        <Text style={{
                          fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular',
                          color: colors.mutedForeground, marginTop: 1,
                        }} numberOfLines={1}>{getPathAndQuery(url)}</Text>
                      </View>
                      <Feather name="external-link" size={14} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          <View style={menuDivider} />

          {/* ── 7. Wächter Status ── */}
          <TouchableOpacity
            onPress={() => setWaechterOpen(o => !o)}
            activeOpacity={0.7}
            style={[
              menuRow,
              (isStale || neverRan)
                ? { borderLeftWidth: 3, borderLeftColor: colors.alarm, paddingLeft: 13 }
                : {},
            ]}
          >
            <MenuRowLeft
              icon="shield"
              label="Wächter Status"
              color={(isStale || neverRan) ? colors.alarm : undefined}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {isStale && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: colors.alarm + '22',
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99,
                }}>
                  <Feather name="alert-triangle" size={11} color={colors.alarm} />
                  <Text style={{
                    fontSize: 10, fontFamily: 'SpaceGrotesk_600SemiBold',
                    color: colors.alarm, letterSpacing: 1,
                  }}>INAKTIV</Text>
                </View>
              )}
              <Feather
                name={waechterOpen ? 'chevron-up' : 'chevron-right'}
                size={16}
                color={colors.mutedForeground}
              />
            </View>
          </TouchableOpacity>

          {waechterOpen && (
            <View style={[menuContent, { gap: 10 }]}>
              {statusLoading ? (
                <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather
                      name="clock"
                      size={14}
                      color={isStale || neverRan ? colors.alarm : colors.mutedForeground}
                    />
                    <Text style={{
                      fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular',
                      color: isStale || neverRan ? colors.alarm : colors.foreground,
                    }}>
                      Letzter Lauf:{' '}
                      <Text style={{
                        fontFamily: 'SpaceGrotesk_600SemiBold',
                        color: isStale || neverRan ? colors.alarm : colors.foreground,
                      }}>
                        {neverRan ? 'Nie' : formatRelativeTime(lastRunAt)}
                      </Text>
                    </Text>
                  </View>
                  {!neverRan && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
                        Neue Treffer
                      </Text>
                      <Text style={{
                        fontSize: 15, fontFamily: 'SpaceGrotesk_700Bold',
                        color: rssNewCount > 0 ? colors.primary : colors.foreground,
                      }}>
                        {rssNewCount}
                      </Text>
                    </View>
                  )}
                </View>
              )}
              {neverRan && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 7,
                  backgroundColor: colors.alarm + '18', borderRadius: 8,
                  paddingHorizontal: 10, paddingVertical: 8,
                }}>
                  <Feather name="alert-triangle" size={13} color={colors.alarm} />
                  <Text style={{ fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular', color: colors.alarm }}>
                    Wächter wurde noch nicht ausgeführt.
                  </Text>
                </View>
              )}
              {lastError && (
                <View style={{
                  backgroundColor: colors.destructive + '18',
                  borderRadius: 8, padding: 10, gap: 4,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="x-circle" size={13} color={colors.destructive} />
                    <Text style={{
                      fontSize: 10, fontFamily: 'SpaceGrotesk_600SemiBold',
                      color: colors.destructive, letterSpacing: 1.5,
                      textTransform: 'uppercase',
                    }}>Letzter Fehler</Text>
                  </View>
                  <Text style={{
                    fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular',
                    color: colors.destructive, opacity: 0.85,
                  }} numberOfLines={3}>{lastError}</Text>
                </View>
              )}
            </View>
          )}

          <View style={menuDivider} />

          {/* ── 8. Mein Konto ── */}
          <TouchableOpacity
            onPress={() => setKontoOpen(o => !o)}
            activeOpacity={0.7}
            style={menuRow}
          >
            <MenuRowLeft icon="user" label="Mein Konto" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {user != null && (
                <View style={{
                  backgroundColor: colors.primary + '18',
                  paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99,
                }}>
                  <Text style={{
                    fontSize: 11, fontFamily: 'SpaceGrotesk_600SemiBold',
                    color: colors.primary,
                  }}>
                    Angemeldet
                  </Text>
                </View>
              )}
              <Feather
                name={kontoOpen ? 'chevron-up' : 'chevron-right'}
                size={16}
                color={colors.mutedForeground}
              />
            </View>
          </TouchableOpacity>

          {kontoOpen && (
            <View style={[menuContent, { gap: 14 }]}>
              {user == null ? (
                /* ── Nicht angemeldet: Login / Registrierung ── */
                <View style={{ gap: 12 }}>
                  {/* Gastmodus-Hinweis: persönliche Pegelwarnungen erfordern Anmeldung */}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    backgroundColor: colors.primary + '10',
                    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
                    borderWidth: 1, borderColor: colors.primary + '30',
                  }}>
                    <Feather name="bell" size={14} color={colors.primary} />
                    <Text style={{
                      flex: 1, fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular',
                      color: colors.primary,
                    }}>
                      Für persönliche Pegelwarnungen bitte anmelden.
                    </Text>
                  </View>

                  {/* Tabs */}
                  <View style={{
                    flexDirection: 'row', backgroundColor: colors.muted,
                    borderRadius: 8, padding: 2,
                  }}>
                    {(['login', 'register'] as const).map(mode => (
                      <TouchableOpacity
                        key={mode}
                        onPress={() => { setAuthMode(mode); setAuthError(null); }}
                        activeOpacity={0.7}
                        style={{
                          flex: 1, paddingVertical: 7, alignItems: 'center',
                          borderRadius: 6,
                          backgroundColor: authMode === mode ? colors.card : 'transparent',
                        }}
                      >
                        <Text style={{
                          fontSize: 13,
                          fontFamily: authMode === mode
                            ? 'SpaceGrotesk_600SemiBold' : 'SpaceGrotesk_400Regular',
                          color: authMode === mode ? colors.foreground : colors.mutedForeground,
                        }}>
                          {mode === 'login' ? 'Anmelden' : 'Registrieren'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* E-Mail */}
                  <View style={{ gap: 6 }}>
                    <Text style={{
                      fontSize: 11, fontFamily: 'SpaceGrotesk_500Medium',
                      color: colors.mutedForeground, letterSpacing: 0.5,
                    }}>
                      E-Mail
                    </Text>
                    <TextInput
                      value={authEmail}
                      onChangeText={v => { setAuthEmail(v); setAuthError(null); }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="name@beispiel.de"
                      placeholderTextColor={colors.mutedForeground}
                      style={{
                        fontSize: 14, fontFamily: 'SpaceGrotesk_400Regular',
                        color: colors.foreground, backgroundColor: colors.muted,
                        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
                        borderWidth: 1, borderColor: colors.border,
                      }}
                    />
                  </View>

                  {/* Passwort */}
                  <View style={{ gap: 6 }}>
                    <Text style={{
                      fontSize: 11, fontFamily: 'SpaceGrotesk_500Medium',
                      color: colors.mutedForeground, letterSpacing: 0.5,
                    }}>
                      Passwort
                    </Text>
                    <TextInput
                      value={authPassword}
                      onChangeText={v => { setAuthPassword(v); setAuthError(null); }}
                      secureTextEntry
                      placeholder="••••••••"
                      placeholderTextColor={colors.mutedForeground}
                      style={{
                        fontSize: 14, fontFamily: 'SpaceGrotesk_400Regular',
                        color: colors.foreground, backgroundColor: colors.muted,
                        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
                        borderWidth: 1, borderColor: colors.border,
                      }}
                    />
                  </View>

                  {/* Fehler */}
                  {authError != null && (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: colors.destructive + '18',
                      borderRadius: 8, padding: 10,
                    }}>
                      <Feather name="alert-circle" size={13} color={colors.destructive} />
                      <Text style={{
                        fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular',
                        color: colors.destructive, flex: 1,
                      }}>
                        {authError}
                      </Text>
                    </View>
                  )}

                  {/* Button */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={authLoading}
                    onPress={async () => {
                      if (!authEmail.trim() || !authPassword) {
                        setAuthError('Bitte E-Mail und Passwort eingeben.');
                        return;
                      }
                      setAuthLoading(true);
                      setAuthError(null);
                      Keyboard.dismiss();
                      const fn = authMode === 'login' ? signIn : signUp;
                      const { error } = await fn(authEmail.trim(), authPassword);
                      setAuthLoading(false);
                      if (error) {
                        setAuthError(error.message);
                      } else {
                        setAuthEmail('');
                        setAuthPassword('');
                        if (authMode === 'register') {
                          setAuthError('Bestätigungs-E-Mail gesendet. Bitte prüfe deinen Posteingang.');
                        }
                      }
                    }}
                    style={{
                      backgroundColor: authLoading ? colors.muted : colors.primary,
                      borderRadius: 8, paddingVertical: 12,
                      alignItems: 'center',
                    }}
                  >
                    {authLoading ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <Text style={{
                        fontSize: 14, fontFamily: 'SpaceGrotesk_600SemiBold',
                        color: colors.primaryForeground,
                      }}>
                        {authMode === 'login' ? 'Anmelden' : 'Konto erstellen'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                /* ── Angemeldet: Profil + Pegelort-Auswahl ── */
                <View style={{ gap: 14 }}>
                  {/* Nutzer-Info */}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: colors.muted, borderRadius: 10,
                    paddingHorizontal: 12, paddingVertical: 10,
                  }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: colors.primary + '28',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Feather name="user" size={17} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        fontSize: 13, fontFamily: 'SpaceGrotesk_600SemiBold',
                        color: colors.foreground,
                      }} numberOfLines={1}>
                        {user.email ?? 'Angemeldet'}
                      </Text>
                      <Text style={{
                        fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular',
                        color: colors.mutedForeground,
                      }}>
                        Supabase Auth
                      </Text>
                    </View>
                  </View>

                  {/* Pegelort-Auswahl */}
                  <View style={{ gap: 8 }}>
                    <Text style={{
                      fontSize: 11, fontFamily: 'SpaceGrotesk_600SemiBold',
                      color: colors.mutedForeground,
                      letterSpacing: 1.5, textTransform: 'uppercase',
                    }}>
                      Mein Pegelort
                    </Text>
                    {gauges.length === 0 ? (
                      <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
                    ) : (
                      <View style={{ gap: 6 }}>
                        {gauges.map(g => {
                          const isSelected = settings?.selected_gauge_id === g.id;
                          return (
                            <TouchableOpacity
                              key={g.id}
                              activeOpacity={0.75}
                              onPress={() => void updateSettings({ selected_gauge_id: g.id })}
                              style={{
                                flexDirection: 'row', alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingHorizontal: 12, paddingVertical: 10,
                                borderRadius: 8,
                                borderWidth: 1.5,
                                borderColor: isSelected ? colors.primary : colors.border,
                                backgroundColor: isSelected ? colors.primary + '0F' : colors.muted,
                              }}
                            >
                              <View style={{ gap: 1 }}>
                                <Text style={{
                                  fontSize: 14,
                                  fontFamily: isSelected
                                    ? 'SpaceGrotesk_700Bold' : 'SpaceGrotesk_500Medium',
                                  color: isSelected ? colors.primary : colors.foreground,
                                }}>
                                  {g.name}
                                </Text>
                                {(g.river != null || g.river_km != null) && (
                                  <Text style={{
                                    fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular',
                                    color: colors.mutedForeground,
                                  }}>
                                    {[g.river, g.river_km != null ? `km ${g.river_km}` : null]
                                      .filter(Boolean).join(' · ')}
                                  </Text>
                                )}
                              </View>
                              {isSelected && (
                                <Feather name="check-circle" size={18} color={colors.primary} />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    {settings?.selected_gauge_id == null && gauges.length > 0 && (
                      <Text style={{
                        fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular',
                        color: colors.mutedForeground, fontStyle: 'italic',
                      }}>
                        Noch kein Pegelort gewählt.
                      </Text>
                    )}
                  </View>

                  {/* ── Meine Pegelwarnungen ── */}
                  <View style={{ gap: 8 }}>
                    <Text style={{
                      fontSize: 11, fontFamily: 'SpaceGrotesk_600SemiBold',
                      color: colors.mutedForeground,
                      letterSpacing: 1.5, textTransform: 'uppercase',
                    }}>
                      Meine Pegelwarnungen
                    </Text>
                    {gauges.length === 0 ? (
                      <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
                    ) : (
                      <View style={{ gap: 8 }}>
                        {gauges.map(g => (
                          <GaugeAlertRow
                            key={g.id}
                            gauge={g}
                            setting={getGaugeSetting(g.id)}
                            onToggle={async (enabled) =>
                              updateGaugeSetting(g.id, { alert_enabled: enabled })
                            }
                            onSaveThreshold={async (cm) =>
                              updateGaugeSetting(g.id, { alert_threshold_cm: cm })
                            }
                          />
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Abmelden */}
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={async () => {
                      await signOut();
                      setKontoOpen(false);
                    }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      gap: 8, paddingVertical: 10, borderRadius: 8,
                      borderWidth: 1, borderColor: colors.border,
                    }}
                  >
                    <Feather name="log-out" size={14} color={colors.mutedForeground} />
                    <Text style={{
                      fontSize: 13, fontFamily: 'SpaceGrotesk_500Medium',
                      color: colors.mutedForeground,
                    }}>
                      Abmelden
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

        </View>
        {/* Ende Menü-Karte */}

      </ScrollView>
    </View>
  );
}
