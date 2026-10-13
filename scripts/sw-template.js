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
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  // Build checks must reach the current host even while an older page is open.
  if (new URL(event.request.url).pathname === '/version.json') return;
  // Precache requests and crossorigin module requests have different Origin
  // headers. The assets here are immutable and restricted to this origin.
  event.respondWith(caches.match(event.request, {ignoreVary: true}).then(cached => {
    if (cached) return cached;
    return fetch(event.request).catch(() => {
      if (event.request.mode === 'navigate') return caches.match('/index.html');
      return Response.error();
    });
  }));
});
