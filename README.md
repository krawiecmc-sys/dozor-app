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
- Mechanizmu pobierania pakietu aktualizacji **z zewnętrznego serwera** (Faza 2 — dystrybucja do kolegów z dozoru). Na razie aktualizacja treści działa lokalnie: zmiana `seed-data.js` + nowy commit + push wystarczą, appka sama się odświeży przy najbliższym uruchomieniu z zasięgiem (patrz niżej).

Zawiera pierwsze 4 realne, zweryfikowane rekordy (jeden na kategorię) — źródła w `Zasoby/Przepisy-elektroenergetyka.md` i `Biznes/protokoly/_szablon-protokol-pomiaru-okresowego.md` w vaultcie Obsidian.

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

## Dodawanie/edycja treści (na razie ręcznie w kodzie)

1. Edytuj `data/seed-data.js` — dodaj/zmień obiekty w tablicy `seedData`, zgodnie z modelem rekordu wyżej.
2. **Podbij `SEED_VERSION`** na górze tego samego pliku (np. `'2026-08-02-01'` → `'2026-08-02-02'`) — to jedyny sygnał, po którym appka pozna, że dane się zmieniły, i sama nadpisze lokalną bazę na telefonie (`reseedIfNeeded()` w `js/db.js`). Bez tego appka zignoruje zmiany, nawet jeśli plik na serwerze jest inny.
3. Przy zmianie plików appki (nie tylko `seed-data.js`) podbij też `CACHE_NAME` w `service-worker.js` (np. `dozor-app-v2` → `dozor-app-v3`) — inaczej Service Worker będzie dalej serwował starą wersję z cache.
4. `git add`, commit, `git push` — GitHub Pages przebuduje się automatycznie w ciągu 1-2 minut.
5. Na telefonie appka podejmie aktualizację automatycznie przy najbliższym uruchomieniu z zasięgiem (Service Worker sam sprawdza sieć w tle po starcie). Jeśli chcesz wymusić to natychmiast: zamknij appkę całkowicie (usuń z ostatnich aplikacji) i otwórz ponownie z zasięgiem.

**Pamiętaj o granicy treści:** tylko warstwa ogólna/uniwersalna (przepisy, normy, wzory, schematy niezakładowe). Żadnych materiałów KWK Piast (schematy 6kV, DTR-y, nastawy zabezpieczeń) — patrz uzasadnienie w `Zadania/w_trakcie/aplikacja-dozor-baza-wiedzy-pwa.md`.
