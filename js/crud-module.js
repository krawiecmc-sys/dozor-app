// Generyczny moduł list+formularz (dodaj/edytuj/usuń) nad dowolnym zestawem
// magazynów IndexedDB opisanych przez "entities". Używany przez Nadzór
// rejonu, Przegląd i Diagnostykę — żeby nie duplikować tej samej logiki
// listy/formularza za każdym razem.
//
// Pola formularza wspierają typy: text, number, select, date, datetime-local,
// textarea, oraz "sublist" — edytowalna, powtarzalna lista zagnieżdżonych
// rekordów (np. lista zabezpieczeń z datą legalizacji) przechowywana jako
// tablica bezpośrednio w rekordzie nadrzędnym (bez osobnego magazynu —
// wystarczające dla prototypu, prościej niż relacje 1:N w IndexedDB).

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

export function createCrudModule({ entities, examples = {}, tabsId, listId, formId, addBtnId }) {
  const tabsEl = document.getElementById(tabsId);
  const listEl = document.getElementById(listId);
  const formContainerEl = document.getElementById(formId);
  const addBtn = document.getElementById(addBtnId);

  const entityKeys = Object.keys(entities);
  let currentEntity = entityKeys[0];
  let editingId = null;
  let sublistState = {}; // key -> array of row objects, żywe w trakcie edycji formularza

  function renderTabs() {
    if (entityKeys.length <= 1) {
      tabsEl.classList.add('hidden');
      return;
    }

    tabsEl.innerHTML = entityKeys
      .map(
        (key) => `
        <button class="chip ${key === currentEntity ? 'active' : ''}" data-entity="${key}">
          ${escapeHtml(entities[key].label)}
        </button>
      `
      )
      .join('');

    tabsEl.querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', async () => {
        currentEntity = btn.dataset.entity;
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

  async function renderList() {
    const def = entities[currentEntity];
    const records = await nadzorGetAll(currentEntity);

    if (records.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Brak rekordów. Dodaj pierwszy.</p>';
      return;
    }

    listEl.innerHTML = `<ul class="record-list">${records
      .map((r) => {
        const otherFields = def.fields
          .filter((f) => f.key !== def.titleField)
          .map((f) => {
            if (f.type === 'sublist') return renderSublistSummary(f, r[f.key]);
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
      const options = f.options
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

  async function openForm(id) {
    editingId = id ?? null;
    const def = entities[currentEntity];

    let record = {};
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

    const fieldsHtml = def.fields
      .map((f) => {
        if (f.type === 'sublist') return renderSublistEditor(f);

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
        if (f.type === 'sublist') {
          newRecord[f.key] = (sublistState[f.key] || []).filter((row) =>
            f.subFields.some((sf) => row[sf.key])
          );
          continue;
        }
        const raw = formData.get(f.key);
        newRecord[f.key] = f.type === 'number' ? Number(raw) || 0 : raw?.trim() ?? '';
      }

      const missingRequired = def.fields.some((f) => f.required && f.type !== 'sublist' && !newRecord[f.key]);
      if (missingRequired) {
        alert('Uzupełnij wymagane pola (oznaczone *).');
        return;
      }

      if (editingId) {
        await nadzorUpdate(currentEntity, { ...newRecord, id: editingId });
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
    currentEntity = entityKey;
    renderTabs();
    await openForm(id);
  }

  return { init, refresh, editRecord };
}
