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

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const NFB_BACKGROUND_TASK = 'nfb-background-fetch';

/** AsyncStorage key where the API base URL is persisted for background use */
const API_BASE_URL_KEY = 'nfb_bg_api_base_url';

/**
 * Fallback static data source (used in GitHub Pages / STATIC_MODE deployment
 * where no API server is available). The NfB monitor pushes nfb.json here.
 */
const STATIC_NfB_URL =
  'https://raw.githubusercontent.com/5dbp6h96ch-droid/Reffenthal-waechter-/main/reffenthal-waechter/nfb.json';
const NfB_NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Mobile watch range (must match hook + UI label) */
const WATCH_KM_VON = 380;
const WATCH_KM_BIS = 415;
const NOTIFIED_IDS_KEY = 'nfb_notified_ids_v1';
const ANDROID_CHANNEL_ID = 'nfb-alerts';

/** Persist the base URL so the background task can reach the API */
export async function saveApiBaseUrl(baseUrl: string): Promise<void> {
  await AsyncStorage.setItem(API_BASE_URL_KEY, baseUrl).catch(() => {});
}

interface NfbMeldungRaw {
  nfb_id: string;
  titel: string;
  is_new: boolean;
  km_von: number | null;
  km_bis: number | null;
  first_seen?: string; // ISO 8601; used to derive is_new when field is missing
}

function overlapsWatchRange(m: NfbMeldungRaw): boolean {
  if (m.km_von == null || m.km_bis == null) return true;
  return m.km_von <= WATCH_KM_BIS && m.km_bis >= WATCH_KM_VON;
}

/** Called by the OS in the background. Must return a BackgroundFetchResult. */
async function backgroundTask(): Promise<BackgroundFetch.BackgroundFetchResult> {
  try {
    const baseUrl = await AsyncStorage.getItem(API_BASE_URL_KEY).catch(() => null);

    // Determine the NfB API URL: prefer the persisted API server base URL,
    // fall back to the static GitHub raw source for Pages/offline deployments.
    const nfbUrl = baseUrl ? `${baseUrl}/api/nfb` : STATIC_NfB_URL;

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
    if (!res.ok) return BackgroundFetch.BackgroundFetchResult.Failed;

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

    const newInRange = meldungen.filter((m) => m.is_new && overlapsWatchRange(m));
    if (newInRange.length === 0) return BackgroundFetch.BackgroundFetchResult.NoData;

    // Deduplicate — same store as the foreground hook
    const raw = await AsyncStorage.getItem(NOTIFIED_IDS_KEY).catch(() => null);
    const notifiedIds: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    const notifiedSet = new Set(notifiedIds);
    const toNotify = newInRange.filter((m) => !notifiedSet.has(m.nfb_id));

    if (toNotify.length === 0) return BackgroundFetch.BackgroundFetchResult.NoData;

    // Dynamic import works in TaskManager context
    const Notifications = await import('expo-notifications');

    // Explicitly verify notification permission before scheduling.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perm = (await Notifications.getPermissionsAsync()) as any;
    if (!perm.granted) return BackgroundFetch.BackgroundFetchResult.NoData;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'NfB-Meldungen',
        description: 'Neue Nachrichten für Binnenschifffahrt (Rhein km 380–415)',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#143D45',
      });
    }

    const title =
      toNotify.length === 1
        ? 'Neue NfB-Meldung · Rhein km 380–415'
        : `${toNotify.length} neue NfB-Meldungen · Rhein km 380–415`;
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

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
}

// Register the task definition at module load time (must be at top level)
TaskManager.defineTask(NFB_BACKGROUND_TASK, backgroundTask);

/**
 * Register the periodic background fetch.
 * Call this once from the root layout on native platforms.
 */
export async function registerNfbBackgroundFetch(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return; // User or system has disabled background fetch
    }
    await BackgroundFetch.registerTaskAsync(NFB_BACKGROUND_TASK, {
      minimumInterval: 15 * 60, // 15 minutes (iOS minimum)
      stopOnTerminate: false,    // keep running when app is terminated
      startOnBoot: true,         // restart after device reboot
    });
  } catch {
    // Background fetch may already be registered — ignore duplicate registration
  }
}
