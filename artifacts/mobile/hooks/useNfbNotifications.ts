import { useEffect, useRef, useCallback, useState } from 'react';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWebPushPrompt } from '@/hooks/useWebPushPrompt';

type NfbMeldung = {
  nfb_id: string; titel: string; is_new: boolean;
  km_von: number | null; km_bis: number | null;
  gueltig_ab: string | null; gueltig_bis: string | null;
  url: string | null; first_seen: string;
};

const NOTIFIED_IDS_KEY = 'nfb_notified_ids_v1';
const NOTIF_ENABLED_KEY = 'nfb_notif_enabled_v1';
const ANDROID_CHANNEL_ID = 'nfb-alerts';

export type OsPermission = 'granted' | 'denied' | 'undetermined' | 'unknown';

function isInWatchRange(m: NfbMeldung, watchKmVon: number, watchKmBis: number): boolean {
  if (m.km_von == null || m.km_bis == null) return true;
  return m.km_von <= watchKmBis && m.km_bis >= watchKmVon;
}

let processingChain: Promise<void> = Promise.resolve();

function permResultToOsPermission(raw: any): OsPermission {
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
  if (!userEnabled) return;

  try {
    const Notifications = await import('expo-notifications');
    const kmLabel = `Rhein km ${watchKmVon}–${watchKmBis}`;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'NfB-Meldungen',
        description: `Neue Nachrichten für Binnenschifffahrt (${kmLabel})`,
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#143D45',
      });
    }

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const permResult = (await Notifications.requestPermissionsAsync()) as any;
    const granted: boolean = permResult.granted === true;
    onPermissionResolved?.(permResultToOsPermission(permResult));

    const newInRange = items.filter((m) => m.is_new && isInWatchRange(m, watchKmVon, watchKmBis));
    if (granted) await Notifications.setBadgeCountAsync(newInRange.length).catch(() => {});
    if (!granted || newInRange.length === 0) return;

    const raw = await AsyncStorage.getItem(NOTIFIED_IDS_KEY).catch(() => null);
    const notifiedIds: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    const notifiedSet = new Set(notifiedIds);
    const toNotify = newInRange.filter((m) => !notifiedSet.has(m.nfb_id));
    if (toNotify.length === 0) return;

    const title = toNotify.length === 1
      ? `Neue NfB-Meldung · ${kmLabel}`
      : `${toNotify.length} neue NfB-Meldungen · ${kmLabel}`;
    const body = toNotify.length === 1
      ? toNotify[0].titel
      : toNotify.map((m) => m.titel).join('\n');

    await Notifications.scheduleNotificationAsync({
      content: { title, body, badge: newInRange.length, data: { screen: 'nfb' } },
      trigger: null,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    });

    const merged = [...notifiedIds, ...toNotify.map((m) => m.nfb_id)];
    await AsyncStorage.setItem(NOTIFIED_IDS_KEY, JSON.stringify(merged.slice(-500))).catch(() => {});
  } catch (err) {
    if (__DEV__) console.warn('[useNfbNotifications]', err);
  }
}

async function readOsPermission(): Promise<OsPermission> {
  if (Platform.OS === 'web') return 'unknown';
  try {
    const Notifications = await import('expo-notifications');
    const result = (await Notifications.getPermissionsAsync()) as any;
    if (result.granted === true) return 'granted';
    const status: string = result.status ?? '';
    if (status === 'denied') return 'denied';
    if (status === 'undetermined') return 'undetermined';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

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
  notifEnabled: boolean;
  osPermission: OsPermission;
  toggleNotifEnabled: () => void;
}

export function useNfbNotifications(
  meldungen: NfbMeldung[] | undefined,
  watchKmVon: number,
  watchKmBis: number,
): NfbNotificationControls {
  useWebPushPrompt();

  const [notifEnabled, setNotifEnabled] = useState<boolean>(true);
  const [osPermission, setOsPermission] = useState<OsPermission>('unknown');
  const [prefReady, setPrefReady] = useState<boolean>(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTIF_ENABLED_KEY)
      .then((val) => { if (val === 'false') setNotifEnabled(false); })
      .catch(() => {})
      .finally(() => setPrefReady(true));
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    readOsPermission().then(setOsPermission).catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') readOsPermission().then(setOsPermission).catch(() => {});
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

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
  const setOsPermissionRef = useRef(setOsPermission);
  setOsPermissionRef.current = setOsPermission;

  const enqueue = useCallback(
    (items: NfbMeldung[], kmVon: number, kmBis: number, enabled: boolean) => {
      enqueueCheck(items, kmVon, kmBis, enabled, (perm) => setOsPermissionRef.current(perm));
    },
    [],
  );

  useEffect(() => {
    if (!meldungen || !prefReady) return;
    enqueue(meldungen, watchKmVon, watchKmBis, notifEnabled);
  }, [meldungen, watchKmVon, watchKmBis, notifEnabled, prefReady, enqueue]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const current = meldungenRef.current;
        if (current && prefReadyRef.current) {
          enqueue(current, watchKmVonRef.current, watchKmBisRef.current, notifEnabledRef.current);
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
