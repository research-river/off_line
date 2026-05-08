const CACHE = 'suijin-map-v3';

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

const OFFLINE_PAGE = './suijin_map.html';

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

  // ホーム画面アイコンからの起動時は、オフラインでも地図ページを返す
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(OFFLINE_PAGE, clone));
          return response;
        })
        .catch(() => caches.match(OFFLINE_PAGE))
    );
    return;
  }

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

  // アプリシェルはキャッシュ優先、未保存なら取得して保存
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
