// Generyczny moduł list+formularz (dodaj/edytuj/usuń) nad dowolnym zestawem
// magazynów IndexedDB opisanych przez "entities". Używany przez Rejon,
// Przegląd i Diagnostykę — żeby nie duplikować tej samej logiki
// listy/formularza za każdym razem.
//
// Pola formularza wspierają typy: text, number, select, date, datetime-local,
// textarea, "sublist" — edytowalna, powtarzalna lista zagnieżdżonych
// rekordów (np. lista zabezpieczeń z datą legalizacji) przechowywana jako
// tablica bezpośrednio w rekordzie nadrzędnym (bez osobnego magazynu —
// wystarczające dla prototypu, prościej niż relacje 1:N w IndexedDB), oraz
// (31.08.2026, prawdziwe klucze obce zamiast dopasowania tekstu):
//   - "fk-or-free": select z rekordami magazynu `f.refStore` (wartość =
//     numeryczne id) + opcja "inny (wpisz ręcznie)" (wartość = string).
//   - "fk-multi": lista checkboxów z rekordami `f.refStore`, wartość =
//     tablica numerycznych id (relacja N:M).

import { nadzorGetAll, nadzorAdd, nadzorUpdate, nadzorDelete, nadzorSeedExampleIfNeeded } from './db.js';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function isExpired(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() > ONE_YEAR_MS;
}

// 05.11.2026: tabs (opcjonalne) — zakładki jako widoki magazynów: { key, label, entity, filtr(rec), stale (wartości nowego
// rekordu), labelSingular }; np. Wyłączniki i Odbiorniki końcowe to dwa widoki magazynu „urzadzenia” (bez kopiowania danych).
export function createCrudModule({ entities, examples = {}, tabsId, listId, formId, addBtnId, tabs = null }) {
  const tabsEl = document.getElementById(tabsId);
  const listEl = document.getElementById(listId);
  const formContainerEl = document.getElementById(formId);
  const addBtn = document.getElementById(addBtnId);

  const entityKeys = Object.keys(entities);
  const zakladki = (tabs || entityKeys.map((key) => ({ key, entity: key }))).map((t) => ({ label: entities[t.entity].label, ...t }));
  let currentTab = zakladki[0].key;
  let currentEntity = zakladki[0].entity;
  const tab = () => zakladki.find((t) => t.key === currentTab) || zakladki[0];
  const aktDef = () => ({ ...entities[currentEntity], ...(tab().labelSingular ? { labelSingular: tab().labelSingular } : {}) });
  let editingId = null;
  let sublistState = {}; // key -> array of row objects, żywe w trakcie edycji formularza

  function renderTabs() {
    if (zakladki.length <= 1) {
      tabsEl.classList.add('hidden');
      return;
    }

    tabsEl.innerHTML = zakladki
      .map(
        (t) => `
        <button class="chip ${t.key === currentTab ? 'active' : ''}" data-entity="${t.key}">
          ${escapeHtml(t.label)}
        </button>
      `
      )
      .join('');

    tabsEl.querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', async () => {
        currentTab = btn.dataset.entity;
        currentEntity = tab().entity;
        editingId = null;
        formContainerEl.classList.add('hidden');
        renderTabs();
        await renderList();
      });
    });
  }

  function renderSublistSummary(f, rows) {
    if (!Array.isArray(rows) || rows.length === 0) return '';
    const dateSubField = f.subFields.find((sf) => sf.type === 'date');

    const items = rows
      .map((row) => {
        const label = f.subFields.map((sf) => row[sf.key]).filter(Boolean).join(' — ');
        const expired = dateSubField && isExpired(row[dateSubField.key]);
        return `<div class="sublist-item ${expired ? 'expired' : ''}">${escapeHtml(label)}${expired ? ' ⚠ legalizacja &gt; 1 rok' : ''}</div>`;
      })
      .join('');

    return `<div class="nadzor-field"><span class="nadzor-field-label">${escapeHtml(f.label)}:</span>${items}</div>`;
  }

  async function fetchRefCache(def) {
    const refCache = {};
    for (const f of def.fields) {
      if ((f.type === 'fk-or-free' || f.type === 'fk-multi') && !refCache[f.refStore]) {
        const refRecords = await nadzorGetAll(f.refStore);
        refCache[f.refStore] = new Map(refRecords.map((r) => [r.id, r]));
      }
    }
    return refCache;
  }

  function renderFkOrFreeSummary(f, value, refCache) {
    let display = '';
    if (typeof value === 'number') {
      const rec = refCache[f.refStore]?.get(value);
      display = rec ? rec[f.refField] : `⚠ brak rekordu #${value} w ${f.refStore}`;
    } else if (typeof value === 'string' && value) {
      display = value;
    }
    if (!display) return '';
    return `<div class="nadzor-field"><span class="nadzor-field-label">${escapeHtml(f.label)}:</span> ${escapeHtml(display)}</div>`;
  }

  function renderFkMultiSummary(f, valueArray, refCache) {
    const ids = Array.isArray(valueArray) ? valueArray : [];
    if (ids.length === 0) return '';
    const labels = ids
      .map((id) => {
        const rec = refCache[f.refStore]?.get(id);
        if (!rec) return `⚠ brak #${id}`;
        return f.refLabelFields.map((k) => rec[k]).filter((v) => v !== undefined && v !== '' && v !== null).join(' ');
      })
      .join(', ');
    return `<div class="nadzor-field"><span class="nadzor-field-label">${escapeHtml(f.label)}:</span> ${escapeHtml(labels)}</div>`;
  }

  async function renderList() {
    const def = aktDef();
    const filtr = tab().filtr;
    const records = (await nadzorGetAll(currentEntity)).filter((r) => !filtr || filtr(r));
    const refCache = await fetchRefCache(def);

    if (records.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Brak rekordów. Dodaj pierwszy.</p>';
      return;
    }

    listEl.innerHTML = `<ul class="record-list">${records
      .map((r) => {
        const otherFields = def.fields
          .filter((f) => f.key !== def.titleField && f.type !== 'heading')
          .map((f) => {
            if (f.type === 'sublist') return renderSublistSummary(f, r[f.key]);
            if (f.type === 'fk-or-free') return renderFkOrFreeSummary(f, r[f.key], refCache);
            if (f.type === 'fk-multi') return renderFkMultiSummary(f, r[f.key], refCache);
            if (!r[f.key]) return '';
            return `<div class="nadzor-field"><span class="nadzor-field-label">${escapeHtml(f.label)}:</span> ${escapeHtml(r[f.key])}</div>`;
          })
          .join('');

        return `
          <li class="record-card nadzor-card">
            <h3>${escapeHtml(r[def.titleField] || '(bez nazwy)')}</h3>
            ${otherFields}
            <div class="nadzor-actions">
              <button class="btn-small" data-action="edit" data-id="${r.id}">Edytuj</button>
              <button class="btn-small btn-danger" data-action="delete" data-id="${r.id}">Usuń</button>
            </div>
          </li>
        `;
      })
      .join('')}</ul>`;

    listEl.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => openForm(Number(btn.dataset.id)));
    });
    listEl.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Usunąć ten rekord?')) return;
        await nadzorDelete(currentEntity, Number(btn.dataset.id));
        await renderList();
      });
    });
  }

  async function fetchSuggestions(suggestFrom) {
    const records = await nadzorGetAll(suggestFrom.store);
    const values = records.map((r) => r[suggestFrom.field]).filter(Boolean);
    return [...new Set(values)];
  }

  function renderInput(f, value, attrsOverride) {
    const nameAttr = attrsOverride?.omitName ? '' : `name="${f.key}"`;
    const extraAttr = attrsOverride?.extra || '';

    if (f.type === 'select') {
      // 03.11.2026: wartość spoza listy (np. z importu Excela) nie może
      // zniknąć przy edycji — dokładana jako dodatkowa opcja.
      const opcje = value && !f.options.includes(value) ? [...f.options, value] : f.options;
      const options = opcje
        .map((opt) => `<option value="${escapeHtml(opt)}" ${opt === value ? 'selected' : ''}>${escapeHtml(opt)}</option>`)
        .join('');
      return `
        <select ${nameAttr} ${extraAttr}>
          <option value="">— wybierz —</option>
          ${options}
        </select>
      `;
    }
    if (f.type === 'textarea') {
      return `<textarea ${nameAttr} ${extraAttr} rows="4">${escapeHtml(value)}</textarea>`;
    }
    const inputType = ['number', 'date', 'datetime-local'].includes(f.type) ? f.type : 'text';
    const listAttr = attrsOverride?.datalistId ? `list="${attrsOverride.datalistId}"` : '';
    return `<input type="${inputType}" ${nameAttr} ${extraAttr} ${listAttr} value="${escapeHtml(value)}" autocomplete="off">`;
  }

  function renderFkOrFreeEditor(f, value, refRecords) {
    const isFree = typeof value === 'string' && value !== '';
    const options = refRecords
      .map((r) => `<option value="${r.id}" ${typeof value === 'number' && value === r.id ? 'selected' : ''}>${escapeHtml(r[f.refField])}</option>`)
      .join('');
    const hint = f.hint ? `<p class="field-hint">${escapeHtml(f.hint)}</p>` : '';
    return `
      <div class="form-field fk-or-free-field" data-fk-or-free="${f.key}">
        <label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
        <select data-fk-select="${f.key}">
          <option value="">— wybierz —</option>
          ${options}
          <option value="__free__" ${isFree ? 'selected' : ''}>→ inny (wpisz ręcznie)</option>
        </select>
        <input type="text" data-fk-free="${f.key}" class="${isFree ? '' : 'hidden'}" value="${isFree ? escapeHtml(value) : ''}" placeholder="Wpisz nazwę ręcznie" autocomplete="off">
        ${hint}
      </div>
    `;
  }

  function attachFkOrFreeHandlers(f) {
    const select = formContainerEl.querySelector(`[data-fk-select="${f.key}"]`);
    const freeInput = formContainerEl.querySelector(`[data-fk-free="${f.key}"]`);
    select.addEventListener('change', () => {
      if (select.value === '__free__') {
        freeInput.classList.remove('hidden');
        freeInput.focus();
      } else {
        freeInput.classList.add('hidden');
      }
    });
  }

  function readFkOrFreeValue(f) {
    const select = formContainerEl.querySelector(`[data-fk-select="${f.key}"]`);
    const freeInput = formContainerEl.querySelector(`[data-fk-free="${f.key}"]`);
    if (select.value === '__free__') return freeInput.value.trim();
    if (select.value === '') return '';
    return Number(select.value);
  }

  function renderFkMultiEditor(f, valueArray, refRecords) {
    const checked = new Set(Array.isArray(valueArray) ? valueArray : []);
    const rows = refRecords
      .map((r) => {
        const label = f.refLabelFields.map((k) => r[k]).filter((v) => v !== undefined && v !== '' && v !== null).join(' — ');
        return `<label class="fk-multi-row"><input type="checkbox" data-fk-multi="${f.key}" value="${r.id}" ${checked.has(r.id) ? 'checked' : ''}> ${escapeHtml(label || '(bez nazwy)')}</label>`;
      })
      .join('');
    return `
      <div class="form-field fk-multi-field">
        <span>${escapeHtml(f.label)}</span>
        <div class="fk-multi-list">${rows || '<p class="empty-state-small">Brak rekordów do wyboru — dodaj je najpierw w odpowiedniej zakładce.</p>'}</div>
      </div>
    `;
  }

  function readFkMultiValue(f) {
    const boxes = formContainerEl.querySelectorAll(`[data-fk-multi="${f.key}"]:checked`);
    return Array.from(boxes).map((b) => Number(b.value));
  }

  function renderSublistEditor(f) {
    const rows = sublistState[f.key] || [];
    const rowsHtml = rows
      .map(
        (row, i) => `
        <div class="sublist-row" data-sublist="${f.key}" data-index="${i}">
          ${f.subFields
            .map(
              (sf) => `
              <label class="form-field form-field-inline">
                ${escapeHtml(sf.label)}
                ${renderInput(sf, row[sf.key] ?? '', { omitName: true, extra: `data-sublist-field="${sf.key}"` })}
              </label>
            `
            )
            .join('')}
          <button type="button" class="btn-small btn-danger sublist-remove" data-sublist="${f.key}" data-index="${i}">Usuń wiersz</button>
        </div>
      `
      )
      .join('');

    return `
      <div class="form-field sublist-field">
        ${escapeHtml(f.label)}
        <div class="sublist-container" data-sublist-container="${f.key}">${rowsHtml || '<p class="empty-state-small">Brak wpisów.</p>'}</div>
        <button type="button" class="btn-small sublist-add" data-sublist="${f.key}">+ Dodaj wiersz</button>
      </div>
    `;
  }

  function syncSublistFromDOM(key, subFields) {
    const rows = [];
    formContainerEl.querySelectorAll(`.sublist-row[data-sublist="${key}"]`).forEach((rowEl) => {
      const row = {};
      subFields.forEach((sf) => {
        const input = rowEl.querySelector(`[data-sublist-field="${sf.key}"]`);
        row[sf.key] = input ? input.value : '';
      });
      rows.push(row);
    });
    sublistState[key] = rows;
  }

  function rerenderSublist(f) {
    const container = formContainerEl.querySelector(`[data-sublist-container="${f.key}"]`);
    const wrapper = container.closest('.sublist-field');
    wrapper.outerHTML = renderSublistEditor(f);
    attachSublistHandlers(f);
  }

  function attachSublistHandlers(f) {
    const addBtnEl = formContainerEl.querySelector(`.sublist-add[data-sublist="${f.key}"]`);
    if (addBtnEl) {
      addBtnEl.addEventListener('click', () => {
        syncSublistFromDOM(f.key, f.subFields);
        sublistState[f.key] = [...(sublistState[f.key] || []), {}];
        rerenderSublist(f);
      });
    }
    formContainerEl.querySelectorAll(`.sublist-remove[data-sublist="${f.key}"]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        syncSublistFromDOM(f.key, f.subFields);
        const idx = Number(btn.dataset.index);
        sublistState[f.key] = sublistState[f.key].filter((_, i) => i !== idx);
        rerenderSublist(f);
      });
    });
  }

  async function openForm(id, preset = {}) {
    editingId = id ?? null;
    const def = aktDef();

    let record = { ...(tab().stale || {}), ...(id ? {} : preset) };
    if (editingId) {
      const all = await nadzorGetAll(currentEntity);
      record = all.find((r) => r.id === editingId) || {};
    }

    sublistState = {};
    for (const f of def.fields) {
      if (f.type === 'sublist') {
        sublistState[f.key] = record[f.key] || [];
      }
    }

    // Podpowiedzi (datalist) dla pól-referencji (np. "Zasilany z" podpowiada
    // istniejące nazwy pól rozdzielczych) — zmniejsza literówki, które
    // powodują "Niepowiązane" rekordy w dashboardzie.
    const suggestionLists = {};
    for (const f of def.fields) {
      if (f.suggestFrom) {
        suggestionLists[f.key] = await fetchSuggestions(f.suggestFrom);
      }
    }

    const datalistsHtml = Object.entries(suggestionLists)
      .map(
        ([key, values]) => `
        <datalist id="datalist-${key}">
          ${values.map((v) => `<option value="${escapeHtml(v)}">`).join('')}
        </datalist>
      `
      )
      .join('');

    // Rekordy referencyjne dla fk-or-free / fk-multi (potrzebne do zbudowania
    // opcji select/checkbox) — pobrane raz na pole, ten sam wzorzec co
    // suggestionLists wyżej.
    const refRecordsByField = {};
    for (const f of def.fields) {
      if (f.type === 'fk-or-free' || f.type === 'fk-multi') {
        refRecordsByField[f.key] = await nadzorGetAll(f.refStore);
      }
    }

    const fieldsHtml = def.fields
      .map((f) => {
        if (f.type === 'heading') return `<h4 class="form-heading">${escapeHtml(f.label)}</h4>`;
        if (f.type === 'sublist') return renderSublistEditor(f);
        if (f.type === 'fk-or-free') return renderFkOrFreeEditor(f, record[f.key], refRecordsByField[f.key]);
        if (f.type === 'fk-multi') return renderFkMultiEditor(f, record[f.key], refRecordsByField[f.key]);

        const value = record[f.key] ?? (!editingId && f.default ? f.default() : '');
        const hint = f.hint ? `<p class="field-hint">${escapeHtml(f.hint)}</p>` : '';
        const inputAttrs = f.suggestFrom ? { datalistId: `datalist-${f.key}` } : undefined;
        return `
          <label class="form-field">
            ${escapeHtml(f.label)}${f.required ? ' *' : ''}
            ${renderInput(f, value, inputAttrs)}
            ${hint}
          </label>
        `;
      })
      .join('');

    formContainerEl.innerHTML = `
      <form class="crud-form">
        <h3>${editingId ? 'Edytuj' : 'Dodaj'}: ${escapeHtml(def.labelSingular)}</h3>
        ${fieldsHtml}
        ${datalistsHtml}
        <div class="form-actions">
          <button type="submit" class="btn-primary">Zapisz</button>
          <button type="button" class="btn-small crud-cancel">Anuluj</button>
        </div>
      </form>
    `;
    formContainerEl.classList.remove('hidden');
    listEl.classList.add('hidden');

    for (const f of def.fields) {
      if (f.type === 'sublist') attachSublistHandlers(f);
      if (f.type === 'fk-or-free') attachFkOrFreeHandlers(f);
    }

    formContainerEl.querySelector('.crud-cancel').addEventListener('click', closeForm);

    formContainerEl.querySelector('.crud-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      for (const f of def.fields) {
        if (f.type === 'sublist') syncSublistFromDOM(f.key, f.subFields);
      }

      const formData = new FormData(event.target);
      const newRecord = {};
      for (const f of def.fields) {
        if (f.type === 'heading') continue;
        if (f.type === 'sublist') {
          newRecord[f.key] = (sublistState[f.key] || []).filter((row) =>
            f.subFields.some((sf) => row[sf.key])
          );
          continue;
        }
        if (f.type === 'fk-or-free') {
          newRecord[f.key] = readFkOrFreeValue(f);
          continue;
        }
        if (f.type === 'fk-multi') {
          newRecord[f.key] = readFkMultiValue(f);
          continue;
        }
        const raw = formData.get(f.key);
        if (f.type === 'number') {
          // f.blank: puste pole zostaje puste (np. metraż nieznany ≠ metraż 0).
          const txt = String(raw ?? '').trim().replace(',', '.');
          const n = Number(txt);
          newRecord[f.key] = txt === '' ? (f.blank ? '' : 0) : Number.isFinite(n) ? n : f.blank ? '' : 0;
          continue;
        }
        newRecord[f.key] = raw?.trim() ?? '';
      }

      const missingRequired = def.fields.some((f) => f.required && f.type !== 'sublist' && f.type !== 'heading' && !newRecord[f.key]);
      if (missingRequired) {
        alert('Uzupełnij wymagane pola (oznaczone *).');
        return;
      }

      if (editingId) {
        // 03.11.2026: { ...record } — zachowaj pola spoza formularza
        // (przesunięcie na Planie rejonu, znacznik przykładu, data importu).
        await nadzorUpdate(currentEntity, { ...record, ...newRecord, id: editingId });
      } else {
        await nadzorAdd(currentEntity, newRecord);
      }

      closeForm();
      await renderList();
    });
  }

  function closeForm() {
    editingId = null;
    sublistState = {};
    formContainerEl.classList.add('hidden');
    formContainerEl.innerHTML = '';
    listEl.classList.remove('hidden');
  }

  addBtn.addEventListener('click', () => openForm(null));

  async function init() {
    for (const key of entityKeys) {
      if (examples[key]) {
        await nadzorSeedExampleIfNeeded(key, examples[key]);
      }
    }
    renderTabs();
    await renderList();
  }

  // Wymusza ponowne pobranie z IndexedDB i re-render — wołane przy każdym
  // wejściu na tę zakładkę (patrz app.js), żeby nigdy nie pokazywać
  // czegoś, co zostało wyrenderowane wcześniej i mogło się zdezaktualizować.
  async function refresh() {
    formContainerEl.classList.add('hidden');
    formContainerEl.innerHTML = '';
    editingId = null;
    await renderList();
  }

  // Otwiera formularz edycji konkretnego rekordu z zewnątrz modułu — np.
  // z kliknięcia w węzeł dashboardu (patrz dashboard.js/app.js).
  async function editRecord(entityKey, id) {
    const rec = (await nadzorGetAll(entityKey)).find((r) => r.id === id);
    const t = zakladki.find((x) => x.entity === entityKey && (!x.filtr || !rec || x.filtr(rec))) || zakladki.find((x) => x.entity === entityKey);
    if (t) currentTab = t.key;
    currentEntity = entityKey;
    renderTabs();
    await openForm(id);
  }

  // 06.11.2026: nowy rekord z zewnątrz (kafelek Układu zasilania „+ dodaj”) — zakładka + wpisane źródło zasilania
  async function nowyRekord(tabKey, preset = {}) {
    const t = zakladki.find((x) => x.key === tabKey) || zakladki.find((x) => x.entity === tabKey);
    if (!t) return;
    currentTab = t.key;
    currentEntity = t.entity;
    renderTabs();
    await renderList();
    await openForm(null, preset);
  }

  return { init, refresh, editRecord, nowyRekord };
}
