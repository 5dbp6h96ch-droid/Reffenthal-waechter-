/**
 * useNfbNotifications
 *
 * Fires a local Expo notification when new NfB notices (is_new: true) within the
 * watch range (km 380–415) appear that the user has not been notified about before.
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
 *   requestPermissionsAsync is called on every invocation. This is safe—it returns
 *   the current status without prompting again—and handles the case where the user
 *   denied permission initially, then re-enabled it in system settings.
 *
 * Web: no-ops silently (expo-notifications has partial web support only).
 */

import { useEffect, useRef, useCallback } from 'react';
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
const ANDROID_CHANNEL_ID = 'nfb-alerts';

/** Mobile watch range — must agree with the "km 380–415" label in the NfB card */
const WATCH_KM_VON = 380;
const WATCH_KM_BIS = 415;

/**
 * Returns true when a notice's km range overlaps [WATCH_KM_VON, WATCH_KM_BIS].
 * Notices without km info are included (cannot rule out relevance).
 */
function isInWatchRange(m: NfbMeldung): boolean {
  if (m.km_von == null || m.km_bis == null) return true;
  return m.km_von <= WATCH_KM_BIS && m.km_bis >= WATCH_KM_VON;
}

/**
 * Module-level serialisation lock.
 * All calls chain onto this promise so concurrent invocations execute in order,
 * preventing two simultaneous reads of the same AsyncStorage value.
 */
let processingChain: Promise<void> = Promise.resolve();

async function scheduleNfbNotifications(items: NfbMeldung[]): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const Notifications = await import('expo-notifications');

    // Android: create channel before any permission request or notification
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'NfB-Meldungen',
        description: 'Neue Nachrichten für Binnenschifffahrt (Rhein km 380–415)',
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

    // Only consider notices within the mobile watch range (km 380–415)
    const newInRange = items.filter((m) => m.is_new && isInWatchRange(m));

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

/** Enqueue a notification-check run onto the serial processing chain */
function enqueueCheck(items: NfbMeldung[]): void {
  processingChain = processingChain.then(() => scheduleNfbNotifications(items));
}

export function useNfbNotifications(meldungen: NfbMeldung[] | undefined) {
  // Keep the latest meldungen accessible in the AppState listener without
  // triggering unnecessary re-subscriptions.
  const meldungenRef = useRef<NfbMeldung[] | undefined>(meldungen);
  meldungenRef.current = meldungen;

  const enqueue = useCallback((items: NfbMeldung[]) => {
    enqueueCheck(items);
  }, []);

  // Run whenever NfB data arrives/changes
  useEffect(() => {
    if (!meldungen) return;
    enqueue(meldungen);
  }, [meldungen, enqueue]);

  // Re-run on every foreground resume so that:
  // a) users who denied then re-enabled permission in system settings get notified
  // b) notices still marked is_new when the user switches back get a second chance
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const current = meldungenRef.current;
        if (current) enqueue(current);
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [enqueue]);
}
