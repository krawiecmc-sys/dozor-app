# PROTEKTOR (PWA)

Narzędzie terenowe dla dozoru nadzorującego przydzielone urządzenia i instalacje w rejonach wydobywczych, przodkowych i ścianowych: nadzór nad prawidłowością działania, diagnostyka problemów produkcyjno-technologicznych oraz baza wiedzy. Działa w pełni offline po pierwszym uruchomieniu z zasięgiem.

Kontekst decyzji i pełne ustalenia: `Notatki/sesje/2026-08-02.md` i `Zadania/w_trakcie/aplikacja-dozor-baza-wiedzy-pwa.md` w vaultcie `D:\obsidian_1\OBCLATECH`. Ten folder to osobny projekt kodu, celowo poza vaultem Obsidian.

## Trzy główne zakładki

1. **Nadzór rejonu** — dane operacyjne, w pełni edytowalne:
   - *Sprzęt i przegląd bieżący*: Przodek, Kombajn (AM-1..AM-6 + nr fabryczny + lista zabezpieczeń z datą legalizacji), Urządzenia rejonowe (zabezpieczenia jako edytowalna lista), Zabezpieczenia (katalog), Transformatory, Pole rozdzielcze, Chodniki i trasy kablowe (z sublistą wolnych odcinków), Przegląd — Bieżący (log obchodów).
   - *Przegląd OUG/WUG*: drzewiasta checklista dowolnej głębokości (punkty główne + podpunkty), checkbox wykonano/nie, dodawanie/edycja/usuwanie na każdym poziomie.
2. **Diagnostyka** — Baza (opisane, rozwiązane przypadki problemów produkcyjno-technologicznych) i Analiza (bieżący problem w trakcie diagnozy).
3. **Baza wiedzy** — Przepisy prawne, Normy techniczne, Wzory dokumentów, Schematy uniwersalne, Dokumentacja techniczna, Urządzenia. W pełni edytowalna przez UI (nie tylko `seed-data.js`).

## Plan rejonu i import z Excela (03.11.2026)

- **Dashboard → Plan rejonu** — schematyczny plan oddziału (wzór: „plan rejonu dla kombajnu chodnikowego”): chodniki z kierunkami (strzałka przodka), przenośniki z napędami i numerami, rozdzielnie z polami, transformatory, urządzenia, KB, kable zasilające wzdłuż chodników (opis: nr · typ · przekrój · długość). Symbole wg PN-EN 60617 (silnik M, transformator — dwa koła SN/nn, rozdzielnia z szyną zbiorczą, pole z wyłącznikiem ×, aparat z łącznikiem, kombajn), kolor = napięcie: SN (≥ 3 kV) czerwony, 1 kV niebieski, ≤ 0,69 kV morski; kabel rezerwowy przerywany. Napięcie czytane z pól „Napięcie” (np. „6 kV”, „6/1 kV”, „1000 V”). **Układ zasilania (reguły):** pole → transformator albo inne pole (przelot 6 kV, pole `zasilane_z_pola`); transformator → wyłącznik / aparat (nie bezpośrednio silnik); wyłącznik → wyłącznik, odbiornik, KB, napęd przenośnika; odbiornik (`u_rodzaj`, symbol M) nie zasila niczego. Listy źródeł i odpływów pokazują tylko połączenia zgodne z układem i bez pętli; stare niezgodne połączenia trafiają na listę braków. **„+ Dodaj element”** (rozdzielnia, pole, transformator, wyłącznik/aparat, odbiornik, KB, przenośnik): nazwa, napięcie, „zasilony z” i „odpływ do” — zapis wpisuje te same pola „zasilany z” co formularze (od razu na planie, w Grafie i w Mapie rejonu; „odpływ do” zastępuje dotychczasowe źródło odbioru); rozdzielnia zasilona z pola innej rozdzielni dostaje pole zasilające z kablem przelotowym; potem klik na planie ustawia metraż i stronę. **Karta elementu:** Zasilanie… (zmiana źródła i rodzaju urządzenia), + Odpływ stąd, + Pole (rozdzielnia), Przestaw, Usuń (z polami rozdzielni; odbiory zostają bez zasilania). **Warstwy** (zapamiętywane): chodniki, przenośniki, urządzenia, dane urządzeń (napięcie, moc, typ), kable, znaczniki napięcia kabli (6 kV / 1 kV / 0,5 kV), opisy kabli (nr, typ, przekrój, długość), źródło danych. Przesuwanie/przybliżanie (mysz, dwa palce), klik = karta obiektu/kabla, przeciąganie symbolu = poprawka rysunku (`plan_dx/plan_dy`, nie zmienia metrażu), „Postaw na planie” = metraż i strona wpisują się z kliknięcia, druk A3/PDF, zapis SVG, lista braków (bez położenia, połączenia bez opisu kabla, zasilanie spoza bazy).
- **Dane:** nowe tabele `chodniki` i `przenosniki` (baza v10 — migracja tylko dodaje magazyny); przy rozdzielniach/transformatorach/urządzeniach/KB pola położenia (`lok_*`) i kabla (`kabel_*`). Kto kogo zasila — nadal tylko w polach „zasilany z” (jedno źródło prawdy dla Grafu i Planu).
- **Synchronizacja → Import transformatorów z Excela** (SheetJS 0.20.3 w `js/vendor/`, offline): zwykła tabela z dopasowaniem kolumn (zapamiętywane) albo wykaz „Zabezpieczenia trafo” (grupa → transformator → wiersz z dwoma zabezpieczeniami). Dopasowanie po numerze transformatora — ponowny import aktualizuje, nie dubluje; puste komórki nie kasują danych z appki.
- **Testy:** `testy-plan.html` (dane zmyślone; otwórz przez lokalny serwer) — migracja 9→10, rysunek, import tabeli i wykazu, brak duplikatów.

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
