import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';

const PUBLIC_VAPID_KEY = 'BBJUwBC0zY1yyKsocf0jrOspxf6mlVmWMUFxEDXFUFArZsmmIBDbCOQrsdWimn3iBxvoX8Rdz7e5eO6Ql2sshTY';
const BUTTON_ID = 'rheinschiffer-web-push-test-button';

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function isStandaloneWebApp(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function useWebPushPrompt(): void {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !supabaseConfigured || !supabase || typeof window === 'undefined') return;
    if (!isStandaloneWebApp()) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

    let cancelled = false;

    const removeButton = () => {
      buttonRef.current?.remove();
      buttonRef.current = null;
    };

    const setupForUser = async (userId: string | null) => {
      removeButton();
      if (cancelled || !userId) return;

      const existing = await navigator.serviceWorker.getRegistration('/');
      const subscription = existing ? await existing.pushManager.getSubscription() : null;
      if (subscription || Notification.permission === 'granted') return;
      if (document.getElementById(BUTTON_ID)) return;

      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = '🔔 Push-Nachrichten aktivieren';
      Object.assign(button.style, {
        position: 'fixed',
        left: '18px',
        right: '18px',
        bottom: '76px',
        zIndex: '99999',
        border: '0',
        borderRadius: '12px',
        padding: '14px 18px',
        background: '#0A84FF',
        color: '#FFFFFF',
        font: '600 15px -apple-system, BlinkMacSystemFont, sans-serif',
        boxShadow: '0 6px 20px rgba(0,0,0,.18)',
        cursor: 'pointer',
      });

      button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = 'Push wird aktiviert …';
        try {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');

          const registration = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
          const pushSubscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(PUBLIC_VAPID_KEY),
          });

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

          const { error: testError } = await supabase.functions.invoke('send-test-push');
          if (testError) throw testError;

          button.textContent = '✓ Push-Nachrichten aktiviert';
          button.style.background = '#34C759';
          window.setTimeout(() => button.remove(), 2200);
        } catch (error) {
          console.error('[WebPush]', error);
          button.disabled = false;
          button.textContent = '🔔 Push-Nachrichten aktivieren';
          window.alert(error instanceof Error ? error.message : 'Push konnte nicht aktiviert werden.');
        }
      });

      buttonRef.current = button;
      document.body.appendChild(button);
    };

    supabase.auth.getUser().then(({ data }) => {
      void setupForUser(data.user?.id ?? null);
    }).catch(() => {});

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void setupForUser(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      removeButton();
    };
  }, []);
}
