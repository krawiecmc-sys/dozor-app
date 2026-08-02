# Baza wiedzy dozoru (PWA) — szkielet

Terenowa baza wiedzy dla dozoru: przepisy prawne, normy techniczne, wzory dokumentów, schematy uniwersalne. Działa w pełni offline po pierwszym uruchomieniu z zasięgiem.

Kontekst decyzji i pełne ustalenia: `Notatki/sesje/2026-08-02.md` i `Zadania/w_trakcie/aplikacja-dozor-baza-wiedzy-pwa.md` w vaultcie `D:\obsidian_1\OBCLATECH`. Ten folder to osobny projekt kodu, celowo poza vaultem Obsidian.

## Status: szkielet (MVP w budowie)

Co działa:
- Przeglądanie i wyszukiwanie rekordów (tytuł, treść, tagi) w 4 kategoriach.
- Lokalna baza danych w przeglądarce (IndexedDB) — działa offline.
- Instalacja jako appka na Androidzie ("Dodaj do ekranu głównego").
- Service Worker z cache-first — appka i dane dostępne bez zasięgu.

Czego jeszcze nie ma (świadomie, kolejne kroki):
- Formularza do dodawania/edycji treści przez UI (na razie dane wpisuje się ręcznie w `data/seed-data.js`).
- Mechanizmu pobierania pakietu aktualizacji online (Faza 2 — dystrybucja do kolegów z dozoru).
- Realnej, zweryfikowanej treści — `data/seed-data.js` zawiera wyłącznie rekordy przykładowe oznaczone `[PRZYKŁAD]`, nie prawdziwe przepisy/normy.

## Struktura

```
dozor-app/
├── index.html          # szkielet appki (app shell)
├── manifest.json        # metadane PWA (nazwa, ikona, kolor)
├── service-worker.js    # cache-first, obsługa offline
├── icons/icon.svg        # ikona appki (placeholder, do zamiany)
├── css/style.css         # style
├── js/
│   ├── app.js            # logika UI: lista, filtr, szczegóły, wyszukiwarka
│   └── db.js              # warstwa IndexedDB (odczyt/zapis rekordów)
└── data/
    └── seed-data.js       # przykładowe rekordy startowe
```

### Model rekordu

```js
{
  id: 'kategoria-unikalny-id',
  category: 'przepisy' | 'normy' | 'wzory' | 'schematy',
  title: 'Tytuł',
  tags: ['tag1', 'tag2'],
  source: 'Podstawa prawna / źródło',
  body: 'Treść rekordu (tekst).',
  attachment: null,       // później: ścieżka do PDF/obrazu
  updatedAt: '2026-08-02',
}
```

## Jak uruchomić lokalnie (na komputerze)

Service Worker wymaga serwera HTTP (nie działa z otwarcia pliku `index.html` bezpośrednio przez `file://`). Najprościej przez wbudowany serwer Pythona:

```
"C:\Python314\python.exe" -m http.server 8000
```

(uruchom z tego folderu), potem otwórz `http://localhost:8000` w Chrome na komputerze. Na `localhost` Service Worker działa w pełni — to jedyny wyjątek od wymogu HTTPS.

## Jak przetestować na prawdziwym telefonie

**Ważne:** Chrome na Androidzie wymaga HTTPS do rejestracji Service Workera (poza `localhost`). Otwarcie appki przez adres IP komputera w tej samej sieci Wi-Fi (`http://192.168.x.x:8000`) **nie zarejestruje Service Workera** — appka odpali się, ale bez trybu offline i bez możliwości instalacji.

Dwie opcje:
1. **Szybki test bez offline** — otwórz adres IP na telefonie, zobaczysz UI i dane, ale bez instalacji/offline. Dobre do sprawdzenia wyglądu.
2. **Pełny test (rekomendowane)** — wrzuć folder na GitHub Pages (darmowy hosting statyczny z automatycznym HTTPS, ten sam mechanizm co już używane repo `backup-asystent-ai`). Wtedy masz prawdziwy adres `https://...github.io/...`, który otwierasz na telefonie — pełna instalacja, offline, wszystko działa tak jak będzie działać docelowo. To też ścieżka do realnej dystrybucji w Fazie 2 (jeden link do wysłania kolegom z dozoru).

## Dodawanie/edycja treści (na razie ręcznie)

Edytuj `data/seed-data.js` — dodaj kolejne obiekty do tablicy `seedData`, zgodnie z modelem rekordu wyżej. Po zmianie treści w tym pliku wyczyść dane appki w przeglądarce (DevTools → Application → IndexedDB → usuń bazę `dozor-baza-wiedzy`), żeby nowy seed się wczytał — `seedIfEmpty()` nie nadpisuje istniejących danych.

**Pamiętaj o granicy treści:** tylko warstwa ogólna/uniwersalna (przepisy, normy, wzory, schematy niezakładowe). Żadnych materiałów KWK Piast (schematy 6kV, DTR-y, nastawy zabezpieczeń) — patrz uzasadnienie w `Zadania/w_trakcie/aplikacja-dozor-baza-wiedzy-pwa.md`.
