import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';

// Basis-Pfad des Deployments (GitHub Pages: /Reffenthal-waechter-, Test: leer)
const PUSH_SW_BASE = (process.env.EXPO_ROUTER_BASE_URL ?? '').replace(/\/$/, '');

const PUBLIC_VAPID_KEY = 'BEE2qq7KlarDR6GiQtCIbc05XIC28dzm7Hor0b6V3rvJeASaVJi2Hacq_glgNNxMirnwz5L47lRUXD_nleru5i4';

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

export function useWebPushPrompt() {
  const [status, setStatus] = useState<'idle' | 'activating' | 'active'>('idle');

  // Beim erneuten Öffnen der App den bereits vorhandenen Browser-Push erkennen.
  // Die Push-Subscription lebt unabhängig vom React-State weiter.
  useEffect(() => {
    let cancelled = false;

    const restoreExistingPush = async () => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') return;
      if (!supabaseConfigured || !supabase) return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      try {
        const registration = await navigator.serviceWorker.register(`${PUSH_SW_BASE}/push-sw.js`, { scope: `${PUSH_SW_BASE}/` });
        const activeRegistration = await waitForActiveServiceWorker(registration);
        const existing = await activeRegistration.pushManager.getSubscription();
        if (existing && !cancelled) setStatus('active');
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

      const registration = await navigator.serviceWorker.register(`${PUSH_SW_BASE}/push-sw.js`, { scope: `${PUSH_SW_BASE}/` });
      const activeRegistration = await waitForActiveServiceWorker(registration);
      const existing = await activeRegistration.pushManager.getSubscription();
      const pushSubscription = existing ?? await activeRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(PUBLIC_VAPID_KEY),
      });

      const json = pushSubscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Push-Subscription ist unvollständig.');
      }

      const { error: saveError } = await supabase.from('web_push_subscriptions').upsert({
        user_id: currentUserId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (saveError) throw saveError;

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
