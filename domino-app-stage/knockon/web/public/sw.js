// DOMINO offline cache.
// App files: network first (always fresh when online), cached copy when offline.
// Map tiles: cache first, so areas you have viewed keep working without internet.
const APP = 'domino-app-v2';
const TILES = 'domino-tiles-v2';
const MAX_TILES = 1500;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keep = new Set([APP, TILES]);
  await Promise.all((await caches.keys()).filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

// The page sends the files it already loaded before this worker took over, so the very first
// visit is enough for the app to work offline afterwards.
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'cache-urls') return;
  e.waitUntil(caches.open(APP).then((c) => Promise.all(e.data.urls.map((u) => c.add(u).catch(() => {})))));
});

async function trimTiles(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_TILES)).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('arcgisonline.com')) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { c.put(req, res.clone()).then(() => trimTiles(c)).catch(() => {}); }
      return res;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(APP).then((c) => c.put(req, copy)); }
    return res;
  }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' && await caches.match('./')) || Response.error()));
});
