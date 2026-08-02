// Rekordy startowe — zweryfikowane 2026-08-02 (wyszukiwanie + skille
// /przepisy-elektroenergetyka i /szablon-protokolu-pomiaru w vaultcie Obsidian).
// Pełne źródła i historia weryfikacji: Zasoby/Przepisy-elektroenergetyka.md
// oraz Biznes/protokoly/_szablon-protokol-pomiaru-okresowego.md.
//
// Zasada: tylko warstwa ogólna/uniwersalna. Zero materiałów zakładowych KWK.

// Podbij przy każdej zmianie treści poniżej — to wymusza odświeżenie
// lokalnej bazy na telefonie (patrz reseedIfNeeded w js/db.js).
export const SEED_VERSION = '2026-08-02-04';

// Rekordy kategorii "Przepisy prawne" (górnictwo) oparte na kuratorowanym
// wyciągu z D:\obsidian_1\gornictwo_przepisy_normy.md (stan prawny
// 2026-08-02, źródła: ISAP/Dziennik Ustaw/WUG) — dobrane pod kątem realnej
// pracy dozoru energo-mechanicznego, nie pełna lista 54 aktów z dokumentu.

export const seedData = [
  {
    id: 'przepisy-ustawa-funkcjonowanie-gornictwa',
    category: 'przepisy',
    title: 'Ustawa o funkcjonowaniu górnictwa węgla kamiennego',
    tags: ['górnictwo węgla kamiennego', 'ustawa', 'funkcjonowanie górnictwa'],
    source: 'Ustawa o funkcjonowaniu górnictwa węgla kamiennego (tekst jednolity: Dz.U. 2026 poz. 520)',
    body:
      'Ustawa sektorowa regulująca funkcjonowanie górnictwa węgla kamiennego w Polsce — obok Prawa geologicznego i górniczego to drugi kluczowy akt dla sektora węglowego. Reguluje m.in. zasady finansowania likwidacji kopalń, restrukturyzacji i funkcjonowania przedsiębiorstw górniczych węgla kamiennego. Istotna jako kontekst systemowy dla każdego, kto pracuje w kopalni węgla kamiennego, niezależnie od stanowiska.',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'przepisy-zagrozenia-naturalne',
    category: 'przepisy',
    title: 'Zagrożenia naturalne w zakładach górniczych — rozporządzenie',
    tags: ['zagrożenia naturalne', 'metan', 'tąpania', 'pył węglowy', 'wentylacja'],
    source: 'Rozporządzenie Ministra Środowiska z dnia 29 stycznia 2013 r. w sprawie zagrożeń naturalnych w zakładach górniczych (Dz.U. 2013 poz. 230, tekst jednolity)',
    body:
      'Kluczowe rozporządzenie dla bezpieczeństwa w kopalni podziemnej — reguluje zasady rozpoznawania, oceny i zwalczania zagrożeń naturalnych: tąpań, metanowego, pożarowego, wyrzutów gazów i skał, pyłu węglowego, wodnego, osuwiskowego, erupcyjnego, siarkowodorowego oraz promieniowania jonizującego. Powiązane bezpośrednio z rozporządzeniem ws. ruchu podziemnych zakładów górniczych i z wentylacją kopalni — bezpośrednio dotyczy codziennej pracy dozoru energo-mechanicznego (ciągłość zasilania i zabezpieczeń w warunkach zagrożenia metanowego/pyłowego).',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'przepisy-plany-ruchu-zakladow-gorniczych',
    category: 'przepisy',
    title: 'Plany ruchu zakładów górniczych — rozporządzenie',
    tags: ['plan ruchu', 'zakład górniczy', 'dokumentacja'],
    source: 'Rozporządzenie Ministra Środowiska z dnia 8 grudnia 2017 r. w sprawie planów ruchu zakładów górniczych (Dz.U. 2017 poz. 2293)',
    body:
      'Określa zasady sporządzania, zatwierdzania i aktualizacji planu ruchu zakładu górniczego — podstawowego dokumentu, na podstawie którego prowadzony jest ruch kopalni (w tym zmiany technologiczne, nowe rejony wydobywcze, instalacje). Każda istotna zmiana w rejonie wydobywczym (np. nowy przodek, zmiana zasilania) powinna mieć odzwierciedlenie w planie ruchu lub jego dodatku.',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'przepisy-kwalifikacje-gornictwo-ratownictwo',
    category: 'przepisy',
    title: 'Kwalifikacje w zakresie górnictwa i ratownictwa górniczego — rozporządzenie',
    tags: ['kwalifikacje', 'dozór górniczy', 'ratownictwo górnicze', 'uprawnienia'],
    source: 'Rozporządzenie Ministra Przemysłu z dnia 25 czerwca 2024 r. w sprawie kwalifikacji w zakresie górnictwa i ratownictwa górniczego (Dz.U. 2024 poz. 992)',
    body:
      'Określa wymagania kwalifikacyjne dla osób kierownictwa i dozoru ruchu zakładu górniczego (w tym stanowisk energo-mechanicznych) oraz dla ratownictwa górniczego — czyli formalną podstawę tego, jakie uprawnienia/świadectwa są wymagane na poszczególnych stanowiskach dozoru w kopalni. Bezpośrednio istotne przy awansach, zmianie stanowiska lub weryfikacji własnych kwalifikacji.',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'przepisy-ratownictwo-gornicze',
    category: 'przepisy',
    title: 'Ratownictwo górnicze — rozporządzenie',
    tags: ['ratownictwo górnicze', 'bhp górnictwo'],
    source: 'Rozporządzenie Ministra Energii z dnia 16 marca 2017 r. w sprawie ratownictwa górniczego (tekst jednolity: Dz.U. 2022 poz. 1418), zmienione rozporządzeniem z 19.09.2025 r. (Dz.U. 2025 poz. 1343, obowiązuje od 21.10.2025)',
    body:
      'Reguluje organizację i zasady działania ratownictwa górniczego w zakładach górniczych — struktury ratownicze, obowiązki przedsiębiorcy górniczego w zakresie gotowości ratowniczej, zasady akcji ratowniczych. Kontekst bezpośrednio powiązany z zagrożeniami naturalnymi (metan, pożar, tąpania) i z pracą w rejonach wydobywczych/przodkowych.',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'przepisy-bhp-urzadzenia-energetyczne',
    category: 'przepisy',
    title: 'BHP przy urządzeniach energetycznych — rozporządzenie',
    tags: ['bhp', 'urządzenia energetyczne', 'elektroenergetyka'],
    source: 'Rozporządzenie Ministra Energii z dnia 28 sierpnia 2019 r. w sprawie bezpieczeństwa i higieny pracy przy urządzeniach energetycznych',
    body:
      'Rozporządzenie bezpośrednio dotyczące pracy z urządzeniami energetycznymi (elektroenergetycznymi i cieplnymi) — obowiązki w zakresie eksploatacji, dozoru, prac przy urządzeniach pod napięciem i w ich pobliżu, kwalifikacje osób wykonujących te prace. Rdzeń przepisowy dla stanowiska dozoru w pionie energo-mechanicznym kopalni — dotyczy zarówno pracy na etacie, jak i przyszłej działalności elektro-BHP.',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'przepisy-atex-urzadzenia-w-atmosferze-wybuchowej',
    category: 'przepisy',
    title: 'Wymagania dla urządzeń w atmosferze wybuchowej (ATEX) — rozporządzenie',
    tags: ['ATEX', 'atmosfera wybuchowa', 'iskrobezpieczność', 'zagrożenie metanowe'],
    source: 'Rozporządzenie Ministra Rozwoju z dnia 6 czerwca 2016 r. w sprawie wymagań dla urządzeń i systemów ochronnych przeznaczonych do użytku w atmosferze potencjalnie wybuchowej (wdrożenie dyrektywy ATEX 2014/34/UE)',
    body:
      'Określa wymagania techniczne dla urządzeń (w tym elektrycznych) przeznaczonych do pracy w strefach zagrożenia wybuchem — czyli dokładnie tych warunków, w jakich pracuje dozór w podziemnych wyrobiskach zagrożonych metanem/pyłem węglowym. To podstawa prawna dla wymogu budowy przeciwwybuchowej/iskrobezpiecznej sprzętu (w tym telefonu dopuszczonego przez KRZG do pracy w przodku). Powiązane normy techniczne: PN-EN 60079 (seria), PN-EN 1127, PN-EN 13463.',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'przepisy-ogolne-przepisy-bhp',
    category: 'przepisy',
    title: 'Ogólne przepisy BHP — rozporządzenie',
    tags: ['bhp', 'przepisy ogólne'],
    source: 'Rozporządzenie Ministra Pracy i Polityki Socjalnej z dnia 26 września 1997 r. w sprawie ogólnych przepisów bezpieczeństwa i higieny pracy (tekst jednolity: Dz.U. 2003 nr 169 poz. 1650)',
    body:
      'Podstawowy, uniwersalny akt wykonawczy do Kodeksu Pracy w zakresie BHP — wymagania dla pomieszczeń pracy, procesów pracy, maszyn i urządzeń, czynników szkodliwych i uciążliwych. Stosowany uzupełniająco wobec przepisów branżowych górniczych (rozporządzenie o ruchu podziemnych zakładów górniczych ma pierwszeństwo jako lex specialis, ale ten akt wypełnia luki tam, gdzie przepis górniczy nie reguluje danej kwestii).',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'przepisy-prawo-geologiczne-gornicze',
    category: 'przepisy',
    title: 'Prawo geologiczne i górnicze — ustawa',
    tags: ['prawo geologiczne i górnicze', 'górnictwo podziemne', 'ustawa'],
    source: 'Ustawa z dnia 9 czerwca 2011 r. Prawo geologiczne i górnicze (tekst jednolity: Dz.U. 2026 poz. 69)',
    body:
      'Podstawowy akt prawny regulujący całą działalność geologiczną i górniczą w Polsce — obejmuje górnictwo podziemne, otworowe i odkrywkowe. Określa m.in.: zasady koncesjonowania działalności górniczej, obowiązki przedsiębiorcy górniczego, wymagania kwalifikacyjne dla osób kierownictwa i dozoru ruchu zakładu górniczego, zasady prowadzenia ruchu zakładu górniczego i sporządzania planu ruchu, nadzór i kontrolę sprawowaną przez Wyższy Urząd Górniczy (WUG) i okręgowe urzędy górnicze (OUG). To ustawa „matka", na podstawie której wydawane są szczegółowe rozporządzenia wykonawcze (np. ws. ruchu podziemnych zakładów górniczych).',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'przepisy-ruch-zakladow-podziemnych',
    category: 'przepisy',
    title: 'Szczegółowe wymagania dot. ruchu podziemnych zakładów górniczych — rozporządzenie',
    tags: ['ruch zakładu górniczego', 'górnictwo podziemne', 'bhp górnictwo'],
    source: 'Rozporządzenie Ministra Energii z dnia 23 listopada 2016 r. w sprawie szczegółowych wymagań dotyczących prowadzenia ruchu podziemnych zakładów górniczych (Dz.U. 2017 poz. 1118, z późn. zm.)',
    body:
      'Kluczowy akt wykonawczy do Prawa geologicznego i górniczego — najbardziej szczegółowy zbiór wymagań technicznych i organizacyjnych dla ruchu podziemnego zakładu górniczego. Obejmuje m.in.: bezpieczeństwo i higienę pracy, zabezpieczenie przeciwpożarowe, wentylację i zwalczanie zagrożeń naturalnych (metanowego, pyłowego, tąpań, wodnego), budowę i eksploatację wyrobisk, urządzenia i instalacje — w tym elektryczne (wymogi budowy przeciwwybuchowej/iskrobezpiecznej w strefach zagrożonych wybuchem), transport i przewóz ludzi, ratownictwo górnicze. Uwaga: nowelizowane częściej niż ustawa macierzysta (m.in. 2019, 2020) — przed powołaniem się na konkretny paragraf w realnej sytuacji zawsze zweryfikuj aktualny tekst jednolity na ISAP.',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'przepisy-kp-art-207',
    category: 'przepisy',
    title: 'Obowiązki pracodawcy w zakresie BHP — art. 207 Kodeksu Pracy',
    tags: ['kodeks pracy', 'bhp', 'obowiązki pracodawcy'],
    source: 'Ustawa z dnia 26 czerwca 1974 r. Kodeks pracy (tekst jednolity: Dz.U. 2025 poz. 277), art. 207, Dział X „Bezpieczeństwo i higiena pracy"',
    body:
      'Pracodawca ponosi pełną odpowiedzialność za stan BHP w zakładzie pracy — nie zwalniają go z tego ani obowiązki pracowników, ani zlecenie zadań służby BHP specjalistom z zewnątrz (§1). Musi chronić zdrowie i życie pracowników, zapewniając bezpieczne i higieniczne warunki pracy przy wykorzystaniu aktualnej wiedzy naukowo-technicznej — w szczególności: organizować pracę bezpiecznie, egzekwować przestrzeganie przepisów BHP i wydawać polecenia usunięcia uchybień, reagować na zmieniające się warunki pracy, prowadzić spójną politykę zapobiegania wypadkom i chorobom zawodowym, chronić grupy szczególne (kobiety w ciąży/karmiące, młodocianych, pracowników niepełnosprawnych), wykonywać nakazy i decyzje PIP oraz wnioski społecznej inspekcji pracy (§2). Koszty działań BHP nie mogą w żadnej formie obciążać pracownika (§2¹). Pracodawca oraz osoby kierujące pracownikami muszą znać przepisy BHP w zakresie niezbędnym do wykonywania swoich obowiązków (§3).',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'normy-pn-hd-60364-6',
    category: 'normy',
    title: 'PN-HD 60364-6 — sprawdzanie i pomiary okresowe instalacji elektrycznych nn',
    tags: ['norma', 'pomiary okresowe', 'instalacje elektryczne', 'PN-HD'],
    source: 'PN-HD 60364-6:2016-07 „Instalacje elektryczne niskiego napięcia — Część 6: Sprawdzanie", w powiązaniu z art. 62 ustawy Prawo budowlane',
    body:
      'Podstawowy dokument normatywny określający zasady odbioru i okresowej kontroli instalacji elektrycznych niskiego napięcia — cel to bezpieczeństwo użytkowników i poprawne działanie instalacji. Norma wskazuje kolejność oględzin, prób i pomiarów: odbiór (po montażu, przed oddaniem do użytku) i kontrola okresowa (wg rodzaju obiektu). Zgodnie z Prawem Budowlanym kontrola okresowa musi się odbywać nie rzadziej niż raz na 5 lat. Zakres pomiarów: rezystancja izolacji, impedancja pętli zwarcia, ciągłość przewodów ochronnych, oględziny stanu instalacji, sprawdzenie działania urządzeń różnicowoprądowych (RCD). Protokół musi zawierać: dane obiektu i instalacji, dane wykonawcy (nr świadectwa SEP, termin ważności), wykaz przyrządów pomiarowych z datą legalizacji, wyniki pomiarów odniesione do wymagań normy z oceną (pozytywna/negatywna), podpis.',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'wzory-protokol-pomiaru-okresowego',
    category: 'wzory',
    title: 'Wzór: protokół z pomiaru okresowego instalacji elektrycznej nn',
    tags: ['wzór', 'protokół', 'pomiary okresowe'],
    source: 'Szablon własny zgodny z PN-HD 60364-6 — pełna wersja: Biznes/protokoly/_szablon-protokol-pomiaru-okresowego.md',
    body:
      'Struktura protokołu: 1) Dane obiektu i instalacji (adres, rok budowy, rodzaj układu sieci TN-C/TN-S/TT, schemat jednokreskowy). 2) Dane wykonującego pomiar (imię i nazwisko, nr świadectwa SEP grupa 1 zakres kontrolno-pomiarowy, termin ważności). 3) Przyrządy pomiarowe użyte (typ, nr seryjny, data legalizacji). 4) Zakres i metodyka pomiarów wg PN-HD 60364-6 (oględziny, rezystancja izolacji, impedancja pętli zwarcia, ciągłość przewodów ochronnych, RCD). 5) Wyniki pomiarów w formie tabeli (punkt pomiarowy, wartość zmierzona, wartość dopuszczalna, ocena). 6) Stwierdzone nieprawidłowości i zalecenia z priorytetyzacją. 7) Wniosek końcowy (instalacja nadaje/nie nadaje się do eksploatacji, termin kolejnego przeglądu). 8) Podpis i pieczęć wykonawcy.',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'schematy-symbole-pn-en-60617',
    category: 'schematy',
    title: 'Legenda podstawowych symboli elektrycznych wg PN-EN 60617 (IEC 60617)',
    tags: ['symbole', 'schematy', 'PN-EN 60617'],
    source: 'PN-EN 60617 (polska wersja normy EN 60617, identyczna z IEC 60617)',
    body:
      'Podstawowe symbole używane na schematach elektrycznych, pogrupowane funkcjonalnie:\n\nInstalacja domowa: żarówka/oprawa (okrąg z krzyżykiem), gniazdo wtyczkowe (półkole; dodatkowa kreska = styk ochronny PE), łącznik jednobiegunowy (ukośna kreska/dźwignia przy torze prądowym).\n\nZabezpieczenia: bezpiecznik topikowy (prostokąt z linią przez środek), wyłącznik nadprądowy (aparat łączeniowy chroniący obwód przed przeciążeniem/zwarciem), wyłącznik różnicowoprądowy RCD (łącznik z symbolem przekładnika i oznaczeniem prądu zadziałania).\n\nSterowanie: styk zwierny NO i rozwierny NC, cewka (element elektromagnesu, np. stycznika), przycisk sterujący.\n\nMaszyny i źródła: silnik elektryczny (okrąg z literą M), transformator (dwie sprzężone cewki — uzwojenie pierwotne i wtórne), bateria/źródło napięcia.\n\nElementy podstawowe: rezystor, kondensator, dioda (symbole elementów biernych/półprzewodnikowych), uziemienie (pionowa kreska zakończona trzema poziomymi kreskami o malejącej długości).\n\nUwaga: to legenda opisowa (tekstowa), nie rysunek — do rysowania realnych schematów użyj oprogramowania CAD/EDA zgodnego z normą.',
    attachment: null,
    updatedAt: '2026-08-02',
  },
  {
    id: 'dokumentacja-przyklad-dtr-kombajn',
    category: 'dokumentacja',
    title: '[PRZYKŁAD] DTR kombajnu — dokument zastrzeżony',
    tags: ['DTR', 'kombajn', 'dokumentacja zastrzeżona'],
    source: 'Dokument zastrzeżony — przechowywany lokalnie na telefonie/karcie pamięci, poza appką',
    body:
      'To przykładowy rekord kategorii "Dokumentacja techniczna". Appka NIE przechowuje samego pliku — dokumenty zastrzeżone zostają wyłącznie lokalnie na urządzeniu, pod osobistym nadzorem nad dostępem i bezpieczeństwem. Ten rekord to katalog/opis + przycisk szybkiego wskazania pliku w widoku szczegółów (systemowy selektor plików, bez zapamiętywania ścieżki — ograniczenie systemu Android). Pole "attachment" poniżej to tylko podpowiedź tekstowa, gdzie/jak nazywa się plik na dysku.',
    attachment: 'np. DTR_kombajn_AM1.pdf — folder Dokumentacja/DTR na karcie pamięci',
    updatedAt: '2026-08-02',
  },
  {
    id: 'urzadzenia-przyklad-opis',
    category: 'urzadzenia',
    title: '[PRZYKŁAD] Opis urządzenia — katalog',
    tags: ['przykład', 'katalog urządzeń'],
    source: 'Do uzupełnienia',
    body:
      'To przykładowy rekord kategorii "Urządzenia" — ogólny opis/dokumentacja typu urządzenia (charakterystyka techniczna, parametry znamionowe, typowe usterki), nie dane operacyjne konkretnego egzemplarza w terenie — te są w zakładce Nadzór rejonu.',
    attachment: null,
    updatedAt: '2026-08-02',
  },
];
