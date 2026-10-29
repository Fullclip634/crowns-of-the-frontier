const CACHE = __CACHE__;
const FILES = __FILES__;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(FILES))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(key => key.startsWith('frontier-') && key !== CACHE)
      .map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Build checks must reach the current host even while an older page is open.
  if (url.pathname === '/version.json') return;
  // Precache requests and crossorigin module requests have different Origin
  // headers. The assets here are immutable and restricted to this origin.
  event.respondWith(caches.match(event.request, {ignoreVary: true}).then(cached => {
    if (cached) return cached;
    return fetch(event.request).then(response => {
      // Optional quality assets are cached after their first real use instead
      // of enlarging every player's install package.
      if (response.status === 200 && !event.request.headers.has('range') && url.pathname.startsWith('/assets/')) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {}));
      }
      return response;
    }).catch(() => {
      if (event.request.mode === 'navigate') return caches.match('/index.html');
      return Response.error();
    });
  }));
});
