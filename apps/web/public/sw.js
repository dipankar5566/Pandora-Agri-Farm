/* Minimal hand-rolled service worker — no Workbox dependency (lean rule).
 *
 * Scope, deliberately narrow (see docs/Phase-8-Documentation.md §3):
 *  - Caches the app shell so the UI still opens with no signal.
 *  - NEVER caches /api/ responses — herd/health/stock data must always be
 *    live-or-fail, never silently stale, on a system that doses medicine.
 *  - Does NOT queue or replay failed writes. A save made offline still
 *    fails with a clear error; true write-queuing is a separate, larger
 *    feature (see the gap list) because several flows navigate using a
 *    server-generated id the moment a create succeeds.
 */
const CACHE = 'pandora-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['/', '/manifest.webmanifest'])),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never intercept mutations
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return; // dynamic data: network only, always

  if (request.mode === 'navigate') {
    // App shell: network first (fresh build), cache fallback (offline open).
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/', { ignoreSearch: true })),
    );
    return;
  }

  // Static assets: cache-first, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached ?? fetchPromise;
    }),
  );
});
