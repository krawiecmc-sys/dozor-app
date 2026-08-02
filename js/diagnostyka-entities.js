// Definicje encji zakładki głównej "Diagnostyka" — baza rozwiązanych
// przypadków problemów produkcyjno-technologicznych oraz miejsce do
// analizy bieżącego problemu.

function today() {
  return new Date().toISOString().slice(0, 10);
}

export const DIAGNOSTYKA_ENTITIES = {
  diagnostykaBaza: {
    label: 'Baza',
    labelSingular: 'przypadek (baza)',
    titleField: 'tytul',
    fields: [
      { key: 'tytul', label: 'Tytuł problemu', type: 'text', required: true },
      { key: 'opisProblemu', label: 'Opis problemu', type: 'textarea' },
      { key: 'rozwiazanie', label: 'Rozwiązanie', type: 'textarea' },
      { key: 'tagi', label: 'Tagi (np. kombajn, hydraulika, zasilanie)', type: 'text' },
      { key: 'data', label: 'Data', type: 'date', default: today },
    ],
  },
  diagnostykaAnaliza: {
    label: 'Analiza',
    labelSingular: 'analiza bieżącego problemu',
    titleField: 'tytul',
    fields: [
      { key: 'tytul', label: 'Tytuł problemu', type: 'text', required: true },
      { key: 'opisProblemu', label: 'Opis problemu', type: 'textarea' },
      { key: 'analiza', label: 'Analiza / hipotezy / kroki sprawdzone', type: 'textarea' },
      { key: 'status', label: 'Status', type: 'select', options: ['W trakcie', 'Rozwiązany', 'Wymaga eskalacji'] },
      { key: 'data', label: 'Data', type: 'date', default: today },
    ],
  },
};

export const DIAGNOSTYKA_EXAMPLES = {
  diagnostykaBaza: {
    tytul: 'PRZYKŁAD — opisany przypadek',
    opisProblemu: 'Opis problemu — do uzupełnienia',
    rozwiazanie: 'Opis rozwiązania — do uzupełnienia',
    tagi: 'przykład',
    data: today(),
  },
  diagnostykaAnaliza: {
    tytul: 'PRZYKŁAD — analiza w toku',
    opisProblemu: 'Opis problemu — do uzupełnienia',
    analiza: 'Notatki z analizy — do uzupełnienia',
    status: 'W trakcie',
    data: today(),
  },
};
