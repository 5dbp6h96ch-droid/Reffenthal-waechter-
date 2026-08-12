import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import TestAuthPanel from '@/components/TestAuthPanel';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { setBaseUrl } from '@workspace/api-client-react';
import {
  registerNfbBackgroundFetch,
  saveApiBaseUrl,
} from '@/tasks/nfbBackgroundFetch';

SplashScreen.preventAutoHideAsync();

const STATIC_MODE = process.env.EXPO_PUBLIC_STATIC_DATA === 'true';

const GITHUB_RAW =
  'https://raw.githubusercontent.com/5dbp6h96ch-droid/Reffenthal-waechter-/main/reffenthal-waechter';

if (STATIC_MODE) {
  const _origFetch = globalThis.fetch.bind(globalThis);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    const rawFetch = (rawUrl: string) => _origFetch(rawUrl);

    if (url.endsWith('/api/waechter/state')) {
      try {
        const r = await rawFetch(`${GITHUB_RAW}/state.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw = await r.json();
        let history: { cm: number; ts: string }[] = Array.isArray(raw?.history) ? raw.history : [];
        let livePegelCm: number | null = raw?.last_pegel_cm ?? null;
        let livePegelTime: string | null = raw?.last_pegel_time ?? null;
        try {
          const currentR = await rawFetch(
            'https://pegelonline.wsv.de/webservices/rest-api/v2/stations/SPEYER/W/currentmeasurement.json',
          );
          if (currentR.ok) {
            const cm = await currentR.json() as { value?: number; timestamp?: string };
            if (typeof cm.value === 'number' && cm.timestamp) {
              livePegelCm = Math.round(cm.value);
              livePegelTime = cm.timestamp;
            }
          }
        } catch {}
        try {
          const pegelR = await rawFetch(
            'https://pegelonline.wsv.de/webservices/rest-api/v2/stations/SPEYER/W/measurements.json?start=P30D',
          );
          if (pegelR.ok) {
            const measurements = await pegelR.json();
            if (Array.isArray(measurements)) {
              const pegelHistory = (measurements as { timestamp: string; value: number }[]).map(m => ({
                cm: Math.round(m.value),
                ts: m.timestamp,
              }));
              const pegelLastMs = pegelHistory.length > 0
                ? new Date(pegelHistory[pegelHistory.length - 1].ts).getTime()
                : 0;
              const stateNewer = history.filter(h => new Date(h.ts).getTime() > pegelLastMs);
              history = [...pegelHistory, ...stateNewer];
            }
          }
        } catch {}
        return new Response(
          JSON.stringify({
            last_pegel_cm: livePegelCm,
            last_pegel_time: livePegelTime,
            last_daily_report_date: raw?.last_daily_report_date ?? null,
            history,
            threshold_cm: raw?.threshold_cm ?? 225,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        return new Response(
          JSON.stringify({ last_pegel_cm: null, last_pegel_time: null, last_daily_report_date: null, history: [], threshold_cm: 225 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    if (url.endsWith('/api/waechter/treffer')) {
      try {
        const r = await rawFetch(`${GITHUB_RAW}/seen.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw = await r.json();
        const urls = Array.isArray(raw)
          ? raw.filter((s): s is string => typeof s === 'string' && s.startsWith('http'))
          : [];
        return new Response(JSON.stringify({ urls, count: urls.length }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        return new Response(JSON.stringify({ urls: [], count: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (url.endsWith('/api/waechter/clubs')) {
      const KNOWN_CLUBS = [
        { name: '1. MBC Speyer', icon: '⚓', url: 'https://mbc-speyer.de/' },
        { name: 'Yachthafen Speyer', icon: '🚢', url: 'https://yachthafen-speyer.de/' },
        { name: 'YC Otterstadt (Angelhofer Altrhein)', icon: '⛵', url: 'https://ycoa.de/' },
        { name: 'MYCL Kiefweiher', icon: '🚤', url: 'https://www.mycl.de/' },
        { name: 'WCC Kiefweiher', icon: '🏕️', url: 'http://www.wcc-kiefweiher.de/' },
        { name: 'MCK Kurpfalz Mannheim', icon: '🏙️', url: 'https://www.mck-mannheim.de/' },
      ];
      try {
        const r = await rawFetch(`${GITHUB_RAW}/clubs_seen.json`);
        const raw = await r.json();
        const clubsArr = Array.isArray(raw) ? raw : [];
        return new Response(JSON.stringify({ clubs: clubsArr, count: clubsArr.length, known_clubs: KNOWN_CLUBS }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        return new Response(JSON.stringify({ clubs: [], count: 0, known_clubs: KNOWN_CLUBS }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const nfbUrlMatch = url.match(/\/api\/nfb(\?.*)?$/);
    if (nfbUrlMatch) {
      let kmVon: number | null = null;
      let kmBis: number | null = null;
      if (nfbUrlMatch[1]) {
        const qp = new URLSearchParams(nfbUrlMatch[1].slice(1));
        const v = Number(qp.get('km_von'));
        const b = Number(qp.get('km_bis'));
        if (!isNaN(v) && !isNaN(b)) { kmVon = v; kmBis = b; }
      }
      try {
        const r = await rawFetch(`${GITHUB_RAW}/nfb.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw = await r.json();
        let meldungen: unknown[] = Array.isArray(raw?.meldungen) ? raw.meldungen : [];
        const NfB_NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
        if (kmVon !== null && kmBis !== null) {
          meldungen = meldungen.filter((m: unknown) => {
            const entry = m as { km_von?: number | null; km_bis?: number | null };
            if (entry.km_von == null || entry.km_bis == null) return true;
            return entry.km_von <= kmBis! && entry.km_bis >= kmVon!;
          });
        }
        const now = Date.now();
        const withIsNew = meldungen.map((m) => {
          const entry = m as { is_new?: boolean; first_seen?: string };
          return {
            ...(m as object),
            is_new:
              typeof entry.is_new === 'boolean'
                ? entry.is_new
                : entry.first_seen
                  ? now - new Date(entry.first_seen).getTime() < NfB_NEW_WINDOW_MS
                  : false,
          };
        });
        return new Response(JSON.stringify({ meldungen: withIsNew, count: withIsNew.length }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        return new Response(JSON.stringify({ meldungen: [], count: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (url.endsWith('/api/waechter/status')) {
      try {
        const r = await rawFetch(`${GITHUB_RAW}/run_status.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw = await r.json();
        return new Response(JSON.stringify(raw), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        const fallback = { last_run_at: null, rss_new_count: 0, last_error: null };
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (url.endsWith('/api/mck')) {
      try {
        const r = await rawFetch(`${GITHUB_RAW}/mck.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw = await r.json();
        return new Response(JSON.stringify(raw), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        return new Response(
          JSON.stringify({
            source: 'MCK Kurpfalz Mannheim',
            petrol: null,
            diesel: null,
            unit: '€/l',
            sourceDate: null,
            checkedAt: null,
            error: 'Nicht erreichbar',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    return _origFetch(input, init);
  };
}

const apiBase = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STATIC_MODE ? 5 * 60 * 1_000 : 60_000,
      refetchInterval: STATIC_MODE ? 5 * 60 * 1_000 : 5 * 60 * 1_000,
      retry: STATIC_MODE ? false : 2,
    },
  },
});

function RootLayoutNav() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="test" options={{ headerShown: false }} />
      <Stack.Screen name="redesign" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    void registerNfbBackgroundFetch();
    void saveApiBaseUrl(apiBase);
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <RootLayoutNav />
              {STATIC_MODE && <TestAuthPanel />}
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
