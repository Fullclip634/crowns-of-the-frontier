const CACHE = "frontier-2889462865";
const FILES = ["/","/index.html","/manifest.webmanifest","/icon.svg","/assets/brown_mud_arm-Z8kNFMTF.jpg","/assets/brown_mud_color-BbWfHDjQ.jpg","/assets/brown_mud_normal-C3h-u0Ls.jpg","/assets/frontier-balanced-wiELWQoY.glb","/assets/frontier-low-BhmiUIby.glb","/assets/frontier-near-nMUDgySh.glb","/assets/index-Bc7aiV5i.js","/assets/index-Dgv43S_z.css","/assets/leafy_grass_arm-CDt3Zw7v.jpg","/assets/leafy_grass_color-vig3bC4b.jpg","/assets/leafy_grass_normal-Cp8RKkAj.jpg","/assets/medieval_blocks_05_arm-BU44WXcj.jpg","/assets/medieval_blocks_05_color-CUaDZYtZ.jpg","/assets/medieval_blocks_05_normal-MXY7VBwo.jpg","/assets/old_wood_floor_arm-SQU0J2mh.jpg","/assets/old_wood_floor_color-Cda7KFIT.jpg","/assets/old_wood_floor_normal-3sFZj2Ca.jpg","/assets/painted_plaster_wall_arm-i5moMyFO.jpg","/assets/painted_plaster_wall_color-Cd9DjhAQ.jpg","/assets/painted_plaster_wall_normal-48uy-TVR.jpg","/assets/rocky_terrain_02_arm-dgF_mb8C.jpg","/assets/rocky_terrain_02_color-CemMALHM.jpg","/assets/rocky_terrain_02_normal-DX7AM3nD.jpg","/assets/rock_01_arm-fXUUj8_O.jpg","/assets/rock_01_color-CZTjHcC4.jpg","/assets/rock_01_normal-Z4CE2v_p.jpg","/assets/three-BZTCyBBM.js","/fonts/cormorant-garamond-italic-400.woff2","/fonts/cormorant-garamond-normal-400.woff2","/fonts/Cormorant-Garamond-OFL.txt","/fonts/dm-sans-normal-400.woff2","/fonts/DM-Sans-OFL.txt","/fonts/SOURCES.json"];
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
