// Kreator łańcucha zasilania — budowanie "jak z klocków" w fizycznej
// kolejności przepływu zasilania: Chodnik (miejsce) → Pole rozdzielcze →
// Transformator → Urządzenie rejonowe → Przodek → Kombajn (opcjonalnie).
// Na każdym kroku user wybiera istniejący rekord (chip) albo tworzy nowy
// jedną nazwą — appka sama ustawia pola-referencje między krokami, więc
// łańcuch zbudowany tędy nigdy nie trafi do "Niepowiązane" w dashboardzie.
// Osobne zakładki (Sprzęt) zostają do późniejszych, szczegółowych poprawek
// pojedynczych rekordów — to nie jest ich zamiennik.

import { nadzorGetAll, nadzorAdd, nadzorUpdate } from './db.js';

const REJONY = ['zachód', 'wschód', 'centrum'];
const NR_KOMBAJNOW = ['AM-1', 'AM-2', 'AM-3', 'AM-4', 'AM-5', 'AM-6'];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

const STEPS = [
  {
    key: 'chodnik',
    store: 'chodnikiTrasy',
    titleField: 'nrChodnika',
    label: 'Chodnik (miejsce)',
    newFields: [
      { key: 'nrChodnika', label: 'Nr chodnika', type: 'text' },
      { key: 'rejon', label: 'Rejon', type: 'select', options: REJONY },
    ],
  },
  {
    key: 'poleRozdzielcze',
    store: 'poleRozdzielcze',
    titleField: 'nazwaPola',
    label: 'Pole rozdzielcze (zasilanie)',
    newFields: [{ key: 'nazwaPola', label: 'Nazwa pola rozdzielczego', type: 'text' }],
    prefillOnCreate: (ctx) => ({ lokalizacja: `wlot chodnika ${ctx.chodnik.nrChodnika}` }),
  },
  {
    key: 'transformator',
    store: 'transformatory',
    titleField: 'nr',
    label: 'Transformator',
    newFields: [{ key: 'nr', label: 'Nr transformatora', type: 'text' }],
    prefillOnCreate: (ctx) => ({ zasilanyZ: ctx.poleRozdzielcze.nazwaPola }),
    linkField: 'zasilanyZ',
    linkValue: (ctx) => ctx.poleRozdzielcze.nazwaPola,
    linkStore: 'transformatory',
  },
  {
    key: 'urzadzenie',
    store: 'urzadzeniaRejonowe',
    titleField: 'nazwa',
    label: 'Urządzenie rejonowe',
    newFields: [{ key: 'nazwa', label: 'Nazwa urządzenia', type: 'text' }],
    prefillOnCreate: (ctx) => ({ zasilanyZ: ctx.transformator.nr }),
    linkField: 'zasilanyZ',
    linkValue: (ctx) => ctx.transformator.nr,
    linkStore: 'urzadzeniaRejonowe',
  },
  {
    key: 'przodek',
    store: 'przodki',
    titleField: 'nrPrzodka',
    label: 'Przodek (odbiornik)',
    newFields: [{ key: 'nrPrzodka', label: 'Nr przodka', type: 'text' }],
    prefillOnCreate: (ctx) => ({ chodnik: ctx.chodnik.nrChodnika, rejon: ctx.chodnik.rejon }),
    afterSelect: async (ctx, selected) => {
      if (ctx.urzadzenie.zasila === selected.nrPrzodka) return;
      await nadzorUpdate('urzadzeniaRejonowe', { ...ctx.urzadzenie, zasila: selected.nrPrzodka });
      ctx.urzadzenie.zasila = selected.nrPrzodka;
    },
  },
  {
    key: 'kombajn',
    store: 'kombajny',
    titleField: 'nrKombajnu',
    label: 'Kombajn (opcjonalnie)',
    optional: true,
    newFields: [{ key: 'nrKombajnu', label: 'Numer kombajnu', type: 'select', options: NR_KOMBAJNOW }],
    afterSelect: async (ctx, selected) => {
      if (ctx.przodek.kombajn === selected.nrKombajnu) return;
      await nadzorUpdate('przodki', { ...ctx.przodek, kombajn: selected.nrKombajnu });
      ctx.przodek.kombajn = selected.nrKombajnu;
    },
  },
];

export function createChainBuilder(containerId) {
  const container = document.getElementById(containerId);
  let stepIndex = 0;
  let chainState = {};

  function reset() {
    stepIndex = 0;
    chainState = {};
    render();
  }

  function renderBreadcrumb() {
    const parts = STEPS.slice(0, stepIndex).map((s) => {
      const record = chainState[s.key];
      return `<span class="chain-crumb">${escapeHtml(s.label)}: <strong>${escapeHtml(record[s.titleField])}</strong></span>`;
    });
    return parts.length ? `<div class="chain-breadcrumb">${parts.join(' → ')}</div>` : '';
  }

  async function render() {
    if (stepIndex >= STEPS.length) {
      container.innerHTML = `
        ${renderBreadcrumb()}
        <div class="chain-done">
          <p>✔ Łańcuch zbudowany. Wszystkie ogniwa są ze sobą połączone.</p>
          <button type="button" class="btn-primary" id="chain-new">Zbuduj kolejny łańcuch</button>
        </div>
      `;
      container.querySelector('#chain-new').addEventListener('click', reset);
      return;
    }

    const step = STEPS[stepIndex];
    const candidates = await nadzorGetAll(step.store);

    const chipsHtml = candidates
      .map(
        (c) => `<button type="button" class="chain-chip" data-id="${c.id}">${escapeHtml(c[step.titleField] || '(bez nazwy)')}</button>`
      )
      .join('');

    container.innerHTML = `
      ${renderBreadcrumb()}
      <div class="chain-step">
        <h3>${escapeHtml(step.label)}</h3>
        <p class="field-hint">Wybierz istniejący element albo dodaj nowy.</p>
        <div class="chain-chips">
          ${chipsHtml}
          <button type="button" class="chain-chip chain-chip-new" id="chain-add-new">+ Nowy</button>
        </div>
        <div id="chain-new-form"></div>
        <div class="form-actions">
          ${stepIndex > 0 ? '<button type="button" class="btn-small" id="chain-back">← Wstecz</button>' : ''}
          ${step.optional ? '<button type="button" class="btn-small" id="chain-skip">Pomiń</button>' : ''}
        </div>
      </div>
    `;

    container.querySelectorAll('.chain-chip[data-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const record = candidates.find((c) => c.id === Number(btn.dataset.id));
        await selectRecord(step, record);
      });
    });

    container.querySelector('#chain-add-new').addEventListener('click', () => {
      renderNewForm(step);
    });

    if (stepIndex > 0) {
      container.querySelector('#chain-back').addEventListener('click', () => {
        stepIndex -= 1;
        render();
      });
    }
    if (step.optional) {
      container.querySelector('#chain-skip').addEventListener('click', () => {
        stepIndex += 1;
        render();
      });
    }
  }

  function renderNewForm(step) {
    const formEl = container.querySelector('#chain-new-form');
    const fieldsHtml = step.newFields
      .map((f) => {
        if (f.type === 'select') {
          return `
            <label class="form-field">
              ${escapeHtml(f.label)}
              <select name="${f.key}">
                <option value="">— wybierz —</option>
                ${f.options.map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}
              </select>
            </label>
          `;
        }
        return `
          <label class="form-field">
            ${escapeHtml(f.label)}
            <input type="text" name="${f.key}">
          </label>
        `;
      })
      .join('');

    formEl.innerHTML = `
      <form id="chain-quick-add" class="chain-quick-add">
        ${fieldsHtml}
        <div class="form-actions">
          <button type="submit" class="btn-primary">Dodaj i wybierz</button>
        </div>
      </form>
    `;

    formEl.querySelector('#chain-quick-add').addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.target);
      const newRecord = {};
      for (const f of step.newFields) {
        newRecord[f.key] = formData.get(f.key)?.trim() ?? '';
      }
      if (!newRecord[step.titleField]) {
        alert('Podaj nazwę/numer.');
        return;
      }
      if (step.prefillOnCreate) {
        Object.assign(newRecord, step.prefillOnCreate(chainState));
      }
      const id = await nadzorAdd(step.store, newRecord);
      await selectRecord(step, { ...newRecord, id });
    });
  }

  async function selectRecord(step, record) {
    if (step.linkField) {
      const wanted = step.linkValue(chainState);
      if (record[step.linkField] && record[step.linkField] !== wanted) {
        const ok = confirm(
          `${record[step.titleField]} jest obecnie połączony z "${record[step.linkField]}". Przełączyć na "${wanted}"?`
        );
        if (!ok) return;
      }
      if (record[step.linkField] !== wanted) {
        await nadzorUpdate(step.linkStore, { ...record, [step.linkField]: wanted });
        record = { ...record, [step.linkField]: wanted };
      }
    }

    chainState[step.key] = record;

    if (step.afterSelect) {
      await step.afterSelect(chainState, record);
    }

    stepIndex += 1;
    await render();
  }

  return { init: render };
}
