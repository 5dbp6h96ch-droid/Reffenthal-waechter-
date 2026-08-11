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
//   1. Alte Caches löschen → kein altes Bundle mehr verfügbar
//   2. clients.claim() → übernimmt alle offenen Tabs sofort;
//      löst in jedem kontrollierten Fenster das 'controllerchange'-Event aus
//   3. SW_UPDATED postMessage → Fallback-Reload für Clients, die
//      controllerchange verpasst haben (z.B. iOS Safari edge case)
//
// Warum KEIN client.navigate():
//   client.navigate() ist im activate-Handler auf iOS Safari unzuverlässig
//   (darf nur aus einem user-gesture-Context aufgerufen werden und schlägt
//   sonst lautlos fehl). Stattdessen reagiert sw-diag.js auf der Seite auf
//   'controllerchange' + 'SW_UPDATED' und ruft window.location.reload(true).
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
      .then(() => clients.claim())
      .then(() =>
        // Sende SW_UPDATED an alle Fenster als Fallback-Reload-Signal.
        // Der primäre Mechanismus (controllerchange) wird durch clients.claim()
        // oben bereits ausgelöst und von sw-diag.js in test/index.html abgefangen.
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then((windowClients) => {
            console.log('[SW] Sende SW_UPDATED an', windowClients.length, 'Fenster.');
            windowClients.forEach((client) => {
              client.postMessage({ type: 'SW_UPDATED' });
            });
          })
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
