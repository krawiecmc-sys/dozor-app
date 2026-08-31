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
  { key: 'nastawa', label: 'Nastawa', type: 'text' },
  { key: 'legalizacja', label: 'Data legalizacji', type: 'date' },
];

export const NADZOR_ENTITIES = {
  rozdzielnie: {
    label: 'Rozdzielnie',
    labelSingular: 'rozdzielnia',
    titleField: 'nazwa_r',
    fields: [
      { key: 'nazwa_r', label: 'Nazwa rozdzielni', type: 'text', required: true },
      { key: 'pole_nr', label: 'Nr pola (rejonu górniczego)', type: 'text', hint: 'Numer pola/rejonu górniczego, w którym stoi ta rozdzielnia — nie mylić z elektrycznym "Polem rozdzielczym" poniżej.' },
      { key: 'r_zasilana_z_glowne', label: 'Zasilana z — główne', type: 'text' },
      { key: 'r_zasilana_z_rezerwowe', label: 'Zasilana z — rezerwowe/awaryjne', type: 'text' },
    ],
  },
  poleRozdzielcze: {
    label: 'Pole rozdzielcze',
    labelSingular: 'pole rozdzielcze',
    titleField: 'p_nazwa',
    fields: [
      { key: 'p_nazwa', label: 'Nazwa / nr pola rozdzielczego', type: 'text', required: true },
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
      { key: 't_napiecie', label: 'Napięcie', type: 'select', options: ['6/1 kV', '6/0,5 kV', '6/0,5/1 kV'] },
      { key: 't_nastawa_zabezpieczen', label: 'Nastawa zabezpieczeń', type: 'text' },
      { key: 't_obciazenie', label: 'Wartość obciążeniowa', type: 'text' },
      {
        key: 'zasilany_z_pola',
        label: 'Zasilany z (pole rozdzielcze)',
        type: 'fk-or-free',
        refStore: 'poleRozdzielcze',
        refField: 'p_nazwa',
        hint: 'Wybierz z listy istniejących pól rozdzielczych albo wpisz nazwę ręcznie.',
      },
    ],
  },
  kb: {
    label: 'KB',
    labelSingular: 'maszyna urabiająca (KB)',
    titleField: 'kb_nazwa',
    fields: [
      { key: 'typ_kb', label: 'Typ', type: 'select', options: ['ścianowy', 'przodkowy', 'spągoładowarka'], required: true },
      { key: 'kb_nazwa', label: 'Nazwa / numer', type: 'text', required: true },
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
        options: ['Rozdzielnia', 'Pole rozdzielcze', 'Transformator', 'KB', 'Silnik', 'Czujnik'],
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
  kb: {
    typ_kb: 'ścianowy',
    kb_nazwa: 'PRZYKŁAD — AM-1',
    zasilany_z_transformatora: 'PRZYKŁAD-T1',
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
