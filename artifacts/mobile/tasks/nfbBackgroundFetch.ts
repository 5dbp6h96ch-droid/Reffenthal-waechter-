/**
 * NfB Background Fetch Task
 *
 * Polls /api/nfb while the app is backgrounded/terminated and delivers a local
 * notification if any new in-range notices appear that have not been previously
 * notified about.
 *
 * Platform behaviour:
 *   iOS  — minimum interval ~15 min (OS-controlled)
 *   Android — more flexible, defaults to 15 min minimum
 *   Web  — not registered (no-op guard at registration site)
 *
 * Registration: call `registerNfbBackgroundFetch()` from _layout.tsx.
 * Task name is exported so callers can unregister if needed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// expo-task-manager und expo-background-fetch sind native Module die in
// manchen Expo-Go-Versionen nicht verfügbar sind. Dynamischer Import verhindert
// einen Crash beim Modulload falls das native Modul fehlt.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let TaskManager: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let BackgroundFetch: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  TaskManager = require('expo-task-manager');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  BackgroundFetch = require('expo-background-fetch');
} catch {
  // Nativer Module nicht verfügbar (z.B. Expo Go ohne Background-Task-Support)
  // → App läuft weiter, nur ohne Hintergrund-Benachrichtigungen
}

export const NFB_BACKGROUND_TASK = 'nfb-background-fetch';

/** AsyncStorage key where the API base URL is persisted for background use */
const API_BASE_URL_KEY = 'nfb_bg_api_base_url';
/** Must stay in sync with the constant in useNfbNotifications.ts */
const NOTIF_ENABLED_KEY = 'nfb_notif_enabled_v1';

/** AsyncStorage key where the user's NfB km range is persisted (see index.tsx) */
const NFB_KM_KEY = 'nfb_km_range';
/**
 * Fallback static data source (used in GitHub Pages / STATIC_MODE deployment
 * where no API server is available). The NfB monitor pushes nfb.json here.
 */
const STATIC_NfB_URL =
  'https://raw.githubusercontent.com/5dbp6h96ch-droid/Reffenthal-waechter-/main/reffenthal-waechter/nfb.json';
const NfB_NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Default watch range — matches the app default in index.tsx */
const DEFAULT_KM_VON = 380;
const DEFAULT_KM_BIS = 415;
const NOTIFIED_IDS_KEY = 'nfb_notified_ids_v1';
const ANDROID_CHANNEL_ID = 'nfb-alerts';

/** Persist the base URL so the background task can reach the API */
export async function saveApiBaseUrl(baseUrl: string): Promise<void> {
  await AsyncStorage.setItem(API_BASE_URL_KEY, baseUrl).catch(() => {});
}

/** Load the user's persisted km range, falling back to the default 380–415 */
async function loadKmRange(): Promise<{ von: number; bis: number }> {
  try {
    const val = await AsyncStorage.getItem(NFB_KM_KEY);
    if (val) {
      const parsed = JSON.parse(val) as { von: number; bis: number };
      if (typeof parsed.von === 'number' && typeof parsed.bis === 'number') {
        return parsed;
      }
    }
  } catch {
    // ignore — fall through to default
  }
  return { von: DEFAULT_KM_VON, bis: DEFAULT_KM_BIS };
}
interface NfbMeldungRaw {
  nfb_id: string;
  titel: string;
  is_new: boolean;
  km_von: number | null;
  km_bis: number | null;
  first_seen?: string; // ISO 8601; used to derive is_new when field is missing
}

function overlapsWatchRange(m: NfbMeldungRaw, watchKmVon: number, watchKmBis: number): boolean {
  if (m.km_von == null || m.km_bis == null) return true;
  return m.km_von <= watchKmBis && m.km_bis >= watchKmVon;
}

/** Called by the OS in the background. Must return a BackgroundFetchResult. */
// Numeric constants so the function can return without a BackgroundFetch reference
const BG_RESULT_NO_DATA = 1;
const BG_RESULT_NEW_DATA = 2;
const BG_RESULT_FAILED   = 3;

/** Called by the OS in the background. Must return a numeric BackgroundFetchResult. */
async function backgroundTask(): Promise<number> {
  if (!BackgroundFetch) return BG_RESULT_FAILED;
  try {
    // Respect the user's opt-out preference before doing any network work
    const notifEnabledVal = await AsyncStorage.getItem(NOTIF_ENABLED_KEY).catch(() => null);
    if (notifEnabledVal === 'false') return BG_RESULT_NO_DATA;

    const [baseUrl, kmRange] = await Promise.all([
      AsyncStorage.getItem(API_BASE_URL_KEY).catch(() => null),
      loadKmRange(),
    ]);

    const { von: watchKmVon, bis: watchKmBis } = kmRange;
    const kmLabel = `Rhein km ${watchKmVon}–${watchKmBis}`;

    // Determine the NfB API URL: prefer the persisted API server base URL with
    // km range params, fall back to the static GitHub raw source for
    // Pages/offline deployments (static JSON has no server-side filtering, so
    // we filter client-side via overlapsWatchRange below).
    let nfbUrl: string;
    if (baseUrl) {
      const params = new URLSearchParams({
        km_von: String(watchKmVon),
        km_bis: String(watchKmBis),
      });
      nfbUrl = `${baseUrl}/api/nfb?${params.toString()}`;
    } else {
      nfbUrl = STATIC_NfB_URL;
    }

    // AbortSignal.timeout() is not available in React Native — use a manual
    // AbortController + setTimeout pair instead.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(nfbUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) return BG_RESULT_FAILED;

    const json = (await res.json()) as { meldungen?: NfbMeldungRaw[] };
    const rawMeldungen: NfbMeldungRaw[] = Array.isArray(json.meldungen) ? json.meldungen : [];

    // Derive is_new locally if not present (static nfb.json may omit the field)
    const now = Date.now();
    const meldungen: NfbMeldungRaw[] = rawMeldungen.map((m) => ({
      ...m,
      is_new:
        typeof m.is_new === 'boolean'
          ? m.is_new
          : m.first_seen
            ? now - new Date(m.first_seen).getTime() < NfB_NEW_WINDOW_MS
            : false,
    }));

    // Apply client-side range filter (server already filtered when baseUrl is
    // set, but the static fallback returns all notices).
    const newInRange = meldungen.filter(
      (m) => m.is_new && overlapsWatchRange(m, watchKmVon, watchKmBis),
    );
    if (newInRange.length === 0) return BG_RESULT_NO_DATA;

    // Deduplicate — same store as the foreground hook
    const raw = await AsyncStorage.getItem(NOTIFIED_IDS_KEY).catch(() => null);
    const notifiedIds: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    const notifiedSet = new Set(notifiedIds);
    const toNotify = newInRange.filter((m) => !notifiedSet.has(m.nfb_id));

    if (toNotify.length === 0) return BG_RESULT_NO_DATA;

    // Dynamic import works in TaskManager context
    const Notifications = await import('expo-notifications');

    // Explicitly verify notification permission before scheduling.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perm = (await Notifications.getPermissionsAsync()) as any;
    if (!perm.granted) return BG_RESULT_NO_DATA;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'NfB-Meldungen',
        description: `Neue Nachrichten für Binnenschifffahrt (${kmLabel})`,
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#143D45',
      });
    }

    const title =
      toNotify.length === 1
        ? `Neue NfB-Meldung · ${kmLabel}`
        : `${toNotify.length} neue NfB-Meldungen · ${kmLabel}`;
    const body =
      toNotify.length === 1
        ? toNotify[0].titel
        : toNotify.map((m) => m.titel).join('\n');

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        badge: newInRange.length,
        data: { screen: 'nfb' },
      },
      trigger: null,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    });

    const merged = [...notifiedIds, ...toNotify.map((m) => m.nfb_id)];
    await AsyncStorage.setItem(
      NOTIFIED_IDS_KEY,
      JSON.stringify(merged.slice(-500)),
    ).catch(() => {});

    return BG_RESULT_NEW_DATA;
  } catch {
    return BG_RESULT_FAILED;
  }
}

// Task-Definition beim Modulload registrieren — aber nur wenn TaskManager verfügbar.
try {
  TaskManager?.defineTask(NFB_BACKGROUND_TASK, backgroundTask);
} catch {
  // Kein Crash wenn native Module fehlt
}

/**
 * Register the periodic background fetch.
 * Call this once from the root layout on native platforms.
 */
export async function registerNfbBackgroundFetch(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!BackgroundFetch || !TaskManager) return; // native module unavailable
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return;
    }
    await BackgroundFetch.registerTaskAsync(NFB_BACKGROUND_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Already registered or unavailable — ignore
  }
}

