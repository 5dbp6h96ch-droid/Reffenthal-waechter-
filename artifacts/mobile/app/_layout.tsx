import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
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

SplashScreen.preventAutoHideAsync();

// ── Konfiguration ─────────────────────────────────────────────────────────────
const STATIC_MODE = process.env.EXPO_PUBLIC_STATIC_DATA === 'true';

const GITHUB_RAW =
  'https://raw.githubusercontent.com/5dbp6h96ch-droid/Reffenthal-waechter-/main/reffenthal-waechter';

// ── Statischer Modus: fetch-Interceptor ──────────────────────────────────────
// Leitet API-Pfade auf die öffentlichen JSON-Dateien auf GitHub um.
// Kein API-Server erforderlich. seen.json ist ein Array von Strings.
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

    // Hilfsfunktion: GitHub Raw fetchen ohne AbortSignal weiterzugeben.
    // React Query's AbortController darf nicht an interne Fetches propagiert
    // werden – ein früher Abort würde sonst den Catch-Block triggern und
    // leere Daten liefern statt einen Fehler zu werfen.
    const rawFetch = (rawUrl: string) => _origFetch(rawUrl);

    // /api/waechter/state → state.json (+ threshold_cm ergänzen)
    if (url.endsWith('/api/waechter/state')) {
      try {
        const r = await rawFetch(`${GITHUB_RAW}/state.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw = await r.json();
        const data = { ...raw, threshold_cm: raw.threshold_cm ?? 225 };
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        // AbortError neu werfen damit React Query es korrekt behandelt
        if (err instanceof Error && err.name === 'AbortError') throw err;
        return new Response(
          JSON.stringify({ last_pegel_cm: null, last_pegel_time: null, last_daily_report_date: null, history: [], threshold_cm: 225 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    // /api/waechter/treffer → seen.json (Array von Strings, HTTP-URLs filtern)
    if (url.endsWith('/api/waechter/treffer')) {
      try {
        const r = await rawFetch(`${GITHUB_RAW}/seen.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw: unknown[] = await r.json();
        const urls = Array.isArray(raw)
          ? raw.filter((s): s is string => typeof s === 'string' && s.startsWith('http'))
          : [];
        const data = { urls, count: urls.length };
        return new Response(JSON.stringify(data), {
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

    // /api/waechter/clubs → clubs_seen.json + statische known_clubs Liste
    if (url.endsWith('/api/waechter/clubs')) {
      const KNOWN_CLUBS = [
        { name: '1. MBC Speyer',                       icon: '⚓', url: 'https://mbc-speyer.de/' },
        { name: 'Yachthafen Speyer',                   icon: '🚢', url: 'https://yachthafen-speyer.de/' },
        { name: 'YC Otterstadt (Angelhofer Altrhein)', icon: '⛵', url: 'https://ycoa.de/' },
        { name: 'MYCL Kiefweiher',                    icon: '🚤', url: 'https://www.mycl.de/' },
        { name: 'WCC Kiefweiher',                     icon: '🏕️', url: 'http://www.wcc-kiefweiher.de/' },
        { name: 'MCK Kurpfalz Mannheim',              icon: '🏙️', url: 'https://www.mck-mannheim.de/' },
      ];
      try {
        const r = await rawFetch(`${GITHUB_RAW}/clubs_seen.json`);
        const raw = r.ok ? await r.json() : [];
        const clubsArr = Array.isArray(raw) ? raw : [];
        const data = { clubs: clubsArr, count: clubsArr.length, known_clubs: KNOWN_CLUBS };
        return new Response(JSON.stringify(data), {
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

    // /api/nfb → nfb.json auf GitHub (leere Liste als Fallback)
    if (url.endsWith('/api/nfb')) {
      try {
        const r = await rawFetch(`${GITHUB_RAW}/nfb.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw = await r.json();
        // nfb.json hat Format { meldungen: [...], count: N }
        const meldungen = Array.isArray(raw?.meldungen) ? raw.meldungen : [];
        return new Response(JSON.stringify({ meldungen, count: meldungen.length }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        // Noch keine nfb.json committed → leere Liste zeigen statt Fehler
        return new Response(JSON.stringify({ meldungen: [], count: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // /api/waechter/status → run_status.json (404-Fallback wenn nicht committed)
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
        // run_status.json wird nicht auf GitHub committed → leeren Fallback
        const fallback = { last_run_at: null, rss_new_count: 0, last_error: null };
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return _origFetch(input, init);
  };
}

// ── API-Server-Konfiguration (normaler Modus) ─────────────────────────────────
if (!STATIC_MODE && process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

// ── QueryClient ───────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STATIC_MODE ? 5 * 60 * 1_000 : 60_000,
      refetchInterval: STATIC_MODE ? 5 * 60 * 1_000 : 5 * 60 * 1_000,
      retry: STATIC_MODE ? false : 2,
    },
  },
});

// ── Navigation ────────────────────────────────────────────────────────────────
function RootLayoutNav() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}

// ── Root Layout ───────────────────────────────────────────────────────────────
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

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
