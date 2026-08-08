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
// KEIN skipWaiting() hier – der Client schickt SKIP_WAITING wenn er bereit ist.
// Einzige Ausnahme: Erstinstallation (kein vorheriger Controller) → sofort aktiv.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // App-Shell vorab cachen
      cache.addAll([BASE + '/', BASE + '/index.html']).catch(() => { /* harmlos */ })
    )
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Alte rheinschiffer-* Caches löschen
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith('rheinschiffer-') && n !== CACHE_NAME)
            .map((n) => {
              console.log('[SW] Alter Cache gelöscht:', n);
              return caches.delete(n);
            })
        )
      ),
      // Sofort alle Clients übernehmen
      clients.claim(),
    ])
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
