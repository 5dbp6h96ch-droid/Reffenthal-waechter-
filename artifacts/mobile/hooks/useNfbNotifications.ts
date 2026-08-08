/**
 * useNfbNotifications
 *
 * Fires a local Expo notification when new NfB notices (is_new: true) within the
 * user-selected km watch range appear that the user has not been notified about before.
 *
 * The watch range (kmVon / kmBis) is passed by the caller and reflects whatever the
 * user has persisted in AsyncStorage. Notices without km info are always included
 * (cannot rule out relevance).
 *
 * Delivery paths:
 *   - Foreground/active: runs whenever NfB data loads or the app returns to foreground
 *   - Background: handled by tasks/nfbBackgroundFetch.ts (expo-background-fetch)
 *
 * Deduplication guarantee:
 *   A module-level lock serialises concurrent invocations so that two simultaneous
 *   calls (e.g. initial data load + AppState foreground event) cannot both read the
 *   same AsyncStorage value and schedule duplicate notifications.
 *
 * Permission handling:
 *   requestPermissionsAsync is called only when sending notifications. On mount and
 *   foreground-resume, getPermissionsAsync is called (non-prompting) to keep the
 *   returned osPermission state current.
 *
 * User preference:
 *   The user can toggle notifications on/off via the returned `toggleNotifEnabled`
 *   function. The preference is persisted in AsyncStorage under NOTIF_ENABLED_KEY.
 *   When disabled, no notifications are scheduled even if OS permission is granted.
 *
 * Web: no-ops silently (expo-notifications has partial web support only).
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Local type alias matching the generated API schema (api-client-react types
// are not resolved by the mobile tsconfig due to missing project references).
type NfbMeldung = {
  nfb_id: string; titel: string; is_new: boolean;
  km_von: number | null; km_bis: number | null;
  gueltig_ab: string | null; gueltig_bis: string | null;
  url: string | null; first_seen: string;
};

const NOTIFIED_IDS_KEY = 'nfb_notified_ids_v1';
const NOTIF_ENABLED_KEY = 'nfb_notif_enabled_v1';
const ANDROID_CHANNEL_ID = 'nfb-alerts';

/** OS-level permission state (non-exhaustive; covers the states we care about). */
export type OsPermission = 'granted' | 'denied' | 'undetermined' | 'unknown';

/**
 * Returns true when a notice's km range overlaps [watchKmVon, watchKmBis].
 * Notices without km info are included (cannot rule out relevance).
 */
function isInWatchRange(m: NfbMeldung, watchKmVon: number, watchKmBis: number): boolean {
  if (m.km_von == null || m.km_bis == null) return true;
  return m.km_von <= watchKmBis && m.km_bis >= watchKmVon;
}

/**
 * Module-level serialisation lock.
 * All calls chain onto this promise so concurrent invocations execute in order,
 * preventing two simultaneous reads of the same AsyncStorage value.
 */
let processingChain: Promise<void> = Promise.resolve();

/** Resolve a raw permission result object to our OsPermission discriminant. */
function permResultToOsPermission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any,
): OsPermission {
  if (raw.granted === true) return 'granted';
  const status: string = raw.status ?? '';
  if (status === 'denied') return 'denied';
  if (status === 'undetermined') return 'undetermined';
  return 'unknown';
}

async function scheduleNfbNotifications(
  items: NfbMeldung[],
  watchKmVon: number,
  watchKmBis: number,
  userEnabled: boolean,
  onPermissionResolved?: (perm: OsPermission) => void,
): Promise<void> {
  if (Platform.OS === 'web') return;
  // User opted out — do nothing (don't even request permission)
  if (!userEnabled) return;

  try {
    const Notifications = await import('expo-notifications');

    const kmLabel = `Rhein km ${watchKmVon}–${watchKmBis}`;

    // Android: create channel before any permission request or notification
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'NfB-Meldungen',
        description: `Neue Nachrichten für Binnenschifffahrt (${kmLabel})`,
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#143D45',
      });
    }

    // Configure foreground presentation behaviour
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    // Request permission — safe to call repeatedly; returns current state if
    // already determined. Re-running on foreground handles the case where the
    // user enabled notifications in system settings after an initial denial.
    // Cast required: TS declaration for NotificationPermissionsStatus does not
    // expose the `granted` field from its PermissionResponse base in SDK 0.32.x.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const permResult = (await Notifications.requestPermissionsAsync()) as any;
    const granted: boolean = permResult.granted === true;

    // Feed the resolved permission back to the hook so UI stays in sync
    // without waiting for the next foreground-resume cycle.
    onPermissionResolved?.(permResultToOsPermission(permResult));

    // Only consider notices within the user's watch range
    const newInRange = items.filter((m) => m.is_new && isInWatchRange(m, watchKmVon, watchKmBis));

    // Keep badge count in sync even before we decide to fire a notification
    if (granted) {
      await Notifications.setBadgeCountAsync(newInRange.length).catch(() => {});
    }

    if (!granted || newInRange.length === 0) return;

    // Load IDs we have already notified about — inside the lock, so concurrent
    // calls see the mutually-exclusive view of the store.
    const raw = await AsyncStorage.getItem(NOTIFIED_IDS_KEY).catch(() => null);
    const notifiedIds: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    const notifiedSet = new Set(notifiedIds);

    // Filter to only notices not yet notified
    const toNotify = newInRange.filter((m) => !notifiedSet.has(m.nfb_id));
    if (toNotify.length === 0) return;

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
        // data payload used by the tap-response listener to deep-link to NfB section
        data: { screen: 'nfb' },
      },
      trigger: null, // fire immediately
      // Attach to the Android channel created above
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    });

    // Persist newly-notified IDs — do this AFTER scheduling so a scheduling
    // failure leaves the IDs in an un-notified state (retry on next run).
    // Cap at 500 to avoid unbounded growth.
    const merged = [...notifiedIds, ...toNotify.map((m) => m.nfb_id)];
    await AsyncStorage.setItem(
      NOTIFIED_IDS_KEY,
      JSON.stringify(merged.slice(-500)),
    ).catch(() => {});
  } catch (err) {
    // Notifications are opt-in; never propagate errors to callers
    if (__DEV__) console.warn('[useNfbNotifications]', err);
  }
}

/** Read OS permission state without prompting the user. */
async function readOsPermission(): Promise<OsPermission> {
  if (Platform.OS === 'web') return 'unknown';
  try {
    const Notifications = await import('expo-notifications');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await Notifications.getPermissionsAsync()) as any;
    if (result.granted === true) return 'granted';
    // expo-notifications uses 'denied' or 'undetermined' in status field
    const status: string = result.status ?? '';
    if (status === 'denied') return 'denied';
    if (status === 'undetermined') return 'undetermined';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Enqueue a notification-check run onto the serial processing chain */
function enqueueCheck(
  items: NfbMeldung[],
  watchKmVon: number,
  watchKmBis: number,
  userEnabled: boolean,
  onPermissionResolved?: (perm: OsPermission) => void,
): void {
  processingChain = processingChain.then(() =>
    scheduleNfbNotifications(items, watchKmVon, watchKmBis, userEnabled, onPermissionResolved),
  );
}

export interface NfbNotificationControls {
  /** Whether the user has opted in to NfB push notifications. */
  notifEnabled: boolean;
  /** Current OS-level permission state (does not prompt). */
  osPermission: OsPermission;
  /** Toggle the user preference and persist it to AsyncStorage. */
  toggleNotifEnabled: () => void;
}

export function useNfbNotifications(
  meldungen: NfbMeldung[] | undefined,
  watchKmVon: number,
  watchKmBis: number,
): NfbNotificationControls {
  const [notifEnabled, setNotifEnabled] = useState<boolean>(true);
  const [osPermission, setOsPermission] = useState<OsPermission>('unknown');
  // Guard: do not schedule any notifications until the stored preference has
  // been resolved from AsyncStorage. Prevents the launch-time race where the
  // hook's default (true) fires a check before a stored 'false' is loaded.
  const [prefReady, setPrefReady] = useState<boolean>(false);

  // Load persisted user preference on mount
  useEffect(() => {
    AsyncStorage.getItem(NOTIF_ENABLED_KEY)
      .then((val) => {
        if (val === 'false') setNotifEnabled(false);
        // Default (null / 'true' / anything else) = enabled
      })
      .catch(() => {})
      .finally(() => setPrefReady(true));
  }, []);

  // Refresh OS permission state on mount
  useEffect(() => {
    if (Platform.OS === 'web') return;
    readOsPermission().then(setOsPermission).catch(() => {});
  }, []);

  // Refresh OS permission state when app comes to foreground
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        readOsPermission().then(setOsPermission).catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  // Keep the latest values accessible in effects without triggering re-subscriptions
  const meldungenRef = useRef<NfbMeldung[] | undefined>(meldungen);
  meldungenRef.current = meldungen;
  const watchKmVonRef = useRef(watchKmVon);
  watchKmVonRef.current = watchKmVon;
  const watchKmBisRef = useRef(watchKmBis);
  watchKmBisRef.current = watchKmBis;
  const notifEnabledRef = useRef(notifEnabled);
  notifEnabledRef.current = notifEnabled;
  const prefReadyRef = useRef(prefReady);
  prefReadyRef.current = prefReady;

  // Stable ref so the AppState handler can always call the latest setter
  const setOsPermissionRef = useRef(setOsPermission);
  setOsPermissionRef.current = setOsPermission;

  const enqueue = useCallback(
    (items: NfbMeldung[], kmVon: number, kmBis: number, enabled: boolean) => {
      // Pass setOsPermission so the permission state updates the moment
      // requestPermissionsAsync() resolves inside scheduleNfbNotifications —
      // without waiting for the next foreground-resume cycle.
      enqueueCheck(items, kmVon, kmBis, enabled, (perm) => setOsPermissionRef.current(perm));
    },
    [],
  );

  // Run whenever NfB data, the watch range, or the user preference changes.
  // Guard on prefReady so we never schedule before the stored preference is known.
  useEffect(() => {
    if (!meldungen || !prefReady) return;
    enqueue(meldungen, watchKmVon, watchKmBis, notifEnabled);
  }, [meldungen, watchKmVon, watchKmBis, notifEnabled, prefReady, enqueue]);

  // Re-run on every foreground resume so that:
  // a) users who denied then re-enabled permission in system settings get notified
  // b) notices still marked is_new when the user switches back get a second chance
  // We also gate on prefReady to avoid the launch-time race.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const current = meldungenRef.current;
        if (current && prefReadyRef.current) {
          enqueue(
            current,
            watchKmVonRef.current,
            watchKmBisRef.current,
            notifEnabledRef.current,
          );
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [enqueue]);

  const toggleNotifEnabled = useCallback(() => {
    setNotifEnabled((prev) => {
      const next = !prev;
      AsyncStorage.setItem(NOTIF_ENABLED_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  return { notifEnabled, osPermission, toggleNotifEnabled };
}
