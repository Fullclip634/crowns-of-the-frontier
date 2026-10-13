const CACHE = "frontier-2290327925";
const FILES = ["/","/index.html","/manifest.webmanifest","/icon.svg","/assets/frontier-low-q9Ou8A3S.glb","/assets/frontier-near-BPXe79on.glb","/assets/index-CUbWpTvl.css","/assets/index-CUT1Uvkl.js","/assets/leafy_grass_arm-CDt3Zw7v.jpg","/assets/leafy_grass_color-vig3bC4b.jpg","/assets/leafy_grass_normal-Cp8RKkAj.jpg","/assets/medieval_blocks_05_arm-BU44WXcj.jpg","/assets/medieval_blocks_05_color-CUaDZYtZ.jpg","/assets/medieval_blocks_05_normal-MXY7VBwo.jpg","/assets/old_wood_floor_arm-SQU0J2mh.jpg","/assets/old_wood_floor_color-Cda7KFIT.jpg","/assets/old_wood_floor_normal-3sFZj2Ca.jpg","/assets/three-BLmnMIeT.js","/fonts/cormorant-garamond-italic-400.woff2","/fonts/cormorant-garamond-normal-400.woff2","/fonts/Cormorant-Garamond-OFL.txt","/fonts/dm-sans-normal-400.woff2","/fonts/DM-Sans-OFL.txt","/fonts/SOURCES.json"];
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
