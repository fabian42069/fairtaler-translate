// Service worker: keeps the big offline files (translation models and voices)
// on this device after they are used once, so Fairtaler keeps working offline.
//
// The Android app ships without these files to stay small. When one is needed,
// it is downloaded once from the web version of Fairtaler, stored here, and
// served to the app as if it were part of it. Only files are downloaded;
// nothing you type is ever sent.
const REMOTE = 'https://fabian42069.codeberg.page/fairtaler-translate/';
const HEAVY = /^(bergamot\/models|kokoro|piper|kuromoji\/dict)\//; // keep in sync with scripts/slim-android.mjs
const CACHE = 'fairtaler-files-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('fairtaler-files-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const rel = decodeURIComponent(url.pathname.slice(scope.pathname.length));
  if (!HEAVY.test(rel)) return;
  e.respondWith(serve(rel));
});

async function serve(rel) {
  const key = new URL(rel, self.registration.scope).href;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key);
  if (hit) return hit;
  // First from this site (the web version has all files), then from the web version (the app).
  let res = await fetch(key).catch(() => null);
  if (!res || !res.ok) res = await fetch(REMOTE + encodeURI(rel), { mode: 'cors', credentials: 'omit' });
  if (!res.ok) return res;
  // A fresh response, so the browser treats the file as part of this site
  // (scripts then load their own helpers from here, through this worker too).
  const copy = new Response(await res.blob(), {
    status: 200,
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream' },
  });
  await cache.put(key, copy.clone()).catch(() => {});
  return copy;
}
