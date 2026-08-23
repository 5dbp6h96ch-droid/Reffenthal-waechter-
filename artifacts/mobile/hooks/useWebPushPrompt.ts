import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';

const PUBLIC_VAPID_KEY = 'BBJUwBC0zY1yyKsocf0jrOspxf6mlVmWMUFxEDXFUFArZsmmIBDbCOQrsdWimn3iBxvoX8Rdz7e5eO6Ql2sshTY';

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function waitForActiveServiceWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (registration.active) return registration;
  const worker = registration.installing ?? registration.waiting;
  if (!worker) throw new Error('Service Worker konnte nicht gestartet werden.');
  await new Promise<void>((resolve, reject) => {
    const onStateChange = () => {
      if (worker.state === 'activated') {
        worker.removeEventListener('statechange', onStateChange);
        resolve();
      } else if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', onStateChange);
        reject(new Error('Service Worker wurde verworfen, bevor er aktiv wurde.'));
      }
    };
    worker.addEventListener('statechange', onStateChange);
    onStateChange();
  });
  if (!registration.active) throw new Error('Service Worker ist nicht aktiv.');
  return registration;
}

async function persistPushState(
  userId: string,
  pushSubscription: PushSubscription,
): Promise<void> {
  if (!supabase) throw new Error('Push ist momentan nicht konfiguriert.');

  const json = pushSubscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Push-Subscription ist unvollständig.');
  }

  const { error: saveError } = await supabase.from('web_push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (saveError) throw saveError;

  const { error: settingsError } = await supabase.from('user_settings').upsert({
    user_id: userId,
    push_enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (settingsError) throw settingsError;
}

export function useWebPushPrompt() {
  const [status, setStatus] = useState<'idle' | 'activating' | 'active'>('idle');

  useEffect(() => {
    let cancelled = false;

    const restoreExistingPush = async () => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') return;
      if (!supabaseConfigured || !supabase) return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) return;

        const registration = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
        const activeRegistration = await waitForActiveServiceWorker(registration);
        const existing = await activeRegistration.pushManager.getSubscription();
        if (!existing) return;

        await persistPushState(userData.user.id, existing);
        if (!cancelled) setStatus('active');
      } catch (error) {
        console.warn('[WebPush] Vorhandene Subscription konnte nicht wiederhergestellt werden:', error);
      }
    };

    void restoreExistingPush();
    return () => {
      cancelled = true;
    };
  }, []);

  const activate = useCallback(async () => {
    if (status === 'activating' || status === 'active') return;
    setStatus('activating');
    try {
      if (Platform.OS !== 'web' || typeof window === 'undefined') {
        throw new Error('Push-Nachrichten sind nur im Web verfügbar.');
      }
      if (!supabaseConfigured || !supabase) {
        throw new Error('Push ist momentan nicht konfiguriert.');
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        throw new Error('Bitte zuerst anmelden, um Push-Nachrichten zu aktivieren.');
      }
      const currentUserId = userData.user.id;

      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('Push-Nachrichten werden in diesem Browser nicht unterstützt.');
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Benachrichtigungen wurden nicht erlaubt.');
      }

      const registration = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
      const activeRegistration = await waitForActiveServiceWorker(registration);
      const existing = await activeRegistration.pushManager.getSubscription();
      const pushSubscription = existing ?? await activeRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(PUBLIC_VAPID_KEY),
      });

      await persistPushState(currentUserId, pushSubscription);

      const { error: testError } = await supabase.functions.invoke('send-test-push');
      if (testError) throw testError;

      setStatus('active');
    } catch (error) {
      console.error('[WebPush]', error);
      setStatus('idle');
      window.alert(error instanceof Error ? error.message : 'Push konnte nicht aktiviert werden.');
    }
  }, [status]);

  return {
    visible: Platform.OS === 'web' && supabaseConfigured && !!supabase,
    status,
    activate,
  };
}
