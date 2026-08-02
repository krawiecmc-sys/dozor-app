// Rekordy startowe — zweryfikowane 2026-08-02 (wyszukiwanie + skille
// /przepisy-elektroenergetyka i /szablon-protokolu-pomiaru w vaultcie Obsidian).
// Pełne źródła i historia weryfikacji: Zasoby/Przepisy-elektroenergetyka.md
// oraz Biznes/protokoly/_szablon-protokol-pomiaru-okresowego.md.
//
// Zasada: tylko warstwa ogólna/uniwersalna. Zero materiałów zakładowych KWK.

// Podbij przy każdej zmianie treści poniżej — to wymusza odświeżenie
// lokalnej bazy na telefonie (patrz reseedIfNeeded w js/db.js).
export const SEED_VERSION = '2026-08-02-02';

export const seedData = [
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
    source: 'Ustawa z dnia 26 czerwca 1974 r. Kodeks pracy, art. 207 (Dz.U. 1974 nr 24 poz. 141 z późn. zm.)',
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
];
