const CACHE = 'suijin-map-v2';

const APP_SHELL = [
  './suijin_map.html',
  './main.js',
  './style.css',
  './manifest.json',
  './maplibre-gl.js',
  './maplibre-gl.css',
  './togeojson.min.js',
  './arakawa_suijin_marker.kml',
  './トイレmap 荒川CR0508.kml',
  './d_west.gpx',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // タイル・スタイル・フォント・スプライトをネットワーク優先でキャッシュ
  if (url.hostname === 'tile.openstreetmap.jp') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // アプリシェルはキャッシュ優先
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
