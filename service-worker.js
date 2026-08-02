// Cache-first: appka ma działać offline bez opóźnień (dozór pod ziemią,
// zero zasięgu) — NIE network-first, bo próba połączenia i czekanie na
// timeout dawałoby zauważalne opóźnienia przy każdym starcie.

const CACHE_NAME = 'dozor-app-v18';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/gate.js',
  './js/totp.js',
  './js/totp-secret.js',
  './js/app.js',
  './js/db.js',
  './js/crud-module.js',
  './js/nadzor.js',
  './js/nadzor-entities.js',
  './js/oug-wug.js',
  './js/diagnostyka.js',
  './js/diagnostyka-entities.js',
  './js/sync.js',
  './js/dashboard.js',
  './js/chain-builder.js',
  './data/seed-data.js',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Cache Storage obsługuje tylko http(s) — żądania rozszerzeń przeglądarki
  // (chrome-extension://) i podobne trzeba pominąć, inaczej cache.put()
  // rzuca błędem (widoczny w konsoli, niegroźny dla appki, ale hałasuje).
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
