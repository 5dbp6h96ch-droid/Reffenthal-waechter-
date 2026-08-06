import React, { useCallback, useEffect } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
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
import type {
  WaechterRunStatus,
  WaechterState,
  WaechterTreffer,
} from '@workspace/api-client-react';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// ── Modus-Erkennung ──────────────────────────────────────────────────────────
// EXPO_PUBLIC_STATIC_DATA=true → GitHub Pages Modus:
//   Daten kommen direkt von den öffentlichen JSON-Dateien auf GitHub.
// Andernfalls: normaler API-Server-Modus.
const STATIC_MODE = process.env.EXPO_PUBLIC_STATIC_DATA === 'true';

const GITHUB_RAW =
  'https://raw.githubusercontent.com/5dbp6h96ch-droid/Reffenthal-waechter-/main/reffenthal-waechter';

const PEGEL_THRESHOLD_CM = 225;

// Query-Keys müssen exakt mit den generierten Hooks übereinstimmen.
const QK_STATE = ['/api/waechter/state'] as const;
const QK_TREFFER = ['/api/waechter/treffer'] as const;
const QK_STATUS = ['/api/waechter/status'] as const;

// ── API-Server-Konfiguration (nicht-statischer Modus) ────────────────────────
if (!STATIC_MODE && process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

// ── QueryClient ───────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STATIC_MODE ? Infinity : 60_000,
      // Im statischen Modus kein automatischer Refetch via React Query –
      // StaticDataProvider übernimmt das selbst per setInterval.
      refetchInterval: STATIC_MODE ? false : 5 * 60 * 1000,
      retry: STATIC_MODE ? false : 2,
      // Im statischen Modus Queries deaktivieren; Daten kommen via setQueryData.
      enabled: !STATIC_MODE,
    },
  },
});

// ── StaticDataProvider ────────────────────────────────────────────────────────
// Wird nur gerendert wenn STATIC_MODE = true.
// Lädt state.json, run_status.json und seen.json von GitHub und befüllt
// den React Query Cache, sodass alle bestehenden Hooks sofort Daten sehen.
function StaticDataProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

  const loadFromGitHub = useCallback(async () => {
    const [stateRes, statusRes, seenRes] = await Promise.allSettled([
      fetch(`${GITHUB_RAW}/state.json`).then((r) => r.json()),
      fetch(`${GITHUB_RAW}/run_status.json`).then((r) => r.json()),
      fetch(`${GITHUB_RAW}/seen.json`).then((r) => r.json()),
    ]);

    // ── WaechterState ──────────────────────────────────────────────────────
    if (stateRes.status === 'fulfilled') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = stateRes.value as any;
      const waechterState: WaechterState = {
        last_pegel_cm: raw.last_pegel_cm ?? null,
        last_pegel_time: raw.last_pegel_time ?? null,
        last_daily_report_date: raw.last_daily_report_date ?? null,
        history: Array.isArray(raw.history) ? raw.history : [],
        threshold_cm: PEGEL_THRESHOLD_CM,
      };
      qc.setQueryData(QK_STATE, waechterState);
    }

    // ── WaechterRunStatus ──────────────────────────────────────────────────
    if (statusRes.status === 'fulfilled') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = statusRes.value as any;
      const runStatus: WaechterRunStatus = {
        last_run_at: raw.last_run_at ?? null,
        rss_new_count: raw.rss_new_count ?? 0,
        last_error: raw.last_error ?? null,
      };
      qc.setQueryData(QK_STATUS, runStatus);
    }

    // ── WaechterTreffer ────────────────────────────────────────────────────
    // seen.json enthält alle bekannten Schlüssel (RSS-URLs, elwis:, club:, …).
    // Nur echte URLs (beginnend mit http) werden als Treffer angezeigt.
    if (seenRes.status === 'fulfilled') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seen = seenRes.value as any;
      const urls: string[] = Object.keys(seen).filter((k: string) =>
        k.startsWith('http'),
      );
      const treffer: WaechterTreffer = { urls, count: urls.length };
      qc.setQueryData(QK_TREFFER, treffer);
    }
  }, [qc]);

  useEffect(() => {
    void loadFromGitHub();
    // Alle 5 Minuten neu laden (passend zum Wächter-Intervall von 30 min).
    const interval = setInterval(() => void loadFromGitHub(), 5 * 60 * 1_000);
    return () => clearInterval(interval);
  }, [loadFromGitHub]);

  return <>{children}</>;
}

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
          {STATIC_MODE ? (
            <StaticDataProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </StaticDataProvider>
          ) : (
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          )}
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
