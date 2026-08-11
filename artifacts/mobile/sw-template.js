/**
 * R(h)einschiffer – Service Worker v1
 *
 * Cache-Version: __CACHE_VERSION__   (wird vom CI mit dem Git-SHA ersetzt)
 *
 * Strategie:
 *   Navigation / HTML  → Network First  (immer aktuelle index.html laden)
 *   Hashed Assets      → Cache First    (unveränderlich, z.B. _expo/static/…)
 *   Sonstiges          → Stale-While-Revalidate
 *   Cross-Origin       → unberührt (GitHub Raw, Pegelonline, HVZ-GIF, …)
 */

const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME    = `rheinschiffer-${CACHE_VERSION}`;
const BASE          = '/Reffenthal-waechter-';

// ── Install ───────────────────────────────────────────────────────────────────
// skipWaiting() sofort beim Install → neue SW-Version übernimmt ohne Warten.
// Kombiniert mit clients.claim() im Activate werden alle offenen Tabs
// sofort auf die neue Version umgeschaltet (kein Tab-Schließen nötig).
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // App-Shell vorab cachen
      cache.addAll([BASE + '/', BASE + '/index.html']).catch(() => { /* harmlos */ })
    )
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
// Reihenfolge:
//   1. Alte Caches löschen (damit kein altes Bundle mehr ausgeliefert wird)
//   2. clients.claim() – übernimmt sofort alle offenen Tabs
//   3. Alle Fenster neu laden – damit sie die frische index.html + neues Bundle
//      holen, nicht die alte gecachte HTML aus dem alten SW-Cache.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith('rheinschiffer-') && n !== CACHE_NAME)
            .map((n) => {
              console.log('[SW] Alter Cache gelöscht:', n);
              return caches.delete(n);
            })
        )
      )
      // clients.claim() in try-catch: auf iOS Safari kann claim() werfen.
      // Fehler darf activate-Handler nicht blockieren.
      .then(() => clients.claim().catch((e) => console.warn('[SW] clients.claim() Fehler:', e)))
      .then(() =>
        // Alle offenen Fenster via postMessage informieren (SW_UPDATED).
        // Die Seite lauscht in +html.tsx (controllerchange) und sw-diag.js (message).
        // sw-diag.js fällt auf ready-no-controller-Reload zurück falls controllerchange
        // auf iOS Safari nicht feuert.
        // KEIN client.navigate(): iOS Safari benötigt user-gesture-Kontext.
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then((windowClients) => {
            console.log('[SW] Sende SW_UPDATED an', windowClients.length, 'Fenster.');
            windowClients.forEach((client) => {
              client.postMessage({ type: 'SW_UPDATED' });
            });
          })
          .catch((e) => console.warn('[SW] postMessage-Loop Fehler:', e))
      )
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-Origin nicht anfassen (APIs, GitHub Raw, Pegelonline, HVZ …)
  if (url.origin !== location.origin) return;

  const path = url.pathname;

  // Navigation / HTML → Network First
  if (req.mode === 'navigate' || path === BASE + '/' || path === BASE) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Hashed Expo-Assets → Cache First (unveränderlich)
  if (/\/_expo\/static\//.test(path) || /\.[0-9a-f]{8,}\.(js|css|woff2?)$/i.test(path)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Alles andere (Icons, Bilder ohne Hash …) → Stale-While-Revalidate
  event.respondWith(staleWhileRevalidate(req));
});

// ── Strategien ────────────────────────────────────────────────────────────────

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached ?? new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const cache = await caches.open(CACHE_NAME);
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fresh  = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached ?? await fresh ?? new Response('Offline', { status: 503 });
}

// ── Nachrichten vom Client ────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING empfangen – aktiviere neue Version.');
    self.skipWaiting();
  }
});
