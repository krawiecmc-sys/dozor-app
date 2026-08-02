// Definicje encji modułu "Nadzór rejonu" — dane operacyjne, zakładowe.
// UWAGA: appka NIE zawiera żadnych prawdziwych danych KWK Piast. Rekordy
// przykładowe (poniżej) są jawnie fikcyjne. Wypełnienie realnymi
// numerami/nastawami wymaga wcześniejszego potwierdzenia zgodności
// z polityką bezpieczeństwa/IT pracodawcy — patrz Zadania/w_trakcie/
// aplikacja-dozor-baza-wiedzy-pwa.md w vaultcie Obsidian.
//
// Kolejność kluczy w tym obiekcie = kolejność zakładek w UI.

const REJONY = ['zachód', 'wschód', 'centrum'];
const NR_KOMBAJNOW = ['AM-1', 'AM-2', 'AM-3', 'AM-4', 'AM-5', 'AM-6'];

function nowForDatetimeLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// Wspólny kształt listy zabezpieczeń (Kombajn, Urządzenia rejonowe) —
// nazwa/rodzaj + nastawa + data legalizacji (podświetlana na czerwono
// w widoku listy, gdy minął rok — patrz crud-module.js/isExpired).
const ZABEZPIECZENIA_SUBFIELDS = [
  { key: 'nazwa', label: 'Nazwa / rodzaj zabezpieczenia', type: 'text' },
  { key: 'nastawa', label: 'Nastawa', type: 'text' },
  { key: 'legalizacja', label: 'Data legalizacji', type: 'date' },
];

export const NADZOR_ENTITIES = {
  przodki: {
    label: 'Przodek',
    labelSingular: 'przodek',
    titleField: 'nrPrzodka',
    fields: [
      { key: 'nrPrzodka', label: 'Nr przodka', type: 'text', required: true },
      {
        key: 'kombajn',
        label: 'Kombajn (nr — referencja do zakładki Kombajn)',
        type: 'text',
        suggestFrom: { store: 'kombajny', field: 'nrKombajnu' },
      },
      {
        key: 'chodnik',
        label: 'Chodnik (nr)',
        type: 'text',
        suggestFrom: { store: 'chodnikiTrasy', field: 'nrChodnika' },
      },
      { key: 'rejon', label: 'Rejon', type: 'select', options: REJONY },
      {
        key: 'urabianieRodzajChodnika',
        label: 'Urabianie — rodzaj chodnika',
        type: 'select',
        options: ['obcinka', 'przecinka', 'dowierzchnia'],
      },
      { key: 'urabianiePoszerzenie', label: 'Urabianie — poszerzenie (cecha)', type: 'text' },
      { key: 'urabianieZakret', label: 'Urabianie — zakręt', type: 'select', options: ['prawo', 'lewo'] },
    ],
  },
  kombajny: {
    label: 'Kombajn',
    labelSingular: 'kombajn',
    titleField: 'nrKombajnu',
    fields: [
      { key: 'nrKombajnu', label: 'Numer kombajnu', type: 'select', options: NR_KOMBAJNOW, required: true },
      { key: 'nrFabryczny', label: 'Numer fabryczny (identyfikator)', type: 'text' },
      { key: 'zabezpieczenia', label: 'Zabezpieczenia', type: 'sublist', subFields: ZABEZPIECZENIA_SUBFIELDS },
    ],
  },
  urzadzeniaRejonowe: {
    label: 'Urządzenia rejonowe',
    labelSingular: 'urządzenie rejonowe',
    titleField: 'nazwa',
    fields: [
      { key: 'nazwa', label: 'Nazwa', type: 'text', required: true },
      { key: 'identyfikator', label: 'Identyfikator', type: 'text' },
      { key: 'przeznaczenie', label: 'Przeznaczenie', type: 'text' },
      {
        key: 'zasilanyZ',
        label: 'Zasilany z (transformator)',
        type: 'text',
        suggestFrom: { store: 'transformatory', field: 'nr' },
      },
      {
        key: 'zasila',
        label: 'Zasila (przodek / odbiornik)',
        type: 'text',
        suggestFrom: { store: 'przodki', field: 'nrPrzodka' },
      },
      { key: 'zabezpieczenia', label: 'Zabezpieczenia', type: 'sublist', subFields: ZABEZPIECZENIA_SUBFIELDS },
    ],
  },
  zabezpieczeniaKatalog: {
    label: 'Zabezpieczenia',
    labelSingular: 'zabezpieczenie (katalog)',
    titleField: 'nazwa',
    fields: [
      { key: 'nazwa', label: 'Nazwa', type: 'text', required: true },
      {
        key: 'funkcje',
        label: 'Funkcje zabezpieczające',
        type: 'sublist',
        subFields: [{ key: 'nazwa', label: 'Funkcja', type: 'text' }],
      },
      { key: 'identyfikator', label: 'Identyfikator', type: 'text' },
      {
        key: 'opisUrzadzenia',
        label: 'Opis — do jakiego urządzenia/wyłącznika',
        type: 'text',
        suggestFrom: { store: 'urzadzeniaRejonowe', field: 'nazwa' },
      },
    ],
  },
  transformatory: {
    label: 'Transformatory',
    labelSingular: 'transformator',
    titleField: 'nr',
    fields: [
      { key: 'nr', label: 'Nr transformatora', type: 'text', required: true },
      { key: 'napiecie', label: 'Napięcie', type: 'select', options: ['6/1 kV', '6/0,5 kV', '6/0,5/1 kV'] },
      { key: 'nastawaZabezpieczen', label: 'Nastawa zabezpieczeń', type: 'text' },
      { key: 'obciazenie', label: 'Wartość obciążeniowa', type: 'text' },
      { key: 'identyfikator', label: 'Identyfikator', type: 'text' },
      {
        key: 'zasilanyZ',
        label: 'Zasilany z (pole rozdzielcze)',
        type: 'text',
        suggestFrom: { store: 'poleRozdzielcze', field: 'nazwaPola' },
      },
    ],
  },
  poleRozdzielcze: {
    label: 'Pole rozdzielcze',
    labelSingular: 'pole rozdzielcze',
    titleField: 'nazwaPola',
    fields: [
      { key: 'nazwaPola', label: 'Nazwa / nr pola rozdzielczego', type: 'text', required: true },
      { key: 'zasilaneZ', label: 'Zasilane z', type: 'text' },
      { key: 'nastawaZabezpieczen', label: 'Nastawa zabezpieczeń', type: 'text' },
      {
        key: 'lokalizacja',
        label: 'Lokalizacja (np. wlot chodnika)',
        type: 'text',
        suggestFrom: { store: 'chodnikiTrasy', field: 'nrChodnika' },
        hint: 'Podpowiedź to sam nr chodnika — dopisz kontekst, np. "wlot chodnika PRZYKŁAD-1", żeby dashboard poprawnie dopasował.',
      },
    ],
  },
  chodnikiTrasy: {
    label: 'Chodniki i trasy kablowe',
    labelSingular: 'chodnik / trasa kablowa',
    titleField: 'nrChodnika',
    fields: [
      { key: 'nrChodnika', label: 'Nr chodnika', type: 'text', required: true },
      { key: 'rejon', label: 'Rejon', type: 'select', options: REJONY },
      { key: 'punktZasilania', label: 'Punkt zasilania (wlot)', type: 'text' },
      { key: 'trasaKablowa', label: 'Trasa kablowa (od – do)', type: 'text' },
      { key: 'przekrojKabla', label: 'Przekrój kabla', type: 'text' },
      { key: 'liczbaSOR', label: 'Liczba SOR (skrzynek łączeniowych) na trasie', type: 'number' },
      {
        key: 'wolneOdcinki',
        label: 'Wolne odcinki na trasie',
        type: 'sublist',
        subFields: [
          { key: 'dlugosc', label: 'Długość', type: 'text' },
          { key: 'przekroj', label: 'Przekrój kabla', type: 'text' },
          { key: 'wolneSOR', label: 'Wolne SOR', type: 'number' },
        ],
      },
      { key: 'uwagi', label: 'Uwagi', type: 'text' },
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
        options: ['Przodek', 'Kombajn', 'Urządzenie rejonowe', 'Transformator', 'Pole rozdzielcze', 'Chodnik / trasa kablowa'],
      },
      { key: 'obiekt', label: 'Obiekt (nr / nazwa)', type: 'text', required: true },
      { key: 'wynik', label: 'Wynik', type: 'select', options: ['OK', 'Usterka', 'Do ponownego sprawdzenia'] },
      { key: 'uwagi', label: 'Uwagi', type: 'textarea' },
    ],
  },
};

// Jeden jawnie fikcyjny rekord przykładowy na encję — pokazuje działanie UI,
// zero realnych danych zakładowych.
export const NADZOR_EXAMPLES = {
  przodki: {
    nrPrzodka: 'PRZYKŁAD-1',
    kombajn: 'AM-1',
    chodnik: 'PRZYKŁAD-1',
    rejon: 'zachód',
    urabianieRodzajChodnika: 'obcinka',
    urabianiePoszerzenie: 'do uzupełnienia',
    urabianieZakret: 'prawo',
  },
  kombajny: {
    nrKombajnu: 'AM-1',
    nrFabryczny: 'PRZYKŁAD-FAB-1',
    zabezpieczenia: [{ nazwa: 'PRZYKŁAD — zabezpieczenie', nastawa: 'do uzupełnienia', legalizacja: '' }],
  },
  urzadzeniaRejonowe: {
    nazwa: 'PRZYKŁAD — urządzenie rejonowe',
    identyfikator: 'PRZYKŁAD',
    przeznaczenie: 'do uzupełnienia',
    zasilanyZ: 'PRZYKŁAD-T1',
    zasila: 'PRZYKŁAD-1 (przodek)',
    zabezpieczenia: [{ nazwa: 'PRZYKŁAD — zabezpieczenie', nastawa: 'do uzupełnienia', legalizacja: '' }],
  },
  zabezpieczeniaKatalog: {
    nazwa: 'PRZYKŁAD — typ zabezpieczenia',
    funkcje: [{ nazwa: 'do uzupełnienia' }],
    identyfikator: 'PRZYKŁAD',
    opisUrzadzenia: 'PRZYKŁAD — urządzenie rejonowe',
  },
  transformatory: { nr: 'PRZYKŁAD-T1', napiecie: '6/1 kV', nastawaZabezpieczen: 'do uzupełnienia', obciazenie: 'do uzupełnienia', identyfikator: 'PRZYKŁAD', zasilanyZ: 'PRZYKŁAD — pole rozdzielcze' },
  poleRozdzielcze: {
    nazwaPola: 'PRZYKŁAD — pole rozdzielcze',
    zasilaneZ: 'do uzupełnienia',
    nastawaZabezpieczen: 'do uzupełnienia',
    lokalizacja: 'wlot chodnika PRZYKŁAD-1',
  },
  chodnikiTrasy: {
    nrChodnika: 'PRZYKŁAD-1',
    rejon: 'zachód',
    punktZasilania: 'wlot chodnika PRZYKŁAD-1',
    trasaKablowa: 'PRZYKŁAD — pole rozdzielcze → PRZYKŁAD-T1',
    przekrojKabla: 'do uzupełnienia',
    liczbaSOR: 0,
    wolneOdcinki: [{ dlugosc: 'do uzupełnienia', przekroj: 'do uzupełnienia', wolneSOR: 0 }],
    uwagi: 'rekord przykładowy — usuń albo nadpisz',
  },
  przegladyBiezace: {
    dataGodzina: nowForDatetimeLocal(),
    typObiektu: 'Urządzenie rejonowe',
    obiekt: 'PRZYKŁAD — urządzenie rejonowe',
    wynik: 'OK',
    uwagi: 'rekord przykładowy — usuń albo nadpisz',
  },
};
