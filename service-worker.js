// Cache-first: appka ma działać offline bez opóźnień (dozór pod ziemią,
// zero zasięgu) — NIE network-first, bo próba połączenia i czekanie na
// timeout dawałoby zauważalne opóźnienia przy każdym starcie.

const CACHE_NAME = 'dozor-app-v57';

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
  './js/plan-view.js',
  './js/symbole.js',
  './js/katalog-aparatow.js',
  './js/siec-zasilania.js',
  './js/import-excel.js',
  './js/import-schemat.js',
  './js/export-reminder.js',
  './js/vendor/xlsx.full.min.js',
  './data/seed-data.js',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // 06.11.2026: cache: 'reload' — pliki prosto z serwera, z pominięciem pamięci HTTP przeglądarki (GitHub Pages trzyma
    // pliki do 10 min); bez tego nowa wersja mogła dostać część starych plików (Piotr: „mieszają się wersje”)
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
  );
  // 06.11.2026: bez samoczynnego skipWaiting — nowa wersja czeka, aż użytkownik kliknie „Odśwież” na pasku
  // (wcześniej strona przeładowywała się sama w trakcie pracy, np. przy klikaniu po zakładkach)
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
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
