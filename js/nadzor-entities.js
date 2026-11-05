// Definicje encji modułu "Rejon" — dane operacyjne, zakładowe.
// Schemat przeprojektowany 31.08.2026: prawdziwe klucze obce zamiast
// dopasowania tekstu po nazwie (stary problem — patrz plan reorganizacji).
// Hierarchia: Rozdzielnia -> Pole rozdzielcze (fk-or-free) -> KB
// (fk-multi -> Silniki, fk-multi -> Czujniki).
//
// UWAGA: appka NIE zawiera żadnych prawdziwych danych KWK Piast. Rekordy
// przykładowe (poniżej) są jawnie fikcyjne. Wypełnienie realnymi
// numerami/nastawami wymaga wcześniejszego potwierdzenia zgodności
// z polityką bezpieczeństwa/IT pracodawcy — patrz Zadania/w_trakcie/
// aplikacja-dozor-baza-wiedzy-pwa.md w vaultcie Obsidian.
//
// Kolejność kluczy w tym obiekcie = kolejność zakładek w UI.
//
// Nowe typy pól obsługiwane przez crud-module.js (obok text/number/select/
// date/datetime-local/textarea/sublist):
//   - 'fk-or-free': select z rekordami innego magazynu (wartość = numeryczne
//     id) + opcja "inny (wpisz ręcznie)" odsłaniająca zwykły tekst (wartość
//     = string). Dla Pole_rozdzielcze.miejsce_zabudowy — "z możliwością
//     dopisania z palca", jak wprost poprosił user.
//   - 'fk-multi': lista checkboxów z rekordami innego magazynu, wartość =
//     tablica numerycznych id. Prawdziwa relacja N:M (KB <-> Silniki/Czujniki).

function nowForDatetimeLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// Wspólny kształt listy nastaw zabezpieczeń (KB) — nazwa/rodzaj + nastawa +
// data legalizacji (podświetlana na czerwono w widoku listy, gdy minął rok
// — patrz crud-module.js/isExpired).
const ZABEZPIECZENIA_SUBFIELDS = [
  { key: 'nazwa', label: 'Nazwa / rodzaj zabezpieczenia', type: 'text' },
  { key: 'nr', label: 'Nr', type: 'text' }, // 03.11.2026 — z wykazu zabezpieczeń trafo
  { key: 'nastawa', label: 'Nastawa', type: 'text' },
  { key: 'legalizacja', label: 'Data legalizacji', type: 'date' },
];

// --- 03.11.2026: "Plan rejonu" (plan-view.js) ---
// Położenie obiektu w chodniku (chodnik + metraż + strona) i opis kabla
// zasilającego. Kabel NIE jest osobną tabelą: kto kogo zasila zostaje w
// istniejących polach "zasilany z" (jedno źródło prawdy), a kabel to cechy
// TEGO połączenia, zapisane przy obiekcie zasilanym. Dzięki temu plan i
// Graf zasilania nie mogą się rozjechać.
const ZRODLO_DANYCH = { key: 'zrodlo_danych', label: 'Źródło danych', type: 'select', options: ['Excel', 'ręcznie', 'pomiar'], hint: 'Na planie widać, które dane są niepewne (wpisane ręcznie).' };

function poleLokalizacji() {
  return [
    { key: '_h_lok', label: 'Położenie na planie rejonu', type: 'heading' },
    {
      key: 'lok_chodnik',
      label: 'Chodnik',
      type: 'fk-or-free',
      refStore: 'chodniki',
      refField: 'ch_nazwa',
      hint: 'Chodnik, w którym stoi obiekt (zakładka Chodniki). Można też postawić obiekt kliknięciem na Planie rejonu.',
    },
    { key: 'lok_metraz', label: 'Metraż od początku chodnika (m)', type: 'number', blank: true },
    { key: 'lok_strona', label: 'Strona chodnika', type: 'select', options: ['lewa', 'prawa', 'oś'], hint: 'Strona patrząc od początku chodnika w kierunku jego biegu.' },
  ];
}

function poleKabla(prefix = 'kabel', naglowek = 'Kabel zasilający (od źródła do tego obiektu)') {
  return [
    { key: `_h_${prefix}`, label: naglowek, type: 'heading' },
    { key: `${prefix}_nr`, label: 'Nr kabla / linii', type: 'text' },
    { key: `${prefix}_typ`, label: 'Typ kabla', type: 'text' },
    { key: `${prefix}_przekroj`, label: 'Przekrój (np. 3x95+…)', type: 'text' },
    { key: `${prefix}_dlugosc`, label: 'Długość (m)', type: 'number', blank: true },
    { key: `${prefix}_odplyw`, label: 'Odpływ / zacisk w źródle', type: 'text' },
  ];
}

// Rodzaj urządzenia (03.11.2026, Piotr): transformator zasila wyłączniki/aparaty, nie bezpośrednio silniki.
export const U_RODZAJE = ['wyłącznik / aparat', 'odbiornik (silnik, pompa, wentylator…)'];

export const NADZOR_ENTITIES = {
  rozdzielnie: {
    label: 'Rozdzielnie',
    labelSingular: 'rozdzielnia',
    titleField: 'nazwa_r',
    fields: [
      { key: 'nazwa_r', label: 'Nazwa rozdzielni', type: 'text', required: true },
      { key: 'pole_nr', label: 'Nr pola (rejonu górniczego)', type: 'text', hint: 'Numer pola/rejonu górniczego, w którym stoi ta rozdzielnia — nie mylić z elektrycznym "Polem rozdzielczym" poniżej.' },
      // 01.09.2026: z wolnego tekstu na fk-or-free (self-referencja do innej
      // Rozdzielni) — user potwierdził wprost. Każda rozdzielnia ma DWA
      // niezależne zasilania; oba pola są informacyjne/dla Grafu zasilania
      // (rysują strzałki między rozdzielniami), NIE sterują strukturą drzewa
      // Mapy rejonu — dashboard.js świadomie zostawia wszystkie Rozdzielnie
      // jako korzenie drzewa (dwa możliwe rodzice nie dają się czysto
      // zagnieździć w drzewie bez duplikowania poddrzewa — patrz plan sesji).
      {
        key: 'r_zasilana_z_glowne',
        label: 'Zasilana z — główne',
        type: 'fk-or-free',
        refStore: 'rozdzielnie',
        refField: 'nazwa_r',
        hint: 'Wybierz z listy istniejących rozdzielni albo wpisz ręcznie, jeśli źródło jest poza tą bazą (np. przyłącze zewnętrzne kopalni).',
      },
      {
        key: 'r_zasilana_z_rezerwowe',
        label: 'Zasilana z — rezerwowe/awaryjne',
        type: 'fk-or-free',
        refStore: 'rozdzielnie',
        refField: 'nazwa_r',
        hint: 'Wybierz z listy istniejących rozdzielni albo wpisz ręcznie, jeśli źródło jest poza tą bazą.',
      },
      { key: 'r_napiecie', label: 'Napięcie rozdzielni', type: 'select', options: ['6 kV', '1 kV', '0,5 kV'] },
      ...poleLokalizacji(),
      ...poleKabla('kabel', 'Kabel zasilania głównego'),
      ...poleKabla('kabel_rez', 'Kabel zasilania rezerwowego'),
      ZRODLO_DANYCH,
    ],
  },
  poleRozdzielcze: {
    label: 'Pole rozdzielcze',
    labelSingular: 'pole rozdzielcze',
    titleField: 'p_nazwa',
    fields: [
      { key: 'p_nazwa', label: 'Nazwa / nr pola rozdzielczego', type: 'text', required: true },
      { key: 'rejon', label: 'Rejon (KB)', type: 'fk-or-free', refStore: 'kb', refField: 'kb_nazwa', hint: 'Zwykle puste — rejon wynika z sieci: kombajn wyznacza rejon, a do rejonu należy wszystko, co go zasila, aż do rozdzielni. Wpisz tylko dla rejonu bez kombajnu.' },
      { key: 'p_przeznaczenie', label: 'Przeznaczenie pola', type: 'text', hint: 'np. odpływ, zasilające (główne / rezerwowe), pomiarowe, sprzęgło, bateria kondensatorów, wolne.' },
      { key: 'p_zasilane_z', label: 'Zasilane z (opis źródła)', type: 'text' },
      { key: 'zabezpieczenia_nazwa', label: 'Zabezpieczenia — nazwa', type: 'text' },
      { key: 'zabezpieczenia_nastawy', label: 'Zabezpieczenia — nastawy', type: 'text' },
      {
        key: 'miejsce_zabudowy',
        label: 'Miejsce zabudowy (rozdzielnia)',
        type: 'fk-or-free',
        refStore: 'rozdzielnie',
        refField: 'nazwa_r',
        hint: 'Wybierz z listy istniejących rozdzielni albo wpisz nazwę ręcznie, jeśli jeszcze jej nie ma w bazie.',
      },
      {
        // 03.11.2026 (Piotr): pole zasila transformator albo inne pole — przelot 6 kV do kolejnej rozdzielni
        key: 'zasilane_z_pola',
        label: 'Zasilane z pola (przelot 6 kV)',
        type: 'fk-or-free',
        refStore: 'poleRozdzielcze',
        refField: 'p_nazwa',
        hint: 'Dla pola zasilającego rozdzielnicy: pole innej rozdzielni, z którego przychodzi kabel (przelot). Pola odpływowe zostaw puste.',
      },
      ...poleKabla('kabel', 'Kabel przelotowy (od pola źródłowego)'),
      ZRODLO_DANYCH,
      { key: 'uwagi', label: 'Uwagi', type: 'textarea' },
    ],
  },
  // Dodane ponownie 31.08.2026 jako osobna tabela, na wyraźną prośbę usera
  // (wcześniej w tej samej sesji rola transformatora zakładała się mieścić
  // w parze Rozdzielnia -> Pole_rozdzielcze). Miejsce w łańcuchu takie samo
  // jak w oryginalnym, sprzed-reorganizacji schemacie: Pole rozdzielcze ->
  // Transformator -> (teraz) KB, zamiast Pole rozdzielcze -> Urządzenie.
  transformatory: {
    label: 'Transformatory',
    labelSingular: 'transformator',
    titleField: 't_nr',
    fields: [
      { key: 't_nr', label: 'Nr transformatora', type: 'text', required: true },
      { key: 'rejon', label: 'Rejon (KB)', type: 'fk-or-free', refStore: 'kb', refField: 'kb_nazwa', hint: 'Zwykle puste — rejon wynika z sieci (transformator zasilający kombajn albo jego wyłączniki należy do rejonu kombajnu). Wpisz dla rejonu bez kombajnu (np. odstawczy) — urządzenia zasilane z tego transformatora przejmą rejon.' },
      { key: 't_nr_kop', label: 'Nr kopalniany', type: 'text', hint: 'Łączy wykaz stacji, schemat rozdzielni i zabezpieczenia (np. „nr 901” pod polem).' },
      { key: 'oddzial', label: 'Oddział elektryczny (użytkownik)', type: 'select', options: ['', 'odstawczy', 'przodkowy', 'ścianowy', 'inny'], hint: 'Na tej samej sieci są transformatory i urządzenia innych oddziałów — na Planie rejonu widać je wyblakłe albo ukryte. Puste: jak transformator, z którego zasilane.' },
      { key: 't_typ', label: 'Typ', type: 'text' },
      { key: 't_moc', label: 'Moc (kVA)', type: 'number', blank: true },
      { key: 't_napiecie', label: 'Napięcie', type: 'select', options: ['6/1 kV', '6/0,5 kV', '6/0,5/1 kV'] },
      { key: 't_nr_fabryczny', label: 'Nr fabryczny', type: 'text' },
      { key: 't_nr_inw', label: 'Nr inwentarzowy', type: 'text' },
      { key: 't_nr_ewid', label: 'Nr ewidencyjny', type: 'text' },
      { key: 't_rok', label: 'Rok produkcji', type: 'text' },
      { key: 't_data_badania', label: 'Data ostatniego badania', type: 'date' },
      { key: 't_dokumentacja', label: 'Dokumentacja (opinia, deklaracja…)', type: 'text' },
      { key: 't_stan', label: 'Stan (na stanie, WL, likwidacja)', type: 'text' },
      { key: 't_rejon', label: 'Rejon / grupa (np. AM-1/3)', type: 'text' },
      { key: 't_nastawa_zabezpieczen', label: 'Nastawa zabezpieczeń', type: 'text' },
      { key: 'nastawy_zabezpieczen', label: 'Zabezpieczenia (typ, nr, nastawa, data)', type: 'sublist', subFields: ZABEZPIECZENIA_SUBFIELDS },
      { key: 't_obciazenie', label: 'Wartość obciążeniowa', type: 'text' },
      {
        key: 'zasilany_z_pola',
        label: 'Zasilany z (pole rozdzielcze)',
        type: 'fk-or-free',
        refStore: 'poleRozdzielcze',
        refField: 'p_nazwa',
        hint: 'Wybierz z listy istniejących pól rozdzielczych albo wpisz nazwę ręcznie.',
      },
      {
        // 03.11.2026 (Piotr): z przelotu jednego transformatora może być zasilany drugi — po stronie pierwotnej 6 kV
        key: 'zasilany_z_transformatora',
        label: 'Zasilany z transformatora (przelot 6 kV)',
        type: 'fk-or-free',
        refStore: 'transformatory',
        refField: 't_nr',
        hint: 'Wypełnij zamiast pola rozdzielczego, gdy transformator wisi na przelocie 6 kV innego transformatora.',
      },
      {
        key: 'zasilany_z_urzadzenia',
        label: 'Zasilany z aparatu 6 kV (SK, APST, APSPa)',
        type: 'fk-or-free',
        refStore: 'urzadzenia',
        refField: 'nazwa',
        hint: 'Rzadko: gdy między polem a transformatorem stoi aparat 6 kV.',
      },
      { key: 't_miejsce_opis', label: 'Miejsce zabudowy (opis, np. z Excela)', type: 'text' },
      ...poleLokalizacji(),
      ...poleKabla(),
      ZRODLO_DANYCH,
      { key: 'uwagi', label: 'Uwagi', type: 'textarea' },
    ],
  },
  // Dodane 01.09.2026 — sprzęt kopalniany (wyłączniki, szafy stycznikowe,
  // agregaty, pompy, zespoły transformatorowe, wentylatory, wiertnice).
  // W odróżnieniu od KB (zawsze zasilane z transformatora), Urządzenie bywa
  // zasilane BEZPOŚREDNIO z transformatora ALBO z innego urządzenia (łańcuch
  // urządzenie -> urządzenie) — stąd DWA osobne pola fk-or-free zamiast
  // jednego z wieloma refStore na raz (to drugie wymagałoby zmiany silnika
  // crud-module.js współdzielonego przez WSZYSTKIE encje — wyższe ryzyko
  // regresji). W praktyce user wypełnia tylko JEDNO z tych dwóch pól.
  // UWAGA (znane, świadomie zaakceptowane ograniczenie): pole
  // 'zasilane_z_urzadzenia' jest self-referencją (refStore: 'urzadzenia').
  // crud-module.js nie wyklucza aktualnie edytowanego rekordu z listy wyboru
  // w fk-or-free, więc formularz nie blokuje wybrania urządzenia jako
  // zasilającego samo siebie ani pętli A->B->A. dashboard.js ma na to
  // zabezpieczenie przy renderowaniu (ancestorIds-guard w renderUrzadzeniaFor).
  urzadzenia: {
    label: 'Urządzenia',
    labelSingular: 'urządzenie',
    titleField: 'nazwa',
    fields: [
      { key: 'nazwa', label: 'Nazwa / oznaczenie urządzenia', type: 'text', required: true },
      { key: 'rejon', label: 'Rejon (KB)', type: 'fk-or-free', refStore: 'kb', refField: 'kb_nazwa', hint: 'Zwykle puste — rejon jak źródło zasilania.' },
      { key: 'symbol', label: 'Symbol', type: 'text' },
      { key: 'u_rodzaj', label: 'Rodzaj', type: 'select', options: U_RODZAJE, hint: 'Transformator zasila wyłączniki / aparaty. Odbiornik (silnik, pompa, wentylator) zasilany jest z wyłącznika.' },
      { key: 'oddzial', label: 'Oddział elektryczny (użytkownik)', type: 'select', options: ['', 'odstawczy', 'przodkowy', 'ścianowy', 'inny'], hint: 'Na tej samej sieci są transformatory i urządzenia innych oddziałów — na Planie rejonu widać je wyblakłe albo ukryte. Puste: jak transformator, z którego zasilane.' },
      { key: 'moc', label: 'Moc (kW)', type: 'number' },
      { key: 'nap_zas', label: 'Napięcie zasilania', type: 'select', options: ['0,5 kV', '1 kV', '6 kV'] },
      {
        key: 'zasilane_z_transformatora',
        label: 'Zasilane z (transformator)',
        type: 'fk-or-free',
        refStore: 'transformatory',
        refField: 't_nr',
        hint: 'Wypełnij TO pole, jeśli urządzenie jest zasilane bezpośrednio z transformatora. Jeśli jest zasilane z innego urządzenia — zostaw puste i użyj pola poniżej.',
      },
      {
        key: 'zasilane_z_urzadzenia',
        label: 'Zasilane z (inne urządzenie)',
        type: 'fk-or-free',
        refStore: 'urzadzenia',
        refField: 'nazwa',
        hint: 'Wypełnij TO pole, jeśli urządzenie jest zasilane z innego urządzenia (np. pompa z szafy stycznikowej), a nie bezpośrednio z transformatora.',
      },
      {
        // 03.11.2026: aparat 6 kV (SK, APST, APSPa) albo odbiornik 6 kV (pompa) wprost z pola rozdzielni
        key: 'zasilane_z_pola',
        label: 'Zasilane z pola rozdzielczego (6 kV)',
        type: 'fk-or-free',
        refStore: 'poleRozdzielcze',
        refField: 'p_nazwa',
        hint: 'Tylko aparat albo odbiornik 6 kV zasilany wprost z pola.',
      },
      { key: 'nastawy_zabezpieczen', label: 'Nastawy zabezpieczeń', type: 'sublist', subFields: ZABEZPIECZENIA_SUBFIELDS },
      ...poleLokalizacji(),
      ...poleKabla(),
      ZRODLO_DANYCH,
    ],
  },
  kb: {
    label: 'KB',
    labelSingular: 'maszyna urabiająca (KB)',
    titleField: 'kb_nazwa',
    fields: [
      { key: 'typ_kb', label: 'Typ', type: 'select', options: ['ścianowy', 'przodkowy', 'spągoładowarka'], required: true },
      { key: 'kb_nazwa', label: 'Nazwa / numer', type: 'text', required: true },
      { key: 'oddzial', label: 'Oddział elektryczny (użytkownik)', type: 'select', options: ['', 'odstawczy', 'przodkowy', 'ścianowy', 'inny'], hint: 'Na tej samej sieci są transformatory i urządzenia innych oddziałów — na Planie rejonu widać je wyblakłe albo ukryte. Puste: jak transformator, z którego zasilane.' },
      {
        // 31.08.2026: przełączone z bezpośredniego zasilania z Pola
        // rozdzielczego na zasilanie z Transformatora, po dopisaniu
        // Transformatora jako osobnej tabeli między Polem a KB — bez tego
        // pola KB nie miałoby żadnego realnego połączenia w górę łańcucha.
        key: 'zasilany_z_transformatora',
        label: 'Zasilany z (transformator)',
        type: 'fk-or-free',
        refStore: 'transformatory',
        refField: 't_nr',
        hint: 'Wybierz z listy istniejących transformatorów albo wpisz nr ręcznie.',
      },
      {
        // 01.09.2026: KB może też wisieć na końcu łańcucha Urządzeń
        // (Transformator -> Urządzenie -> ... -> KB), nie tylko bezpośrednio
        // na Transformatorze — patrz komentarz przy encji "urzadzenia" wyżej.
        key: 'zasilany_z_urzadzenia',
        label: 'Zasilany z (inne urządzenie)',
        type: 'fk-or-free',
        refStore: 'urzadzenia',
        refField: 'nazwa',
        hint: 'Wypełnij TO pole, jeśli KB jest zasilane z urządzenia pośredniego (np. szafy stycznikowej), a nie bezpośrednio z transformatora. Jeśli zasilane bezpośrednio z transformatora — użyj pola powyżej.',
      },
      {
        key: 'silniki',
        label: 'Silniki',
        type: 'fk-multi',
        refStore: 'silniki',
        refLabelFields: ['nazwa_silnika', 's_moc', 's_rodzaj'],
      },
      {
        key: 'czujniki',
        label: 'Czujniki',
        type: 'fk-multi',
        refStore: 'czujniki',
        refLabelFields: ['nazwa_czujnik'],
      },
      { key: 'nastawy_zabezpieczen', label: 'Nastawy zabezpieczeń', type: 'sublist', subFields: ZABEZPIECZENIA_SUBFIELDS },
      ...poleLokalizacji(),
      ...poleKabla(),
      ZRODLO_DANYCH,
    ],
  },
  // 03.11.2026: chodniki wracają (usunięte 31.08.2026 jako "chodnikiTrasy")
  // w prostszej postaci — tylko geometria do Planu rejonu: skąd wychodzi,
  // w którą stronę i jak długi. Trasa kabla wynika z położenia obiektów.
  chodniki: {
    label: 'Chodniki',
    labelSingular: 'chodnik',
    titleField: 'ch_nazwa',
    fields: [
      { key: 'ch_nazwa', label: 'Nazwa chodnika', type: 'text', required: true },
      { key: 'rejon', label: 'Rejon (KB)', type: 'fk-or-free', refStore: 'kb', refField: 'kb_nazwa', hint: 'Zwykle puste — chodnik należy do rejonu, gdy stoją w nim urządzenia rejonu. Wpisz dla chodnika pustego albo w przygotowaniu.' },
      { key: 'ch_nr', label: 'Nr chodnika', type: 'text' },
      { key: 'ch_rodzaj', label: 'Rodzaj chodnika', type: 'select', options: ['', 'transportowy', 'odstawczy', 'dowierzchnia', 'przecinka', 'inny'], hint: 'Widać go przy napędach i na Planie rejonu (05.11.2026).' },
      {
        key: 'ch_od_chodnika',
        label: 'Odchodzi od chodnika',
        type: 'fk-or-free',
        refStore: 'chodniki',
        refField: 'ch_nazwa',
        hint: 'Puste = chodnik początkowy rejonu (rysowany od punktu startowego).',
      },
      { key: 'ch_od_metraz', label: 'W metrażu tamtego chodnika (m)', type: 'number', blank: true },
      {
        key: 'ch_azymut',
        label: 'Kierunek na rysunku (stopnie)',
        type: 'number',
        blank: true,
        hint: '0 = w górę rysunku, 90 = w prawo, 180 = w dół, 270 = w lewo. Może być dowolny kąt, np. 150.',
      },
      { key: 'ch_dlugosc', label: 'Długość (m)', type: 'number', blank: true },
      { key: 'ch_w_drazeniu', label: 'W drążeniu (przodek na końcu)', type: 'select', options: ['nie', 'tak'] },
      { key: 'uwagi', label: 'Uwagi', type: 'textarea' },
    ],
  },
  // 03.11.2026: przenośnik z napędem (napęd = punkt na przenośniku, nie
  // osobny rekord — numer napędu to numer przenośnika, np. 1.3).
  przenosniki: {
    label: 'Przenośniki',
    labelSingular: 'przenośnik',
    titleField: 'pr_nr',
    fields: [
      { key: 'pr_nr', label: 'Nr przenośnika / napędu (np. 1.3)', type: 'text', required: true },
      { key: 'rejon', label: 'Rejon (KB)', type: 'fk-or-free', refStore: 'kb', refField: 'kb_nazwa', hint: 'Zwykle puste — rejon jak wyłącznik, z którego zasilany napęd.' },
      { key: 'pr_typ', label: 'Typ (np. Pt1000, Mifama 1100)', type: 'text' },
      { key: 'pr_chodnik', label: 'Chodnik', type: 'fk-or-free', refStore: 'chodniki', refField: 'ch_nazwa', hint: 'Nr i rodzaj chodnika (transportowy, odstawczy, dowierzchnia, przecinka) wpisuje się w zakładce Chodniki — pokażą się przy napędzie.' },
      { key: 'pr_od_m', label: 'Od metrażu (m)', type: 'number', blank: true },
      { key: 'pr_do_m', label: 'Do metrażu (m)', type: 'number', blank: true },
      { key: 'pr_naped_m', label: 'Napęd w metrażu (m)', type: 'number', blank: true, hint: 'Puste = na końcu "do metrażu".' },
      { key: 'pr_moc', label: 'Moc napędu (kW)', type: 'number', blank: true },
      {
        key: 'zasilany_z_urzadzenia',
        label: 'Napęd zasilany z (urządzenie)',
        type: 'fk-or-free',
        refStore: 'urzadzenia',
        refField: 'nazwa',
      },
      ...poleKabla(),
      ZRODLO_DANYCH,
      { key: 'uwagi', label: 'Uwagi', type: 'textarea' },
    ],
  },
  czujniki: {
    label: 'Czujniki',
    labelSingular: 'czujnik',
    titleField: 'nazwa_czujnik',
    fields: [
      { key: 'nazwa_czujnik', label: 'Nazwa czujnika', type: 'text', required: true },
      { key: 'opis', label: 'Opis', type: 'textarea' },
    ],
  },
  silniki: {
    label: 'Silniki',
    labelSingular: 'silnik',
    // titleField: 'nazwa_silnika' pole dopisane względem literalnej listy usera
    // (samo s_moc/napiecie_zas/s_rodzaj nie dawało niczego czytelnego jako
    // tytuł karty na liście i w pickerze fk-multi w KB) — do potwierdzenia,
    // łatwe do usunięcia, jeśli niepotrzebne.
    titleField: 'nazwa_silnika',
    fields: [
      { key: 'nazwa_silnika', label: 'Nazwa / oznaczenie silnika', type: 'text', required: true },
      { key: 's_moc', label: 'Moc (kW)', type: 'number' },
      { key: 'napiecie_zas', label: 'Napięcie zasilania', type: 'select', options: ['0,5 kV', '1 kV', '0,5/1 kV'] },
      { key: 's_rodzaj', label: 'Rodzaj', type: 'select', options: ['łapowy', 'kołnierzowy'] },
    ],
  },
  przegladyBiezace: {
    label: 'Przegląd — Bieżący',
    labelSingular: 'wpis przeglądu bieżącego',
    titleField: 'obiekt',
    fields: [
      { key: 'dataGodzina', label: 'Data i godzina', type: 'datetime-local', required: true, default: nowForDatetimeLocal },
      {
        key: 'typObiektu',
        label: 'Typ obiektu',
        type: 'select',
        options: ['Rozdzielnia', 'Pole rozdzielcze', 'Transformator', 'Urządzenie', 'KB', 'Silnik', 'Czujnik', 'Przenośnik', 'Chodnik'],
      },
      { key: 'obiekt', label: 'Obiekt (nr / nazwa)', type: 'text', required: true },
      { key: 'wynik', label: 'Wynik', type: 'select', options: ['OK', 'Usterka', 'Do ponownego sprawdzenia'] },
      { key: 'uwagi', label: 'Uwagi', type: 'textarea' },
    ],
  },
};

// Jeden jawnie fikcyjny rekord przykładowy na encję — pokazuje działanie UI,
// zero realnych danych zakładowych. Kolejność wpisywania (rozdzielnie ->
// silniki/czujniki -> kb -> poleRozdzielcze) jest tu nieistotna — to tylko
// przykłady seedowane niezależnie przy pierwszym uruchomieniu, prawdziwe
// wypełnianie fk-or-free/fk-multi w formularzu wymaga wybrania rekordu z
// listy, więc przykłady poniżej NIE łączą się realnymi kluczami ze sobą
// (świadome uproszczenie seedu, żeby nie zakładać kolejności tworzenia).
export const NADZOR_EXAMPLES = {
  rozdzielnie: {
    nazwa_r: 'PRZYKŁAD — R-1',
    pole_nr: 'PRZYKŁAD',
    r_zasilana_z_glowne: 'do uzupełnienia',
    r_zasilana_z_rezerwowe: 'do uzupełnienia',
  },
  poleRozdzielcze: {
    p_nazwa: 'PRZYKŁAD — pole rozdzielcze',
    p_zasilane_z: 'do uzupełnienia',
    zabezpieczenia_nazwa: 'do uzupełnienia',
    zabezpieczenia_nastawy: 'do uzupełnienia',
    miejsce_zabudowy: 'PRZYKŁAD — R-1',
  },
  transformatory: {
    t_nr: 'PRZYKŁAD-T1',
    t_napiecie: '6/1 kV',
    t_nastawa_zabezpieczen: 'do uzupełnienia',
    t_obciazenie: 'do uzupełnienia',
    zasilany_z_pola: 'PRZYKŁAD — pole rozdzielcze',
  },
  urzadzenia: {
    nazwa: 'PRZYKŁAD — wyłącznik W-12',
    symbol: 'W-12',
    moc: 0,
    nap_zas: '6 kV',
    zasilane_z_transformatora: 'PRZYKŁAD-T1',
    zasilane_z_urzadzenia: '',
    nastawy_zabezpieczen: [{ nazwa: 'PRZYKŁAD — zabezpieczenie', nastawa: 'do uzupełnienia', legalizacja: '' }],
  },
  kb: {
    typ_kb: 'ścianowy',
    kb_nazwa: 'PRZYKŁAD — AM-1',
    zasilany_z_transformatora: 'PRZYKŁAD-T1',
    zasilany_z_urzadzenia: '',
    silniki: [],
    czujniki: [],
    nastawy_zabezpieczen: [{ nazwa: 'PRZYKŁAD — zabezpieczenie', nastawa: 'do uzupełnienia', legalizacja: '' }],
  },
  czujniki: {
    nazwa_czujnik: 'PRZYKŁAD — czujnik metanu',
    opis: 'do uzupełnienia',
  },
  silniki: {
    nazwa_silnika: 'PRZYKŁAD — silnik 1',
    s_moc: 0,
    napiecie_zas: '1 kV',
    s_rodzaj: 'łapowy',
  },
  przegladyBiezace: {
    dataGodzina: nowForDatetimeLocal(),
    typObiektu: 'KB',
    obiekt: 'PRZYKŁAD — AM-1',
    wynik: 'OK',
    uwagi: 'rekord przykładowy — usuń albo nadpisz',
  },
};
