/**
 * index.tsx – TEST R(h)einschiffer (Supabase-Integration, Bottom-Navigation)
 * Build: 2026-08-11-v2  (erzwingt neuen Bundle-Hash für Cache-Busting)
 *
 * Struktur:
 *   Hauptbereich (activeTab === null):
 *     – Gastmodus: Pegelstand-Kachel (Pegelname / Rheinkilometer / cm / Zeit)
 *     – Angemeldet: Pegelstand + Verlauf-Chart + Akkordeon-Menü
 *   Bottom-Navigation (fest, immer sichtbar):
 *     – Konto | Preferences | Help
 *
 * Alle bestehenden Funktionen erhalten:
 *   – PEGELONLINE über pegel_uuid
 *   – Persönliche Schwellenwerte per useUserGaugeSettings
 *   – HVZ-Vorhersage (09017 / 09001 / 09018)
 *   – useAuth / useProfile / useGauges / useUserSettings / useUserGaugeSettings
 *   – GaugeAlertRow, RheinKarte, NfB, Wächter, Clubs, MCK, News
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
  useWindowDimensions,
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
import GifLightbox from '@/components/GifLightbox';
import { useAuth } from '@/hooks/useAuth';
import { useWebPushPrompt } from '@/hooks/useWebPushPrompt';
import { useProfile } from '@/hooks/useProfile';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useGauges } from '@/hooks/useGauges';
import { useUserGaugeSettings } from '@/hooks/useUserGaugeSettings';
import { GaugeAlertRow } from '@/components/GaugeAlertRow';
import { getRheinForecastGif, RHEIN_FORECAST_GIF_MAP } from '@/data/rheinForecastGifMap';

// ─── Typen ───────────────────────────────────────────────────────────────────

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

type ActiveTab = null | 'konto' | 'preferences' | 'help';

// ─── Konstanten ──────────────────────────────────────────────────────────────

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
const BOTTOM_NAV_HEIGHT = 30;

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

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

// ─── PegelChart ──────────────────────────────────────────────────────────────

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

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 0 : insets.top;
  // Auf Web (inkl. iOS-PWA) liefert windowHeight die echte Viewport-Höhe
  // in Pixel, unabhängig von der CSS-Flex-Kette. Das ist zuverlässiger
  // als flex:1 auf einem #root ohne garantierten Höhenanker.
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  // ── Vorhersage-GIF: Vollbild-Overlay ─────────────────────────────────────
  const [gifFull, setGifFull] = useState(false);
  useEffect(() => {
    // Hintergrund-Scroll sperren, solange das GIF-Overlay offen ist (nur Web).
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (gifFull) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [gifFull]);
  // Auf allen Plattformen (inkl. iOS-PWA im Web-Modus) den echten
  // Safe-Area-Wert verwenden. useSafeAreaInsets() liefert auf der
  // installierten iPhone-PWA den korrekten insets.bottom (≈34 px).
  const botPad = insets.bottom;

  // ── Bottom-Navigation ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>(null);
  // Exit-Ansicht: rein im Speicher – beim erneuten Öffnen der PWA startet
  // die App frisch und zeigt wieder den normalen Inhalt.
  const [exited, setExited] = useState(false);

  const handleTabPress = useCallback((tab: NonNullable<ActiveTab>) => {
    setActiveTab(prev => prev === tab ? null : tab);
  }, []);

  // ── Akkordeon-Zustand (Hauptbereich) ─────────────────────────────────────
  const [chartRange, setChartRange] = useState<TimeRange>(30);
  const [hvzOpen, setHvzOpen] = useState(false);
  const [nfbOpen, setNfbOpen] = useState(false);
  const [mckOpen, setMckOpen] = useState(false);
  const [vereineOpen, setVereineOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [waechterOpen, setWaechterOpen] = useState(false);
  // Preferences: einklappbare Bereiche (Standard: zugeklappt)
  const [gaugeListOpen, setGaugeListOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  // ── Auth-Formular-Zustand (Konto-Tab) ────────────────────────────────────
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  // Passwort-Zurücksetzen-Ansicht
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFirstName, setAuthFirstName] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // ── Supabase Auth + User Settings + Gauges ──────────────────────────────
  const {
    visible: webPushVisible,
    status: webPushStatus,
    activate: activateWebPush,
  } = useWebPushPrompt();
  const {
    user, signIn, signUp, signOut, resetPassword,
    passwordRecovery, clearPasswordRecovery, updatePassword,
  } = useAuth();
  // „Neues Passwort festlegen"-Ansicht (nach Klick auf den Reset-Link)
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordRepeat, setNewPasswordRepeat] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryDone, setRecoveryDone] = useState(false);
  const { profile: userProfile, displayName: profileDisplayName, displayUsername: profileDisplayUsername } = useProfile(user);
  const { settings, loaded: settingsLoaded, updateSettings } = useUserSettings(user?.id);
  const { gauges } = useGauges();
  const { getGaugeSetting, updateGaugeSetting } = useUserGaugeSettings(user?.id);

  // ── Ausgewählter Pegelort ────────────────────────────────────────────────
  // localGaugeId = sofortiger lokaler State (reagiert ohne Netzwerk-Roundtrip).
  // Priorität: localGaugeId → null (settings wird im Init-Effect angewendet)
  const [localGaugeId, setLocalGaugeId] = useState<string | null>(null);
  const selectedGaugeId = localGaugeId ?? null;
  const selectedGauge = gauges.find(g => g.id === selectedGaugeId) ?? gauges[0] ?? null;

  // Beim User-Wechsel (Login/Logout) localGaugeId zurücksetzen, damit der
  // Init-Effect die gespeicherte Auswahl des neuen Nutzers anwenden kann.
  const prevUserIdRef = useRef<string | undefined>(user?.id);
  useEffect(() => {
    if (prevUserIdRef.current !== user?.id) {
      prevUserIdRef.current = user?.id;
      setLocalGaugeId(null);
    }
  }, [user?.id]);

  // Init-Effect: erst ausführen, wenn settingsLoaded === true, damit keine
  // Race-Condition entsteht (gauges laden oft schneller als useUserSettings).
  // Vorher: gauges[0] wurde sofort als Default gesetzt, bevor die gespeicherte
  // Auswahl aus AsyncStorage/Supabase ankam → Speyer wurde zu KONSTANZ.
  useEffect(() => {
    if (gauges.length > 0 && localGaugeId == null && settingsLoaded) {
      const initial = settings?.selected_gauge_id ?? gauges[0].id;
      setLocalGaugeId(initial);
    }
  }, [gauges, localGaugeId, settings?.selected_gauge_id, settingsLoaded]);

  const selectGauge = useCallback((id: string) => {
    setLocalGaugeId(id);
    if (user) {
      void updateSettings({ selected_gauge_id: id });
    }
  }, [user, updateSettings]);

  // ── HVZ Cache-Busting ────────────────────────────────────────────────────
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

  // ── API-Hooks ─────────────────────────────────────────────────────────────
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

  // ── PEGELONLINE: Live-Messwert + Verlauf für ausgewählten Pegel ──────────
  const pegelStationId = selectedGauge?.pegel_uuid ?? null;
  const {
    data: pegelLive,
    isLoading: pegelLiveLoading,
    isError: pegelLiveError,
    isRefetching: pegelLiveRefetching,
    refetch: refetchPegelLive,
  } = useQuery({
    queryKey: ['pegel-live', pegelStationId],
    enabled: pegelStationId != null,
    queryFn: async () => {
      const stId = pegelStationId!;
      const base = 'https://pegelonline.wsv.de/webservices/rest-api/v2/stations';
      const [curRes, histRes] = await Promise.all([
        fetch(`${base}/${stId}/W/currentmeasurement.json`),
        fetch(`${base}/${stId}/W/measurements.json?start=P90D`),
      ]);
      if (!curRes.ok) throw new Error(`PEGELONLINE HTTP ${curRes.status}`);
      const cur = await curRes.json() as { value: number; timestamp: string };
      let history: { cm: number; ts: string }[] = [];
      if (histRes.ok) {
        const raw = await histRes.json() as { value: number; timestamp: string }[];
        history = raw.map(m => ({ cm: Math.round(m.value), ts: m.timestamp }));
      }
      return { cm: Math.round(cur.value), ts: cur.timestamp, history };
    },
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    refetchIntervalInBackground: false,
    retry: 2,
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
            setActiveTab(null);
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
    pegelLiveRefetching || stateRefetching || trefferRefetching || statusRefetching ||
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
    void refetchPegelLive(); void refetchState(); void refetchTreffer(); void refetchStatus();
    void refetchClubs(); void refetchNfb(); void refetchMck();
  }, [refetchPegelLive, refetchState, refetchTreffer, refetchStatus, refetchClubs, refetchNfb, refetchMck]);

  const lastRunAt = waechterStatus?.last_run_at ?? null;
  const lastRunMs = lastRunAt ? Date.now() - new Date(lastRunAt).getTime() : null;
  const isStale = lastRunMs !== null && lastRunMs > 2 * 60 * 60 * 1000;
  const lastError = waechterStatus?.last_error ?? null;
  const neverRan = !statusLoading && !lastRunAt;
  const rssNewCount = waechterStatus?.rss_new_count ?? 0;

  const currentCm = pegelLive?.cm ?? null;
  const currentTs = pegelLive?.ts ?? null;
  const currentHistory = pegelLive?.history ?? [];

  // ── Pegel-Tendenz: echte Differenz zur vorherigen verfügbaren Messung ────
  // Vorherige Messung = letzter Verlaufs-Messwert (PEGELONLINE, 15-Min-Raster)
  // mit Zeitstempel STRENG VOR der aktuellen Messung. Keine Schätzung – wenn
  // keine frühere Messung vorliegt, wird KEINE Tendenz angezeigt.
  const pegelTrend: { diff: number; prevTs: string } | null = (() => {
    if (currentCm === null || currentTs === null || currentHistory.length === 0) return null;
    const curMs = new Date(currentTs).getTime();
    if (!Number.isFinite(curMs)) return null;
    let prev: { cm: number; ts: string } | null = null;
    for (const m of currentHistory) {
      const ms = new Date(m.ts).getTime();
      if (Number.isFinite(ms) && ms < curMs && (!prev || ms > new Date(prev.ts).getTime())) {
        prev = m;
      }
    }
    if (!prev) return null;
    return { diff: currentCm - prev.cm, prevTs: prev.ts };
  })();
  // Persönliche Schwelle aus user_gauge_settings für den aktuell ausgewählten Pegel
  const gaugeSetting = selectedGauge ? getGaugeSetting(selectedGauge.id) : null;
  const threshold = gaugeSetting?.alert_threshold_cm ?? 225;
  const isAlarm = currentCm !== null && currentCm < threshold;
  const isSafe = currentCm !== null && currentCm >= threshold;
  const statusColor = isAlarm ? colors.alarm : isSafe ? colors.safe : colors.mutedForeground;
  const statusLabel = isAlarm ? 'ALARM' : isSafe ? 'SICHER' : null;

  // useSinceLastVisit – Datenquelle aktiv halten
  useSinceLastVisit(
    nfbData?.meldungen, !nfbLoading && !nfbError && nfbData !== undefined,
    currentCm, !pegelLiveLoading && !pegelLiveError && pegelLive !== undefined,
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

  // ── Pegelstand-Kachel (shared für Gast- und angemeldeten Bereich) ─────────
  const renderPegelCard = () => (
    <View style={{
      backgroundColor: colors.primary,
      borderRadius: (colors.radius as number) + 4,
      padding: 20,
      gap: 10,
    }}>
      {/* Pegelname + Status-Badge (rechter Kachelrand, auf Namenshöhe) */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'nowrap',
      }}>
        <Text style={{
          fontSize: 18,
          fontFamily: 'SpaceGrotesk_700Bold',
          color: colors.primaryForeground,
          letterSpacing: 1,
          flex: 1,
          flexShrink: 1,
        }} numberOfLines={1}>
          {(selectedGauge?.name ?? '—').toUpperCase()}
        </Text>
        {statusLabel && (
          <View style={{
            paddingHorizontal: 10, paddingVertical: 4,
            borderRadius: 99, backgroundColor: statusColor,
            marginLeft: 8, flexShrink: 0,
          }}>
            <Text style={{
              fontSize: 9, fontFamily: 'SpaceGrotesk_700Bold',
              color: '#FFFFFF', letterSpacing: 2,
            }}>
              {statusLabel}
            </Text>
          </View>
        )}
      </View>

      {/* Rheinkilometer · Datum · Uhrzeit */}
      <Text style={{
        fontSize: 11,
        fontFamily: 'SpaceGrotesk_600SemiBold',
        color: colors.primaryForeground,
        opacity: 0.75,
        letterSpacing: 0.5,
      }} numberOfLines={1}>
        {`RHEINKILOMETER ${selectedGauge?.river_km != null ? String(selectedGauge.river_km).replace('.', ',') : '—'}`}
        {currentTs
          ? ` · ${formatDate(currentTs)} · ${formatTime(currentTs)}`
          : ''}
      </Text>

      {/* Großer cm-Wert */}
      {pegelLiveLoading ? (
        <ActivityIndicator size="large" color={colors.primaryForeground} style={{ marginVertical: 4 }} />
      ) : pegelLiveError ? (
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

      {/* Tendenz + letzte Messung – nur mit echten Messdaten */}
      {!pegelLiveLoading && !pegelLiveError && currentCm !== null && (
        <View style={{ gap: 2 }}>
          {pegelTrend && (
            <Text style={{
              fontSize: 17,
              fontFamily: 'SpaceGrotesk_600SemiBold',
              color: colors.primaryForeground,
              includeFontPadding: false,
            }}>
              {pegelTrend.diff > 0
                ? `↑ +${pegelTrend.diff} cm`
                : pegelTrend.diff < 0
                  ? `↓ ${pegelTrend.diff} cm`
                  : '→ 0 cm'}
            </Text>
          )}
          {currentTs && (
            <Text style={{
              fontSize: 12,
              fontFamily: 'SpaceGrotesk_500Medium',
              color: colors.primaryForeground,
              opacity: 0.55,
            }}>
              {`Letzte Messung: ${formatRelativeTime(currentTs)}`}
            </Text>
          )}
        </View>
      )}

      {/* Schwelle – nur wenn angemeldet */}
      {user && (
        <Text style={{
          fontSize: 12,
          fontFamily: 'SpaceGrotesk_500Medium',
          color: colors.primaryForeground,
          opacity: 0.55,
        }}>
          Schwelle: {threshold} cm
        </Text>
      )}
    </View>
  );

  // ── HAUPTBEREICH (null) ───────────────────────────────────────────────────
  const renderHome = () => (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: CARD_PADDING,
        paddingTop: topPad + CARD_PADDING,
        paddingBottom: botPad + BOTTOM_NAV_HEIGHT + 24,
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
      {/* Logo + Titel */}
      <View style={{ alignItems: 'center', paddingBottom: 4 }}>
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

      {/* Pegelstand-Kachel */}
      {renderPegelCard()}

      {/* Gastmodus: Anmelden-Button direkt unterhalb der Pegelkachel */}
      {!user && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => handleTabPress('konto')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: colors.primary,
            borderRadius: colors.radius,
            paddingVertical: 14,
            paddingHorizontal: 20,
          }}
        >
          <Feather name="log-in" size={16} color={colors.primaryForeground} />
          <Text style={{
            fontSize: 15,
            fontFamily: 'SpaceGrotesk_600SemiBold',
            color: colors.primaryForeground,
          }}>
            Alle Funktionen freischalten
          </Text>
        </TouchableOpacity>
      )}

      {/* Angemeldeter Bereich: Verlauf + Akkordeon-Menü */}
      {user && (
        <>
          {/* Verlauf-Chart */}
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
                fontSize: 9,
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

            {pegelStationId == null ? (
              <View style={{ alignItems: 'center', paddingVertical: 18, gap: 6 }}>
                <Feather name="alert-circle" size={17} color={colors.primaryForeground} style={{ opacity: 0.55 }} />
                <Text style={{
                  fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.mutedForeground, textAlign: 'center',
                }}>
                  {'Kein PEGELONLINE-Stationsname\nfür ' + (selectedGauge?.name ?? 'diesen Pegel') + ' konfiguriert.'}
                </Text>
              </View>
            ) : pegelLiveLoading ? (
              <View style={{ height: 80, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : pegelLiveError ? (
              <TouchableOpacity
                style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}
                onPress={() => void refetchPegelLive()}
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
                history={filterHistory(currentHistory, chartRange)}
                threshold={threshold}
              />
            )}
          </View>

          {/* MENÜ-Label */}
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

          {/* Menü-Karte */}
          <View style={{
            backgroundColor: colors.card,
            borderRadius: colors.radius,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}>

            {/* 1. Vorhersage */}
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
                        onPress={() => {
                          const mapEntry = RHEIN_FORECAST_GIF_MAP.find(
                            e => e.pegelUuid === (selectedGauge?.pegel_uuid ?? null),
                          );
                          void Linking.openURL(
                            mapEntry?.hvzId
                              ? `https://www.hvz.baden-wuerttemberg.de/pegel.html?id=${mapEntry.hvzId}`
                              : 'https://www.hvz.baden-wuerttemberg.de/',
                          );
                        }}
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
                      {(() => {
                        const gifUrl = getRheinForecastGif(selectedGauge?.pegel_uuid ?? null);
                        if (!gifUrl) {
                          return (
                            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                              <Feather name="info" size={17} color={colors.mutedForeground} />
                              <Text style={{
                                fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular',
                                color: colors.mutedForeground, textAlign: 'center',
                              }}>
                                {'Vorhersage für ' + (selectedGauge?.name ?? 'diesen Pegel') + '\nnicht verfügbar.'}
                              </Text>
                            </View>
                          );
                        }
                        return (
                          <>
                            <TouchableOpacity
                              onPress={() => setGifFull(true)}
                              activeOpacity={0.85}
                            >
                              <Image
                                source={{ uri: `${gifUrl}?t=${hvzTs}` }}
                                style={{ width: imgW, height: imgH, borderRadius: 8, alignSelf: 'center' }}
                                resizeMode="contain"
                              />
                            </TouchableOpacity>

                            {/* Vollbild-Lightbox: GIF groß, zoombar (Pinch/Pan/
                                Doppeltipp – nur Web), X immer erreichbar */}
                            {gifFull && (
                              <GifLightbox
                                uri={`${gifUrl}?t=${hvzTs}`}
                                onClose={() => setGifFull(false)}
                              />
                            )}
                          </>
                        );
                      })()}
                    </View>
                  )}
                </>
              );
            })()}

            <View style={menuDivider} />

            {/* 2. WSV – Nachrichten für die Binnenschifffahrt */}
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
                  {nfbDataUpdatedAt > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {nfbError && (
                        <Feather name="alert-circle" size={11} color="#E8620A" />
                      )}
                      <Text style={{
                        fontSize: 9,
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

            {/* 3. Tankstelle */}
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
                              fontSize: 9, fontFamily: 'SpaceGrotesk_600SemiBold',
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
                              fontSize: 9, fontFamily: 'SpaceGrotesk_400Regular',
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

            {/* 4. Clubs */}
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

            {/* 5. Rhein-Karte */}
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

            {/* 6. News */}
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

            {/* 7. Wächter Status */}
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

          </View>
          {/* Ende Menü-Karte */}
        </>
      )}
    </ScrollView>
  );

  // ── KONTO-TAB ─────────────────────────────────────────────────────────────
  const renderKonto = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: CARD_PADDING,
        paddingTop: topPad + CARD_PADDING,
        paddingBottom: botPad + BOTTOM_NAV_HEIGHT + 24,
        gap: 16,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Tab-Titel */}
      <Text style={{
        fontSize: 24, fontFamily: 'SpaceGrotesk_700Bold',
        color: colors.foreground,
      }}>
        Konto
      </Text>

      {user == null ? (
        /* ── Nicht angemeldet: Login / Registrierung ── */
        <View style={{ gap: 14 }}>
          {/* Gastmodus-Hinweis */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: colors.primary + '10',
            borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
            borderWidth: 1, borderColor: colors.primary + '30',
          }}>
            <Feather name="bell" size={16} color={colors.primary} />
            <Text style={{
              flex: 1, fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular',
              color: colors.primary,
            }}>
              Für persönliche Pegelwarnungen, Verlauf und Vorhersage bitte anmelden.
            </Text>
          </View>

          {resetMode ? (
            /* ── Passwort zurücksetzen ── */
            <View style={{
              backgroundColor: colors.card, borderRadius: 12,
              borderWidth: 1, borderColor: colors.border,
              padding: 16, gap: 14,
            }}>
              <Text style={{
                fontSize: 16, fontFamily: 'SpaceGrotesk_600SemiBold',
                color: colors.foreground,
              }}>
                Passwort zurücksetzen
              </Text>

              {resetSent ? (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: colors.safe + '18',
                  borderRadius: 8, padding: 12,
                }}>
                  <Feather name="check-circle" size={14} color={colors.safe} />
                  <Text style={{
                    fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular',
                    color: colors.safe, flex: 1,
                  }}>
                    Wenn für diese E-Mail-Adresse ein Konto vorhanden ist, wurde ein Link zum Zurücksetzen des Passworts gesendet.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={{ gap: 6 }}>
                    <Text style={{
                      fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium',
                      color: colors.mutedForeground, letterSpacing: 0.3,
                    }}>
                      E-Mail-Adresse
                    </Text>
                    <TextInput
                      value={resetEmail}
                      onChangeText={v => { setResetEmail(v); setResetError(null); }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="name@beispiel.de"
                      placeholderTextColor={colors.mutedForeground}
                      style={{
                        fontSize: 15, fontFamily: 'SpaceGrotesk_400Regular',
                        color: colors.foreground, backgroundColor: colors.muted,
                        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
                        borderWidth: 1, borderColor: colors.border,
                      }}
                    />
                  </View>

                  {resetError != null && (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: colors.destructive + '18',
                      borderRadius: 8, padding: 12,
                    }}>
                      <Feather name="alert-circle" size={14} color={colors.destructive} />
                      <Text style={{
                        fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular',
                        color: colors.destructive, flex: 1,
                      }}>
                        {resetError}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={resetLoading}
                    onPress={async () => {
                      if (!resetEmail.trim()) { setResetError('Bitte E-Mail-Adresse eingeben.'); return; }
                      setResetLoading(true);
                      setResetError(null);
                      Keyboard.dismiss();
                      const { error } = await resetPassword(resetEmail.trim());
                      setResetLoading(false);
                      if (error) {
                        setResetError(error.message);
                      } else {
                        // Neutrale Meldung – keine Aussage darüber, ob das Konto existiert.
                        setResetSent(true);
                      }
                    }}
                    style={{
                      backgroundColor: resetLoading ? colors.muted : colors.primary,
                      borderRadius: 10, paddingVertical: 14,
                      alignItems: 'center', marginTop: 2,
                    }}
                  >
                    {resetLoading ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <Text style={{
                        fontSize: 15, fontFamily: 'SpaceGrotesk_600SemiBold',
                        color: colors.primaryForeground,
                      }}>
                        Reset-Link senden
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* Zurück zur Anmeldung */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  setResetMode(false);
                  setResetEmail('');
                  setResetError(null);
                  setResetSent(false);
                }}
                style={{ alignItems: 'center', paddingVertical: 6 }}
              >
                <Text style={{
                  fontSize: 13, fontFamily: 'SpaceGrotesk_500Medium',
                  color: colors.primary,
                }}>
                  Zurück zur Anmeldung
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
          {/* Login / Registrieren Tabs */}
          <View style={{
            flexDirection: 'row', backgroundColor: colors.muted,
            borderRadius: 10, padding: 3,
          }}>
            {(['login', 'register'] as const).map(mode => (
              <TouchableOpacity
                key={mode}
                onPress={() => { setAuthMode(mode); setAuthError(null); }}
                activeOpacity={0.7}
                style={{
                  flex: 1, paddingVertical: 9, alignItems: 'center',
                  borderRadius: 8,
                  backgroundColor: authMode === mode ? colors.card : 'transparent',
                }}
              >
                <Text style={{
                  fontSize: 14,
                  fontFamily: authMode === mode
                    ? 'SpaceGrotesk_600SemiBold' : 'SpaceGrotesk_400Regular',
                  color: authMode === mode ? colors.foreground : colors.mutedForeground,
                }}>
                  {mode === 'login' ? 'Anmelden' : 'Registrieren'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Formularfelder */}
          <View style={{
            backgroundColor: colors.card, borderRadius: 12,
            borderWidth: 1, borderColor: colors.border,
            padding: 16, gap: 14,
          }}>
            {/* Vorname + Nutzername (nur bei Registrierung) */}
            {authMode === 'register' && (
              <>
                <View style={{ gap: 6 }}>
                  <Text style={{
                    fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium',
                    color: colors.mutedForeground, letterSpacing: 0.3,
                  }}>
                    Vorname
                  </Text>
                  <TextInput
                    value={authFirstName}
                    onChangeText={v => { setAuthFirstName(v); setAuthError(null); }}
                    autoCapitalize="words"
                    autoCorrect={false}
                    placeholder="Max"
                    placeholderTextColor={colors.mutedForeground}
                    style={{
                      fontSize: 15, fontFamily: 'SpaceGrotesk_400Regular',
                      color: colors.foreground, backgroundColor: colors.muted,
                      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
                      borderWidth: 1, borderColor: colors.border,
                    }}
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={{
                    fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium',
                    color: colors.mutedForeground, letterSpacing: 0.3,
                  }}>
                    Nutzername
                  </Text>
                  <TextInput
                    value={authUsername}
                    onChangeText={v => { setAuthUsername(v); setAuthError(null); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="maxrhein"
                    placeholderTextColor={colors.mutedForeground}
                    style={{
                      fontSize: 15, fontFamily: 'SpaceGrotesk_400Regular',
                      color: colors.foreground, backgroundColor: colors.muted,
                      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
                      borderWidth: 1, borderColor: colors.border,
                    }}
                  />
                </View>
              </>
            )}

            {/* E-Mail */}
            <View style={{ gap: 6 }}>
              <Text style={{
                fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium',
                color: colors.mutedForeground, letterSpacing: 0.3,
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
                  fontSize: 15, fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.foreground, backgroundColor: colors.muted,
                  borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
                  borderWidth: 1, borderColor: colors.border,
                }}
              />
            </View>

            {/* Passwort */}
            <View style={{ gap: 6 }}>
              <Text style={{
                fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium',
                color: colors.mutedForeground, letterSpacing: 0.3,
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
                  fontSize: 15, fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.foreground, backgroundColor: colors.muted,
                  borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
                  borderWidth: 1, borderColor: colors.border,
                }}
              />
            </View>

            {/* Passwort vergessen? (nur bei Anmeldung) */}
            {authMode === 'login' && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  setResetMode(true);
                  setResetEmail(authEmail.trim());
                  setResetError(null);
                  setResetSent(false);
                }}
                style={{ alignSelf: 'flex-start', paddingVertical: 2 }}
              >
                <Text style={{
                  fontSize: 13, fontFamily: 'SpaceGrotesk_500Medium',
                  color: colors.primary,
                }}>
                  Passwort vergessen?
                </Text>
              </TouchableOpacity>
            )}

            {/* Fehler */}
            {authError != null && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: authMode === 'register' && authError.includes('Bestätigungs')
                  ? colors.safe + '18' : colors.destructive + '18',
                borderRadius: 8, padding: 12,
              }}>
                <Feather
                  name={authMode === 'register' && authError.includes('Bestätigungs') ? 'check-circle' : 'alert-circle'}
                  size={14}
                  color={authMode === 'register' && authError.includes('Bestätigungs') ? colors.safe : colors.destructive}
                />
                <Text style={{
                  fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular',
                  color: authMode === 'register' && authError.includes('Bestätigungs')
                    ? colors.safe : colors.destructive,
                  flex: 1,
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
                if (authMode === 'register') {
                  if (!authFirstName.trim()) { setAuthError('Bitte Vorname eingeben.'); return; }
                  if (!authUsername.trim()) { setAuthError('Bitte Nutzername eingeben.'); return; }
                }
                if (!authEmail.trim()) { setAuthError('Bitte E-Mail eingeben.'); return; }
                if (!authPassword) { setAuthError('Bitte Passwort eingeben.'); return; }
                setAuthLoading(true);
                setAuthError(null);
                Keyboard.dismiss();
                let error;
                if (authMode === 'login') {
                  ({ error } = await signIn(authEmail.trim(), authPassword));
                } else {
                  ({ error } = await signUp(authEmail.trim(), authPassword, {
                    firstName: authFirstName.trim(),
                    username: authUsername.trim(),
                  }));
                }
                setAuthLoading(false);
                if (error) {
                  setAuthError(error.message);
                } else {
                  setAuthEmail('');
                  setAuthPassword('');
                  setAuthFirstName('');
                  setAuthUsername('');
                  if (authMode === 'login') {
                    // Nach erfolgreichem Login → Hauptbereich
                    setActiveTab(null);
                  } else {
                    setAuthError('Bestätigungs-E-Mail gesendet. Bitte prüfe deinen Posteingang.');
                  }
                }
              }}
              style={{
                backgroundColor: authLoading ? colors.muted : colors.primary,
                borderRadius: 10, paddingVertical: 14,
                alignItems: 'center', marginTop: 2,
              }}
            >
              {authLoading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={{
                  fontSize: 15, fontFamily: 'SpaceGrotesk_600SemiBold',
                  color: colors.primaryForeground,
                }}>
                  {authMode === 'login' ? 'Anmelden' : 'Konto erstellen'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
            </>
          )}
        </View>
      ) : (
        /* ── Angemeldet: Profil ── */
        <View style={{ gap: 16 }}>
          {/* Profil-Karte */}
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 14, borderWidth: 1, borderColor: colors.border,
            padding: 18, gap: 0,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{
                width: 52, height: 52, borderRadius: 26,
                backgroundColor: colors.primary + '20',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="user" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                {profileDisplayName ? (
                  <Text style={{
                    fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold',
                    color: colors.foreground,
                  }} numberOfLines={1}>
                    {profileDisplayName}
                  </Text>
                ) : null}
                {profileDisplayUsername ? (
                  <Text style={{
                    fontSize: 14, fontFamily: 'SpaceGrotesk_500Medium',
                    color: colors.primary,
                  }} numberOfLines={1}>
                    {'@' + profileDisplayUsername}
                  </Text>
                ) : null}
                <Text style={{
                  fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.mutedForeground,
                  marginTop: (profileDisplayName || profileDisplayUsername) ? 1 : 0,
                }} numberOfLines={1}>
                  {user.email ?? 'Angemeldet'}
                </Text>
              </View>
            </View>
          </View>

          {/* Abmelden */}
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={async () => {
              await signOut();
              setActiveTab(null);
            }}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 8, paddingVertical: 13, borderRadius: 10,
              borderWidth: 1, borderColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <Feather name="log-out" size={16} color={colors.mutedForeground} />
            <Text style={{
              fontSize: 14, fontFamily: 'SpaceGrotesk_500Medium',
              color: colors.mutedForeground,
            }}>
              Abmelden
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );

  // ── PREFERENCES-TAB ───────────────────────────────────────────────────────
  const renderPreferences = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: CARD_PADDING,
        paddingTop: topPad + CARD_PADDING,
        paddingBottom: botPad + BOTTOM_NAV_HEIGHT + 24,
        gap: 20,
      }}
    >
      {/* Tab-Titel */}
      <Text style={{
        fontSize: 24, fontFamily: 'SpaceGrotesk_700Bold',
        color: colors.foreground,
      }}>
        Preferences
      </Text>

      {/* MEIN PEGELORT – einklappbar */}
      <View style={{ gap: 10 }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setGaugeListOpen(o => !o)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={{
            fontSize: 11, fontFamily: 'SpaceGrotesk_600SemiBold',
            color: colors.mutedForeground,
            letterSpacing: 2, textTransform: 'uppercase',
          }}>
            Mein Pegelort
          </Text>
          <Feather
            name={gaugeListOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>

        {!gaugeListOpen && selectedGauge && (<View style={{padding:14, marginTop:8, backgroundColor:colors.card, borderRadius:12, borderWidth:1, borderColor:colors.border}}><Text style={{fontSize:15, fontFamily:"SpaceGrotesk_700Bold", color:colors.primary}}>{selectedGauge.name}</Text></View>)}

        {gaugeListOpen && (
          gauges.length === 0 ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
          ) : (
            <View style={{
              backgroundColor: colors.card, borderRadius: 12,
              borderWidth: 1, borderColor: colors.border,
              overflow: 'hidden',
            }}>
              {gauges.map((g, idx) => {
                const isSelected = selectedGauge?.id === g.id;
                const isLast = idx === gauges.length - 1;
                return (
                  <TouchableOpacity
                    key={g.id}
                    activeOpacity={0.75}
                    onPress={() => { selectGauge(g.id); setGaugeListOpen(false); }}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 16, paddingVertical: 14,
                      borderBottomWidth: isLast ? 0 : 1,
                      borderBottomColor: colors.border,
                      backgroundColor: isSelected ? colors.primary + '08' : 'transparent',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{
                        width: 32, height: 32, borderRadius: 16,
                        backgroundColor: isSelected ? colors.primary + '20' : colors.muted,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Feather
                          name="anchor"
                          size={14}
                          color={isSelected ? colors.primary : colors.mutedForeground}
                        />
                      </View>
                      <View style={{ gap: 1 }}>
                        <Text style={{
                          fontSize: 15,
                          fontFamily: isSelected ? 'SpaceGrotesk_700Bold' : 'SpaceGrotesk_500Medium',
                          color: isSelected ? colors.primary : colors.foreground,
                        }}>
                          {g.name}
                        </Text>
                        {(g.river != null || g.river_km != null) && (
                          <Text style={{
                            fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular',
                            color: colors.mutedForeground,
                          }}>
                            {[g.river, g.river_km != null ? `km ${g.river_km}` : null]
                              .filter(Boolean).join(' · ')}
                          </Text>
                        )}
                      </View>
                    </View>
                    {isSelected && (
                      <Feather name="check-circle" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        )}
      </View>

      {/* MEINE PEGELWARNUNGEN – einklappbar */}
      <View style={{ gap: 10 }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setAlertsOpen(o => !o)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={{
            fontSize: 11, fontFamily: 'SpaceGrotesk_600SemiBold',
            color: colors.mutedForeground,
            letterSpacing: 2, textTransform: 'uppercase',
          }}>
            Meine Pegelwarnungen
          </Text>
          <Feather
            name={alertsOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>

        {alertsOpen && (user == null ? (
          /* Nicht angemeldet: Hinweis */
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handleTabPress('konto')}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: colors.card,
              borderRadius: 12, borderWidth: 1,
              borderColor: colors.primary + '30',
              paddingHorizontal: 16, paddingVertical: 14,
            }}
          >
            <View style={{
              width: 34, height: 34, borderRadius: 17,
              backgroundColor: colors.primary + '15',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Feather name="lock" size={15} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 14, fontFamily: 'SpaceGrotesk_600SemiBold',
                color: colors.foreground,
              }}>
                Anmeldung erforderlich
              </Text>
              <Text style={{
                fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular',
                color: colors.mutedForeground, marginTop: 1,
              }}>
                Persönliche Schwellen nach Login verfügbar
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.primary} />
          </TouchableOpacity>
        ) : gauges.length === 0 ? (
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
        ))}
      </View>

      {/* PUSH-NACHRICHTEN (nur Web) */}
      {Platform.OS === 'web' && webPushVisible && (
        <View style={{ gap: 10 }}>
          <Text style={{
            fontSize: 11, fontFamily: 'SpaceGrotesk_600SemiBold',
            color: colors.mutedForeground,
            letterSpacing: 2, textTransform: 'uppercase',
          }}>
            Push-Nachrichten
          </Text>
          <TouchableOpacity
            onPress={activateWebPush}
            activeOpacity={0.8}
            disabled={webPushStatus === 'activating' || webPushStatus === 'active'}
            style={{
              backgroundColor: webPushStatus === 'active'
                ? colors.safe + '18'
                : colors.card,
              borderRadius: 12, borderWidth: 1,
              borderColor: webPushStatus === 'active' ? colors.safe + '40' : colors.border,
              paddingHorizontal: 16, paddingVertical: 14,
              flexDirection: 'row', alignItems: 'center', gap: 10,
            }}
          >
            {webPushStatus === 'activating' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather
                name={webPushStatus === 'active' ? 'check-circle' : 'bell'}
                size={16}
                color={webPushStatus === 'active' ? colors.safe : colors.primary}
              />
            )}
            <Text style={{
              fontSize: 14, fontFamily: 'SpaceGrotesk_600SemiBold',
              color: webPushStatus === 'active' ? colors.safe : colors.foreground,
            }}>
              {webPushStatus === 'active'
                ? '✓ Push-Nachrichten aktiviert'
                : webPushStatus === 'activating'
                  ? 'Push wird aktiviert …'
                  : 'Push-Nachrichten aktivieren'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );

  // ── HELP-TAB ─────────────────────────────────────────────────────────────
  const renderHelp = () => {
    const HelpSection = ({
      icon, title, children,
    }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; children: React.ReactNode }) => (
      <View style={{
        backgroundColor: colors.card, borderRadius: 12,
        borderWidth: 1, borderColor: colors.border,
        padding: 16, gap: 8,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{
            width: 32, height: 32, borderRadius: 8,
            backgroundColor: colors.primary + '18',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Feather name={icon} size={15} color={colors.primary} />
          </View>
          <Text style={{
            fontSize: 15, fontFamily: 'SpaceGrotesk_700Bold',
            color: colors.foreground,
          }}>
            {title}
          </Text>
        </View>
        {children}
      </View>
    );

    const HelpText = ({ text }: { text: string }) => (
      <Text style={{
        fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular',
        color: colors.mutedForeground, lineHeight: 20,
      }}>
        {text}
      </Text>
    );

    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: CARD_PADDING,
          paddingTop: topPad + CARD_PADDING,
          paddingBottom: botPad + BOTTOM_NAV_HEIGHT + 24,
          gap: 12,
        }}
      >
        {/* Tab-Titel */}
        <Text style={{
          fontSize: 24, fontFamily: 'SpaceGrotesk_700Bold',
          color: colors.foreground,
        }}>
          Help
        </Text>

        {/* Über R(h)einschiffer */}
        <View style={{
          backgroundColor: colors.primary,
          borderRadius: 14, padding: 18, gap: 8,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              source={require('../assets/images/icon.png')}
              style={{ width: 44, height: 44, borderRadius: 12 }}
              resizeMode="contain"
            />
            <View style={{ gap: 2 }}>
              <Text style={{
                fontSize: 20, fontFamily: 'SpaceGrotesk_700Bold',
                color: colors.primaryForeground,
              }}>
                R(h)einschiffer
              </Text>
              <Text style={{
                fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular',
                color: colors.primaryForeground, opacity: 0.75,
              }}>
                Pegelvorhersage und News
              </Text>
            </View>
          </View>
          <Text style={{
            fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular',
            color: colors.primaryForeground, opacity: 0.85,
            lineHeight: 20,
          }}>
            R(h)einschiffer zeigt aktuelle Pegelstände, Verlaufsdaten und offizielle Vorhersagen des Rheins. Für Wassersportler, Schiffer und alle, die den Rhein im Blick behalten möchten.
          </Text>
        </View>

        {/* Aktueller Pegelstand */}
        <HelpSection icon="droplet" title="Aktueller Pegelstand">
          <HelpText text="Hier siehst du den aktuellen Pegelstand für den unter Preferences ausgewählten Pegel." />
          <HelpText text="Die Pegelstand-Kachel zeigt den aktuellen Wasserstand in Zentimetern (cm) direkt von PEGELONLINE / WSV." />
        </HelpSection>

        {/* Verlauf */}
        <HelpSection icon="bar-chart-2" title="Verlauf">
          <HelpText text="Das Verlaufs-Diagramm zeigt die Pegelentwicklung der letzten 7 Tage, 30 Tage oder 3 Monate. Die gestrichelte Linie markiert die persönliche Warnschwelle." />
          <HelpText text="Grüne Kurve = Pegelstand oberhalb der Schwelle. Rote Kurve = Pegelstand unterhalb der Schwelle." />
        </HelpSection>

        {/* Vorhersage */}
        <HelpSection icon="trending-up" title="Vorhersage">
          <HelpText text="Die HVZ Baden-Württemberg stellt offizielle Vorhersage-Grafiken bereit. Diese werden alle 5 Minuten aktualisiert. Die Vorhersage steht für Speyer, Mannheim und Worms zur Verfügung." />
          <TouchableOpacity
            onPress={() => void Linking.openURL('https://www.hvz.baden-wuerttemberg.de/')}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}
          >
            <Feather name="external-link" size={12} color={colors.primary} />
            <Text style={{
              fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium', color: colors.primary,
            }}>
              hvz.baden-wuerttemberg.de
            </Text>
          </TouchableOpacity>
        </HelpSection>

        {/* Persönliche Pegelwarnungen */}
        <HelpSection icon="bell" title="Persönliche Pegelwarnungen">
          <HelpText text="Nach der Anmeldung kannst du für jeden Pegelort einen persönlichen Schwellenwert festlegen. Die Warnung zeigt ALARM an, wenn der Wasserstand die Schwelle unterschreitet." />
          <HelpText text="Die Einstellungen findest du unter Preferences → Meine Pegelwarnungen." />
        </HelpSection>

        {/* Was bedeutet die Schwelle? */}
        <View style={{
          backgroundColor: colors.muted, borderRadius: 12,
          borderWidth: 1, borderColor: colors.border,
          padding: 16, gap: 8,
        }}>
          <Text style={{
            fontSize: 13, fontFamily: 'SpaceGrotesk_700Bold',
            color: colors.foreground,
          }}>
            Was bedeutet die Schwelle?
          </Text>
          <Text style={{
            fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular',
            color: colors.mutedForeground, lineHeight: 20,
          }}>
            Die persönliche Schwelle bestimmt, ab welchem Wasserstand die Pegelwarnung ausgelöst wird. Liegt der aktuelle Pegelstand unterhalb der Schwelle, wird ALARM angezeigt. Oberhalb der Schwelle: SICHER.
          </Text>
          <Text style={{
            fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular',
            color: colors.mutedForeground, opacity: 0.75, lineHeight: 18,
          }}>
            Beispiel: Schwelle 225 cm → ALARM wenn Wasserstand unter 225 cm fällt.
          </Text>
        </View>

        {/* Quellen */}
        <View style={{ gap: 8 }}>
          <Text style={{
            fontSize: 11, fontFamily: 'SpaceGrotesk_600SemiBold',
            color: colors.mutedForeground,
            letterSpacing: 2, textTransform: 'uppercase',
          }}>
            Quellen
          </Text>
          <View style={{
            backgroundColor: colors.card, borderRadius: 12,
            borderWidth: 1, borderColor: colors.border,
            overflow: 'hidden',
          }}>
            {[
              {
                label: 'PEGELONLINE / WSV',
                sub: 'Aktuelle Pegelstände und Verlaufsdaten',
                url: 'https://pegelonline.wsv.de/',
              },
              {
                label: 'HVZ Baden-Württemberg',
                sub: 'Offizielle Hochwasservorhersage',
                url: 'https://www.hvz.baden-wuerttemberg.de/',
              },
              {
                label: 'ELWIS',
                sub: 'WSV Nachrichten für die Binnenschifffahrt',
                url: 'https://www.elwis.de/',
              },
            ].map((src, i, arr) => (
              <TouchableOpacity
                key={src.url}
                onPress={() => void Linking.openURL(src.url)}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16, paddingVertical: 13,
                  borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 14, fontFamily: 'SpaceGrotesk_600SemiBold',
                    color: colors.foreground,
                  }}>
                    {src.label}
                  </Text>
                  <Text style={{
                    fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular',
                    color: colors.mutedForeground, marginTop: 1,
                  }}>
                    {src.sub}
                  </Text>
                </View>
                <Feather name="external-link" size={14} color={colors.primary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  };

  // ── BOTTOM NAVIGATION ─────────────────────────────────────────────────────
  const renderBottomNav = () => {
    type NavItem = {
      tab: NonNullable<ActiveTab>;
      icon: React.ComponentProps<typeof Feather>['name'];
      label: string;
    };
    const items: NavItem[] = [
      { tab: 'konto', icon: 'user', label: 'Konto' },
      { tab: 'preferences', icon: 'sliders', label: 'Preferences' },
      { tab: 'help', icon: 'help-circle', label: 'Help' },
    ];

    return (
      <View style={{
        flexDirection: 'row',
        height: BOTTOM_NAV_HEIGHT + botPad,
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingBottom: botPad,
      }}>
        {items.map(({ tab, icon, label }) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => handleTabPress(tab)}
              activeOpacity={0.7}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                paddingTop: 0,
              }}
            >
              <View style={{
                width: 34, height: 24,
                alignItems: 'center', justifyContent: 'center',
                borderRadius: 14,
                backgroundColor: isActive ? colors.primary + '18' : 'transparent',
              }}>
                <Feather
                  name={icon}
                  size={17}
                  color={isActive ? colors.primary : colors.mutedForeground}
                />
              </View>
              <Text style={{
                fontSize: 10,
                fontFamily: isActive ? 'SpaceGrotesk_600SemiBold' : 'SpaceGrotesk_400Regular',
                color: isActive ? colors.primary : colors.mutedForeground,
                letterSpacing: 0.2,
              }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={() => setExited(true)}
          activeOpacity={0.7}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            paddingTop: 0,
          }}
        >
          <View style={{
            width: 34, height: 24,
            alignItems: 'center', justifyContent: 'center',
            borderRadius: 14,
            backgroundColor: 'transparent',
          }}>
            <Feather
              name="log-out"
              size={17}
              color={colors.mutedForeground}
            />
          </View>
          <Text style={{
            fontSize: 10,
            fontFamily: 'SpaceGrotesk_400Regular',
            color: colors.mutedForeground,
            letterSpacing: 0.2,
          }}>
            Exit
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  // Auf Web (inkl. iOS-PWA) setzen wir eine absolute Pixelhöhe statt flex:1,
  // weil Expo-Router-Web Wrapper-Divs ohne height erzeugt, die die
  // flex:1-Kette unterbrechen und den Inhalt über den Viewport hinauswachsen
  // lassen – dadurch verschwindet die Bottom-Navigation nach unten.
  const rootStyle = Platform.OS === 'web'
    ? { height: windowHeight, backgroundColor: colors.background }
    : { flex: 1 as const, backgroundColor: colors.background };

  // „Neues Passwort festlegen"-Ansicht nach Öffnen des Supabase-Reset-Links
  if (passwordRecovery) {
    return (
      <View style={{
        ...rootStyle,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        <View style={{
          width: '100%', maxWidth: 400,
          backgroundColor: colors.card, borderRadius: 12,
          borderWidth: 1, borderColor: colors.border,
          padding: 16, gap: 14,
        }}>
          <Text style={{
            fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold',
            color: colors.foreground,
          }}>
            Neues Passwort festlegen
          </Text>

          {recoveryDone ? (
            <>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: colors.safe + '18',
                borderRadius: 8, padding: 12,
              }}>
                <Feather name="check-circle" size={14} color={colors.safe} />
                <Text style={{
                  fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular',
                  color: colors.safe, flex: 1,
                }}>
                  Passwort wurde erfolgreich geändert.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={async () => {
                  // Zurück zur Anmeldung: Recovery beenden und abmelden
                  setNewPassword('');
                  setNewPasswordRepeat('');
                  setRecoveryDone(false);
                  clearPasswordRecovery();
                  await signOut();
                  setAuthMode('login');
                  setActiveTab('konto');
                }}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 10, paddingVertical: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  fontSize: 15, fontFamily: 'SpaceGrotesk_600SemiBold',
                  color: colors.primaryForeground,
                }}>
                  Zur Anmeldung
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <Text style={{
                  fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium',
                  color: colors.mutedForeground, letterSpacing: 0.3,
                }}>
                  Neues Passwort
                </Text>
                <TextInput
                  value={newPassword}
                  onChangeText={v => { setNewPassword(v); setRecoveryError(null); }}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                  style={{
                    fontSize: 15, fontFamily: 'SpaceGrotesk_400Regular',
                    color: colors.foreground, backgroundColor: colors.muted,
                    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
                    borderWidth: 1, borderColor: colors.border,
                  }}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{
                  fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium',
                  color: colors.mutedForeground, letterSpacing: 0.3,
                }}>
                  Passwort wiederholen
                </Text>
                <TextInput
                  value={newPasswordRepeat}
                  onChangeText={v => { setNewPasswordRepeat(v); setRecoveryError(null); }}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                  style={{
                    fontSize: 15, fontFamily: 'SpaceGrotesk_400Regular',
                    color: colors.foreground, backgroundColor: colors.muted,
                    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
                    borderWidth: 1, borderColor: colors.border,
                  }}
                />
              </View>

              {recoveryError != null && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: colors.destructive + '18',
                  borderRadius: 8, padding: 12,
                }}>
                  <Feather name="alert-circle" size={14} color={colors.destructive} />
                  <Text style={{
                    fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular',
                    color: colors.destructive, flex: 1,
                  }}>
                    {recoveryError}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                activeOpacity={0.8}
                disabled={recoveryLoading}
                onPress={async () => {
                  if (newPassword.length < 6) {
                    setRecoveryError('Das Passwort muss mindestens 6 Zeichen lang sein.');
                    return;
                  }
                  if (newPassword !== newPasswordRepeat) {
                    setRecoveryError('Die Passwörter stimmen nicht überein.');
                    return;
                  }
                  setRecoveryLoading(true);
                  setRecoveryError(null);
                  Keyboard.dismiss();
                  const { error } = await updatePassword(newPassword);
                  setRecoveryLoading(false);
                  if (error) {
                    setRecoveryError(error.message);
                  } else {
                    setRecoveryDone(true);
                  }
                }}
                style={{
                  backgroundColor: recoveryLoading ? colors.muted : colors.primary,
                  borderRadius: 10, paddingVertical: 14,
                  alignItems: 'center', marginTop: 2,
                }}
              >
                {recoveryLoading ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={{
                    fontSize: 15, fontFamily: 'SpaceGrotesk_600SemiBold',
                    color: colors.primaryForeground,
                  }}>
                    Passwort speichern
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  // „App beendet"-Ansicht nach Tippen auf Exit
  if (exited) {
    return (
      <View style={{
        ...rootStyle,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 12,
      }}>
        <Text style={{
          fontSize: 22,
          fontFamily: 'SpaceGrotesk_700Bold',
          color: colors.foreground,
        }}>
          R(h)einschiffer
        </Text>
        <Text style={{
          fontSize: 15,
          fontFamily: 'SpaceGrotesk_600SemiBold',
          color: colors.mutedForeground,
        }}>
          App beendet
        </Text>
        <Text style={{
          fontSize: 13,
          fontFamily: 'SpaceGrotesk_400Regular',
          color: colors.mutedForeground,
          textAlign: 'center',
        }}>
          Du kannst dieses Fenster jetzt schließen.
        </Text>
      </View>
    );
  }

  return (
    <View style={rootStyle}>
      {/* Inhalt – je nach aktivem Tab */}
      <View style={{ flex: 1 }}>
        {activeTab === null && renderHome()}
        {activeTab === 'konto' && renderKonto()}
        {activeTab === 'preferences' && renderPreferences()}
        {activeTab === 'help' && renderHelp()}
      </View>

      {/* Feste Bottom-Navigation */}
      {renderBottomNav()}
    </View>
  );
}
