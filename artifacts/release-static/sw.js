const CACHE = "frontier-1107710893";
const FILES = ["/","/index.html","/manifest.webmanifest","/icon.svg","/assets/basis_transcoder-o4Hde_L7.js","/assets/basis_transcoder-VXdx5NbI.wasm","/assets/brown_mud_arm-Da0V4fPO.ktx2","/assets/brown_mud_arm-Z8kNFMTF.jpg","/assets/brown_mud_color-BbWfHDjQ.jpg","/assets/brown_mud_color-DhcELWfo.ktx2","/assets/brown_mud_normal-C3h-u0Ls.jpg","/assets/frontier-balanced-qgbRyTT9.glb","/assets/frontier-low-B4IaE_rp.glb","/assets/frontier-near-HAGP_OsN.glb","/assets/index-8Psj6RnN.js","/assets/index-CbNU5cf0.css","/assets/leafy_grass_arm-CDt3Zw7v.jpg","/assets/leafy_grass_arm-hiw9LmU4.ktx2","/assets/leafy_grass_color-CbcxmF7W.ktx2","/assets/leafy_grass_color-vig3bC4b.jpg","/assets/leafy_grass_normal-Cp8RKkAj.jpg","/assets/medieval_blocks_05_arm-BU44WXcj.jpg","/assets/medieval_blocks_05_arm-U2vcLL50.ktx2","/assets/medieval_blocks_05_color-CUaDZYtZ.jpg","/assets/medieval_blocks_05_color-D1rHvEUX.ktx2","/assets/medieval_blocks_05_normal-MXY7VBwo.jpg","/assets/old_wood_floor_arm-C6SZRpOX.ktx2","/assets/old_wood_floor_arm-SQU0J2mh.jpg","/assets/old_wood_floor_color-Cda7KFIT.jpg","/assets/old_wood_floor_color-x5ODPASc.ktx2","/assets/old_wood_floor_normal-3sFZj2Ca.jpg","/assets/painted_plaster_wall_arm-CwLmScXZ.ktx2","/assets/painted_plaster_wall_arm-i5moMyFO.jpg","/assets/painted_plaster_wall_color-Cd9DjhAQ.jpg","/assets/painted_plaster_wall_color-cFYpKm_m.ktx2","/assets/painted_plaster_wall_normal-48uy-TVR.jpg","/assets/rocky_terrain_02_arm-D6y2iIr1.ktx2","/assets/rocky_terrain_02_arm-dgF_mb8C.jpg","/assets/rocky_terrain_02_color-BozAruS8.ktx2","/assets/rocky_terrain_02_color-CemMALHM.jpg","/assets/rocky_terrain_02_normal-DX7AM3nD.jpg","/assets/rock_01_arm-fXUUj8_O.jpg","/assets/rock_01_arm-UD4ri-3Q.ktx2","/assets/rock_01_color-CZTjHcC4.jpg","/assets/rock_01_color-rAELnqqa.ktx2","/assets/rock_01_normal-Z4CE2v_p.jpg","/assets/three-BR_hnhrd.js","/fonts/cormorant-garamond-italic-400.woff2","/fonts/cormorant-garamond-normal-400.woff2","/fonts/Cormorant-Garamond-OFL.txt","/fonts/dm-sans-normal-400.woff2","/fonts/DM-Sans-OFL.txt","/fonts/SOURCES.json"];
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
