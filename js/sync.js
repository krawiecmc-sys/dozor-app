import { exportAllData, importAllData } from './db.js';

const labelInput = document.getElementById('sync-export-label');
const exportBtn = document.getElementById('sync-export-btn');
const importInput = document.getElementById('sync-import-input');
const statusEl = document.getElementById('sync-import-status');

function countRecords(data) {
  let total = 0;
  const perStore = [];
  if (data.nadzor) {
    for (const [storeName, records] of Object.entries(data.nadzor)) {
      if (Array.isArray(records) && records.length > 0) {
        perStore.push(`${storeName}: ${records.length}`);
        total += records.length;
      }
    }
  }
  const wiedzaCount = Array.isArray(data.wiedza) ? data.wiedza.length : 0;
  return { total, wiedzaCount, perStore };
}

export function initSync({ onImported } = {}) {
  exportBtn.addEventListener('click', async () => {
    const label = labelInput.value.trim();
    const data = await exportAllData(label);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().slice(0, 10);
    const safeLabelPart = label ? `-${label.replace(/[^a-z0-9ąćęłńóśźż]+/gi, '-')}` : '';
    const a = document.createElement('a');
    a.href = url;
    a.download = `protektor-eksport-${dateStr}${safeLabelPart}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.meta || data.meta.app !== 'PROTEKTOR') {
        alert('To nie wygląda na plik eksportu PROTEKTOR — przerwano import.');
        importInput.value = '';
        return;
      }

      const { total, wiedzaCount, perStore } = countRecords(data);
      const label = data.meta.label || '(bez etykiety)';
      const date = data.meta.exportedAt ? new Date(data.meta.exportedAt).toLocaleString('pl-PL') : 'nieznana data';

      const confirmMsg =
        `Importujesz dane z: ${label}\n` +
        `Wyeksportowane: ${date}\n\n` +
        `Nadzór rejonu / Przegląd / Diagnostyka: ${total} rekordów (dodane jako nowe)\n` +
        (perStore.length ? perStore.map((s) => `  - ${s}`).join('\n') + '\n' : '') +
        `Baza wiedzy: ${wiedzaCount} rekordów w pliku (dodane zostaną tylko te, których jeszcze nie masz)\n\n` +
        `Kontynuować import?`;

      if (!confirm(confirmMsg)) {
        importInput.value = '';
        return;
      }

      const summary = await importAllData(data);
      statusEl.textContent =
        `Zaimportowano: ${summary.dodaneNadzor} rekordów Nadzoru/Przeglądu/Diagnostyki, ` +
        `${summary.dodaneWiedza} nowych rekordów Bazy wiedzy ` +
        `(pominięto ${summary.pominieteWiedza} już istniejących).`;

      if (onImported) await onImported();
    } catch (err) {
      console.error('Import nie powiódł się:', err);
      alert('Nie udało się wczytać pliku — sprawdź czy to poprawny eksport PROTEKTOR.');
    } finally {
      importInput.value = '';
    }
  });
}
