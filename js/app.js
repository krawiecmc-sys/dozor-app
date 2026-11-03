import { getAllRecords, reseedIfNeeded, filterRecords, wiedzaAddNew, wiedzaUpdate, wiedzaDelete } from './db.js';
import { seedData, SEED_VERSION } from '../data/seed-data.js';
import { initNadzor, refreshNadzor, editNadzorRecord } from './nadzor.js';
import { initOugWug, refreshOugWug } from './oug-wug.js';
import { initDiagnostyka, refreshDiagnostyka } from './diagnostyka.js';
import { initSync, runIntegrityCheck } from './sync.js';
import { checkExportReminder } from './export-reminder.js';
import { renderDashboard } from './dashboard.js';
import { createGraphView } from './graph-view.js';
import { createPlanView } from './plan-view.js';
import { createImportExcel } from './import-excel.js';
// Kreator łańcucha (chain-builder.js) usunięty 31.08.2026 (Faza 2 reorganizacji)
// — odwoływał się do starego schematu, zastąpiony formularzami z realnymi
// kluczami (Faza 1) i widokiem graficznym poniżej (Faza 4).

const graphView = createGraphView('graf-content');
const planView = createPlanView('plan-content');

// Kategorie "Wszystko"/"Normy techniczne"/"Schematy uniwersalne" usunięte
// z nawigacji 31.08.2026 (na wyraźną prośbę — mniej odnośników do
// dokumentacji). Istniejące rekordy tych dwóch kategorii przeniesione do
// "dokumentacja" w data/seed-data.js, treść zachowana. "all" NIE jest już
// domyślnym stanem filtra (patrz `state` niżej) — pierwsza realna kategoria
// przejęła tę rolę, żeby stan JS zgadzał się z wizualnie aktywnym chipem.
const CATEGORY_LABELS = {
  przepisy: 'Przepisy prawne',
  wzory: 'Wzory dokumentów',
  dokumentacja: 'Dokumentacja techniczna',
  urzadzenia: 'Urządzenia',
};

const listEl = document.getElementById('record-list');
const detailEl = document.getElementById('record-detail');
const searchEl = document.getElementById('search');
const filterEl = document.getElementById('category-filter');
const offlineIndicator = document.getElementById('offline-indicator');
const exportReminderEl = document.getElementById('export-reminder');
const exportReminderBtn = document.getElementById('export-reminder-btn');
const exportReminderDismissBtn = document.getElementById('export-reminder-dismiss');
const wiedzaAddBtn = document.getElementById('wiedza-add-btn');
const wiedzaFormEl = document.getElementById('wiedza-form-container');

let allRecords = [];
let state = { category: 'przepisy', query: '' };

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function refreshRecords() {
  allRecords = await getAllRecords();
}

function renderList() {
  const filtered = filterRecords(allRecords, state);

  detailEl.classList.add('hidden');
  wiedzaFormEl.classList.add('hidden');
  listEl.classList.remove('hidden');

  if (filtered.length === 0) {
    listEl.innerHTML = '<li class="empty-state">Brak wyników. Zmień filtr lub zapytanie.</li>';
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (r) => `
      <li class="record-card" data-id="${r.id}">
        <h3>${escapeHtml(r.title)}</h3>
        <div class="meta">${CATEGORY_LABELS[r.category] || r.category} · aktualizacja: ${r.updatedAt}</div>
        <div class="tags">${(r.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
      </li>
    `
    )
    .join('');

  listEl.querySelectorAll('.record-card').forEach((card) => {
    card.addEventListener('click', () => showDetail(card.dataset.id));
  });
}

function showDetail(id) {
  const record = allRecords.find((r) => r.id === id);
  if (!record) return;

  listEl.classList.add('hidden');
  wiedzaFormEl.classList.add('hidden');
  detailEl.classList.remove('hidden');

  const filePickerHtml =
    record.category === 'dokumentacja'
      ? `
      <div class="doc-picker">
        <label class="btn-small">
          Wskaż i otwórz plik
          <input type="file" id="doc-file-input" class="hidden-file-input">
        </label>
        <span id="doc-file-name" class="field-hint"></span>
      </div>
    `
      : '';

  detailEl.innerHTML = `
    <button class="back-button">&larr; Wróć do listy</button>
    <h2>${escapeHtml(record.title)}</h2>
    <div class="meta">${CATEGORY_LABELS[record.category] || record.category} · aktualizacja: ${record.updatedAt}</div>
    <p class="source">Źródło: ${escapeHtml(record.source || 'brak')}</p>
    ${record.attachment ? `<p class="source">Załącznik/podpowiedź: ${escapeHtml(record.attachment)}</p>` : ''}
    <div class="body">${escapeHtml(record.body)}</div>
    ${filePickerHtml}
    <div class="nadzor-actions">
      <button class="btn-small" id="wiedza-edit-btn">Edytuj</button>
      <button class="btn-small btn-danger" id="wiedza-delete-btn">Usuń</button>
    </div>
  `;

  detailEl.querySelector('.back-button').addEventListener('click', renderList);
  detailEl.querySelector('#wiedza-edit-btn').addEventListener('click', () => openWiedzaForm(record));
  detailEl.querySelector('#wiedza-delete-btn').addEventListener('click', async () => {
    if (!confirm('Usunąć ten rekord z bazy wiedzy?')) return;
    await wiedzaDelete(record.id);
    await refreshRecords();
    renderList();
  });

  const fileInput = detailEl.querySelector('#doc-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const nameEl = detailEl.querySelector('#doc-file-name');
      nameEl.textContent = `Wybrano: ${file.name}`;
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
    });
  }
}

function openWiedzaForm(record) {
  const isEdit = !!record;
  const r = record || { category: state.category !== 'all' ? state.category : 'przepisy', tags: [] };

  listEl.classList.add('hidden');
  detailEl.classList.add('hidden');
  wiedzaFormEl.classList.remove('hidden');

  const categoryOptions = Object.entries(CATEGORY_LABELS)
    .map(([key, label]) => `<option value="${key}" ${key === r.category ? 'selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');

  wiedzaFormEl.innerHTML = `
    <form id="wiedza-form">
      <h3>${isEdit ? 'Edytuj' : 'Dodaj'} rekord bazy wiedzy</h3>
      <label class="form-field">
        Tytuł *
        <input type="text" name="title" value="${escapeHtml(r.title || '')}">
      </label>
      <label class="form-field">
        Kategoria
        <select name="category">${categoryOptions}</select>
      </label>
      <label class="form-field">
        Tagi (oddzielone przecinkami)
        <input type="text" name="tags" value="${escapeHtml((r.tags || []).join(', '))}">
      </label>
      <label class="form-field">
        Źródło
        <input type="text" name="source" value="${escapeHtml(r.source || '')}">
      </label>
      <label class="form-field">
        Załącznik / podpowiedź (np. nazwa i lokalizacja pliku)
        <input type="text" name="attachment" value="${escapeHtml(r.attachment || '')}">
      </label>
      <label class="form-field">
        Treść
        <textarea name="body" rows="6">${escapeHtml(r.body || '')}</textarea>
      </label>
      <div class="form-actions">
        <button type="submit" class="btn-primary">Zapisz</button>
        <button type="button" class="btn-small" id="wiedza-cancel-btn">Anuluj</button>
      </div>
    </form>
  `;

  wiedzaFormEl.querySelector('#wiedza-cancel-btn').addEventListener('click', () => {
    if (isEdit) showDetail(record.id);
    else renderList();
  });

  wiedzaFormEl.querySelector('#wiedza-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const title = formData.get('title')?.trim();
    if (!title) {
      alert('Tytuł jest wymagany.');
      return;
    }

    const newRecord = {
      ...(isEdit ? record : {}),
      title,
      category: formData.get('category'),
      tags: formData.get('tags')?.split(',').map((t) => t.trim()).filter(Boolean) ?? [],
      source: formData.get('source')?.trim() ?? '',
      attachment: formData.get('attachment')?.trim() || null,
      body: formData.get('body')?.trim() ?? '',
    };

    if (isEdit) {
      await wiedzaUpdate(newRecord);
    } else {
      await wiedzaAddNew(newRecord);
    }

    await refreshRecords();
    renderList();
  });
}

wiedzaAddBtn.addEventListener('click', () => openWiedzaForm(null));

filterEl.addEventListener('click', (event) => {
  const btn = event.target.closest('.chip');
  if (!btn) return;
  filterEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  state.category = btn.dataset.category;
  renderList();
});

searchEl.addEventListener('input', (event) => {
  state.query = event.target.value;
  renderList();
});

window.addEventListener('online', updateOfflineIndicator);
window.addEventListener('offline', updateOfflineIndicator);

function updateOfflineIndicator() {
  offlineIndicator.classList.toggle('hidden', navigator.onLine);
}

const sectionSwitchEl = document.getElementById('section-switch');
const sectionEls = {
  dashboard: document.getElementById('section-dashboard'),
  wiedza: document.getElementById('section-wiedza'),
  sync: document.getElementById('section-sync'),
};

// Aktualny pod-widok Dashboardu — potrzebny, żeby wiedzieć, co odświeżyć,
// gdy user wraca na zakładkę "Dashboard" z innej sekcji. Mapa rejonu (dawny
// "Nadzór rejonu" / dashboard-container) jest domyślnym widokiem startowym
// (patrz index.html). Diagnostyka i Przegląd OUG/WUG złączone tu 31.08.2026
// (Faza 2 reorganizacji) — wcześniej Diagnostyka była osobną sekcją top-level.
let nadzorActiveSub = 'dashboard';

async function refreshActiveNadzorSub() {
  if (nadzorActiveSub === 'ougwug') {
    await refreshOugWug();
  } else if (nadzorActiveSub === 'dashboard') {
    await renderDashboard('dashboard-container', {
      onEditRecord: async (entityKey, id) => {
        switchNadzorSub('crud');
        await editNadzorRecord(entityKey, id);
      },
      onShowOnPlan: (entityKey, id) => pokazNaPlanie(entityKey, id),
    });
  } else if (nadzorActiveSub === 'graf') {
    await graphView.init({
      onEditRecord: async (entityKey, id) => {
        switchNadzorSub('crud');
        await editNadzorRecord(entityKey, id);
      },
    });
  } else if (nadzorActiveSub === 'plan') {
    await planView.init(opcjePlanu());
  } else if (nadzorActiveSub === 'diagnostyka') {
    await refreshDiagnostyka();
  } else {
    await refreshNadzor();
  }
}

sectionSwitchEl.addEventListener('click', async (event) => {
  const btn = event.target.closest('.section-btn');
  if (!btn) return;

  sectionSwitchEl.querySelectorAll('.section-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');

  const active = btn.dataset.section;
  for (const [name, el] of Object.entries(sectionEls)) {
    el.classList.toggle('hidden', name !== active);
  }
  searchEl.classList.toggle('hidden', active !== 'wiedza');

  // Wymuś ponowne pobranie danych z IndexedDB przy każdym wejściu na
  // zakładkę — zamiast ufać, że to, co zostało wyrenderowane wcześniej,
  // jest wciąż aktualne.
  if (active === 'dashboard') {
    await refreshActiveNadzorSub();
  } else if (active === 'wiedza') {
    await refreshRecords();
    renderList();
  }
});

const nadzorSubSwitchEl = document.getElementById('nadzor-sub-switch');
const nadzorCrudAreaEl = document.getElementById('nadzor-crud-area');
const nadzorOugwugAreaEl = document.getElementById('nadzor-ougwug-area');
const nadzorDashboardAreaEl = document.getElementById('nadzor-dashboard-area');
const nadzorDiagnostykaAreaEl = document.getElementById('nadzor-diagnostyka-area');
const nadzorGrafAreaEl = document.getElementById('nadzor-graf-area');
const nadzorPlanAreaEl = document.getElementById('nadzor-plan-area');
const nadzorSubAreas = {
  crud: nadzorCrudAreaEl,
  ougwug: nadzorOugwugAreaEl,
  dashboard: nadzorDashboardAreaEl,
  diagnostyka: nadzorDiagnostykaAreaEl,
  graf: nadzorGrafAreaEl,
  plan: nadzorPlanAreaEl,
};

// Wspólna funkcja do przełączania pod-widoku Nadzoru rejonu — używana
// zarówno przez kliknięcie w pod-przełącznik, jak i przez kliknięcie węzła
// w dashboardzie (przełącza na "Sprzęt" i otwiera edycję tego rekordu).
// 03.11.2026: przejścia Mapa rejonu <-> Plan rejonu (te same dane, dwa widoki)
function opcjePlanu() {
  return {
    onEditRecord: async (entityKey, id) => {
      switchNadzorSub('crud');
      await editNadzorRecord(entityKey, id);
    },
    onShowInMap: (entityKey, id) => pokazWMapie(entityKey, id),
  };
}

async function pokazNaPlanie(entityKey, id) {
  switchNadzorSub('plan');
  await planView.init(opcjePlanu());
  await planView.pokaz(entityKey, id);
}

async function pokazWMapie(entityKey, id) {
  switchNadzorSub('dashboard');
  await refreshActiveNadzorSub();
  const el = document.querySelector(`#dashboard-container .dash-node-row[data-entity="${entityKey}"][data-id="${id}"]`);
  if (!el) return;
  document.querySelectorAll('.dash-wskaz').forEach((x) => x.classList.remove('dash-wskaz'));
  el.classList.add('dash-wskaz');
  el.scrollIntoView({ block: 'center' });
}

function switchNadzorSub(subName) {
  nadzorSubSwitchEl.querySelectorAll('.section-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.sub === subName);
  });

  nadzorActiveSub = subName;
  for (const [name, el] of Object.entries(nadzorSubAreas)) {
    el.classList.toggle('hidden', name !== nadzorActiveSub);
  }
}

nadzorSubSwitchEl.addEventListener('click', async (event) => {
  const btn = event.target.closest('.section-btn');
  if (!btn) return;

  switchNadzorSub(btn.dataset.sub);
  await refreshActiveNadzorSub();
});

async function init() {
  await reseedIfNeeded(seedData, SEED_VERSION);
  await refreshRecords();
  renderList();
  updateOfflineIndicator();
  await initNadzor();
  await initOugWug();
  await initDiagnostyka();
  await refreshActiveNadzorSub(); // domyślny widok startowy to Dashboard

  initSync({
    onImported: async () => {
      await refreshActiveNadzorSub();
      await refreshDiagnostyka();
      await refreshRecords();
      renderList();
    },
    onExported: async () => {
      exportReminderEl.classList.add('hidden');
    },
  });

  createImportExcel('import-excel-block', {
    onImported: async () => {
      await refreshNadzor();
    },
  });

  await checkExportReminder(exportReminderEl);
  await runIntegrityCheck(); // samonaprawa/kontrola integralności — patrz sync.js
  // Rejestracja Service Workera przeniesiona do index.html (poza modułami) —
  // patrz komentarz tam, żeby padnięcie tego pliku na błędzie importu nie
  // blokowało appce możliwości samo-naprawy przez aktualizację workera.
}

exportReminderBtn.addEventListener('click', () => {
  sectionSwitchEl.querySelector('[data-section="sync"]').click();
  exportReminderEl.classList.add('hidden');
});

exportReminderDismissBtn.addEventListener('click', () => {
  exportReminderEl.classList.add('hidden');
});

init();
