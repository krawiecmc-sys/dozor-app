# PROTEKTOR (PWA)

Narzędzie terenowe dla dozoru nadzorującego przydzielone urządzenia i instalacje w rejonach wydobywczych, przodkowych i ścianowych: nadzór nad prawidłowością działania, diagnostyka problemów produkcyjno-technologicznych oraz baza wiedzy. Działa w pełni offline po pierwszym uruchomieniu z zasięgiem.

Kontekst decyzji i pełne ustalenia: `Notatki/sesje/2026-08-02.md` i `Zadania/w_trakcie/aplikacja-dozor-baza-wiedzy-pwa.md` w vaultcie `D:\obsidian_1\OBCLATECH`. Ten folder to osobny projekt kodu, celowo poza vaultem Obsidian.

## Trzy główne zakładki

1. **Nadzór rejonu** — dane operacyjne, w pełni edytowalne:
   - *Sprzęt i przegląd bieżący*: Przodek, Kombajn (AM-1..AM-6 + nr fabryczny + lista zabezpieczeń z datą legalizacji), Urządzenia rejonowe (zabezpieczenia jako edytowalna lista), Zabezpieczenia (katalog), Transformatory, Pole rozdzielcze, Chodniki i trasy kablowe (z sublistą wolnych odcinków), Przegląd — Bieżący (log obchodów).
   - *Przegląd OUG/WUG*: drzewiasta checklista dowolnej głębokości (punkty główne + podpunkty), checkbox wykonano/nie, dodawanie/edycja/usuwanie na każdym poziomie.
2. **Diagnostyka** — Baza (opisane, rozwiązane przypadki problemów produkcyjno-technologicznych) i Analiza (bieżący problem w trakcie diagnozy).
3. **Baza wiedzy** — Przepisy prawne, Normy techniczne, Wzory dokumentów, Schematy uniwersalne, Dokumentacja techniczna, Urządzenia. W pełni edytowalna przez UI (nie tylko `seed-data.js`).

## Zabezpieczenia w danych — ważna zasada

Dane operacyjne (Nadzór rejonu) i tak jest to warstwa zakładowa co do zasady, ale appka **zawiera wyłącznie treści przykładowe/fikcyjne** (oznaczone `PRZYKŁAD`) — żadnych realnych numerów, nastaw, identyfikatorów z KWK Piast, dopóki nie zostanie potwierdzona zgodność z polityką bezpieczeństwa/IT pracodawcy. Patrz uzasadnienie w `Zadania/w_trakcie/aplikacja-dozor-baza-wiedzy-pwa.md`.

## Kod dostępu (TOTP)

Appka jest zablokowana ekranem z kodem dostępu, który **zmienia się raz na dobę** (algorytm TOTP, liczony lokalnie, offline — RFC 6238, HMAC-SHA1, okres 1 doba zamiast typowych 30s). Kod generowany jest z sekretu w `js/totp-secret.js`. Właściciel appki (Piotr) ma dodatkowo stały **klucz nadrzędny** (`granat-dozor-7828-wentyl`), który zawsze działa, niezależnie od dnia — zapisany w kodzie tylko jako hash SHA-256, nie wprost.

**Ważne zastrzeżenie, nie do pominięcia:** appka jest hostowana jako statyczny kod na GitHub Pages — publicznie pobieralny przez każdego, kto zna URL. Ta bramka **nie jest ochroną danych poufnych** (i tak żadnych tu nie ma — patrz wyżej), tylko filtrem przed przypadkowym dostępem osób, które natrafiły na link bez wiedzy właściciela. Osoba technicznie zdeterminowana może odczytać sekret z kodu źródłowego appki i policzyć kody samodzielnie.

Odblokowanie zapisuje się per urządzenie (localStorage) — dzienny kod odblokowuje tylko do końca danego dnia (UTC), klucz nadrzędny odblokowuje appkę trwale na tym urządzeniu.

## Struktura

```
dozor-app/
├── index.html                 # app shell + ekran bramki dostępu
├── manifest.json               # metadane PWA
├── service-worker.js           # cache-first, obsługa offline
├── icons/icon.svg               # ikona appki (placeholder)
├── css/style.css                # style (wspólne dla wszystkich modułów)
├── js/
│   ├── gate.js                  # ekran bramki dostępu (TOTP), ładuje app.js po odblokowaniu
│   ├── totp.js                  # algorytm TOTP + weryfikacja kodu/klucza nadrzędnego
│   ├── totp-secret.js           # sekret TOTP + hash klucza nadrzędnego
│   ├── app.js                   # główna logika: przełącznik sekcji, Baza wiedzy (CRUD)
│   ├── db.js                    # warstwa IndexedDB (generyczne CRUD + bezpieczny reseed)
│   ├── crud-module.js           # generyczny moduł list+formularz (w tym pola 'sublist')
│   ├── nadzor-entities.js       # definicje encji Nadzoru rejonu
│   ├── nadzor.js                # instancja crud-module dla Nadzoru rejonu
│   ├── oug-wug.js                # drzewiasta checklista OUG/WUG
│   ├── diagnostyka-entities.js  # definicje encji Diagnostyki
│   └── diagnostyka.js            # instancja crud-module dla Diagnostyki
└── data/
    └── seed-data.js              # startowe rekordy Bazy wiedzy (z SEED_VERSION)
```

## Jak uruchomić lokalnie (na komputerze)

Service Worker wymaga serwera HTTP (nie działa z otwarcia pliku `index.html` przez `file://`):

```
"C:\Python314\python.exe" -m http.server 8000
```

(uruchom z tego folderu), potem otwórz `http://localhost:8000` w Chrome. Na `localhost` Service Worker działa w pełni — to jedyny wyjątek od wymogu HTTPS.

## Jak przetestować na prawdziwym telefonie

Chrome na Androidzie wymaga HTTPS do rejestracji Service Workera (poza `localhost`). Adres IP komputera w tej samej sieci Wi-Fi pokaże UI, ale bez offline/instalacji. **Pełny test:** GitHub Pages (`https://krawiecmc-sys.github.io/dozor-app/`) — darmowy, automatyczny HTTPS, prawdziwa instalacja i offline.

## Aktualizacja treści/kodu

1. Zmień pliki (kod appki i/lub `data/seed-data.js`).
2. Jeśli zmieniasz `seed-data.js` — podbij `SEED_VERSION` na górze pliku. Reseed jest **bezpieczny**: nadpisuje tylko rekordy, których user nigdy nie edytował w appce (`_userEdited: false`); rekordy edytowane ręcznie przez usera zostają nietknięte.
3. Jeśli zmieniasz jakikolwiek plik appki (JS/CSS/HTML) — podbij `CACHE_NAME` w `service-worker.js`, inaczej Service Worker będzie serwował starą wersję z cache.
4. `git add`, commit, `git push` — GitHub Pages przebuduje się automatycznie (1-2 min).
5. Na telefonie: zamknij appkę całkowicie (usuń z ostatnich aplikacji) i otwórz ponownie z zasięgiem, żeby wymusić natychmiastową aktualizację.

## Świadomie odłożone na później

- Prawdziwy mechanizm pobierania pakietu aktualizacji z zewnętrznego serwera (Faza 2 — dystrybucja do kolegów z dozoru; na razie aktualizacja to git push + odświeżenie appki).
- Scalanie danych wielu userów w jeden zbiorczy zestaw (możliwe przez eksport/import JSON, niezbudowane).
- Prosty dashboard z mapą/grafem drzewiastym urządzeń.
