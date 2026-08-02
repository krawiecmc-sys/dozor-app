// Dashboard: drzewiasta mapa urządzeń rejonu — NIE jest to wykres
// statystyczny (bez porównania wielkości/trendu/udziału), więc nie ma tu
// kolorystyki kategorialnej/sekwencyjnej — to drzewo nawigacyjne w spójnym
// języku wizualnym appki (te same kolory co reszta PROTEKTORA). Dane łączone
// są przez dopasowanie tekstowych pól-referencji (zasilanyZ, lokalizacja,
// chodnik, kombajn) — to dopasowanie po treści, nie prawdziwe klucze obce,
// więc rekordy, których nic nie dopasuje, trafiają do sekcji "Niepowiązane"
// zamiast po cichu zniknąć z widoku. Każdy węzeł odpowiadający realnemu
// rekordowi jest klikalny — otwiera jego edycję (patrz onEditRecord w app.js).

import { nadzorGetAll } from './db.js';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const REJONY = ['zachód', 'wschód', 'centrum'];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function hasExpiredZabezpieczenie(zabezpieczenia) {
  if (!Array.isArray(zabezpieczenia)) return false;
  return zabezpieczenia.some((row) => {
    if (!row.legalizacja) return false;
    const d = new Date(row.legalizacja);
    if (Number.isNaN(d.getTime())) return false;
    return Date.now() - d.getTime() > ONE_YEAR_MS;
  });
}

function node(label, { expired = false, meta = '', entityKey = null, id = null } = {}, childrenHtml = '') {
  const clickableAttrs = entityKey ? `data-entity="${entityKey}" data-id="${id}" tabindex="0"` : '';
  const clickableClass = entityKey ? 'dash-clickable' : '';
  return `
    <li class="dash-node">
      <div class="dash-node-row ${expired ? 'expired' : ''} ${clickableClass}" ${clickableAttrs}>
        <span class="dash-node-label">${escapeHtml(label)}</span>
        ${meta ? `<span class="dash-node-meta">${escapeHtml(meta)}</span>` : ''}
        ${expired ? '<span class="dash-node-flag">⚠ legalizacja &gt; 1 rok</span>' : ''}
      </div>
      ${childrenHtml ? `<ul class="dash-children">${childrenHtml}</ul>` : ''}
    </li>
  `;
}

export async function renderDashboard(containerId, { onEditRecord } = {}) {
  const container = document.getElementById(containerId);

  const [przodki, kombajny, urzadzenia, transformatory, poleRozdzielcze, chodnikiTrasy] = await Promise.all([
    nadzorGetAll('przodki'),
    nadzorGetAll('kombajny'),
    nadzorGetAll('urzadzeniaRejonowe'),
    nadzorGetAll('transformatory'),
    nadzorGetAll('poleRozdzielcze'),
    nadzorGetAll('chodnikiTrasy'),
  ]);

  const usedIds = { przodki: new Set(), kombajny: new Set(), urzadzenia: new Set(), transformatory: new Set(), poleRozdzielcze: new Set() };

  function renderKombajnFor(nrKombajnu) {
    if (!nrKombajnu) return '';
    const k = kombajny.find((x) => x.nrKombajnu === nrKombajnu);
    if (!k) return '';
    usedIds.kombajny.add(k.id);
    return node(`Kombajn ${k.nrKombajnu}`, {
      meta: k.nrFabryczny ? `nr fabr. ${k.nrFabryczny}` : '',
      expired: hasExpiredZabezpieczenie(k.zabezpieczenia),
      entityKey: 'kombajny',
      id: k.id,
    });
  }

  function renderUrzadzeniaFor(transformatorNr) {
    return urzadzenia
      .filter((u) => u.zasilanyZ === transformatorNr)
      .map((u) => {
        usedIds.urzadzenia.add(u.id);
        return node(u.nazwa, {
          meta: [u.przeznaczenie, u.zasila ? `→ ${u.zasila}` : ''].filter(Boolean).join(' · '),
          expired: hasExpiredZabezpieczenie(u.zabezpieczenia),
          entityKey: 'urzadzeniaRejonowe',
          id: u.id,
        });
      })
      .join('');
  }

  function renderTransformatoryFor(poleNazwa) {
    return transformatory
      .filter((t) => t.zasilanyZ === poleNazwa)
      .map((t) => {
        usedIds.transformatory.add(t.id);
        return node(
          `Transformator ${t.nr}`,
          { meta: t.napiecie || '', entityKey: 'transformatory', id: t.id },
          renderUrzadzeniaFor(t.nr)
        );
      })
      .join('');
  }

  function renderPoleFor(nrChodnika) {
    return poleRozdzielcze
      .filter((p) => p.lokalizacja && p.lokalizacja.includes(nrChodnika))
      .map((p) => {
        usedIds.poleRozdzielcze.add(p.id);
        return node(
          p.nazwaPola,
          { meta: p.zasilaneZ ? `zasilane z: ${p.zasilaneZ}` : '', entityKey: 'poleRozdzielcze', id: p.id },
          renderTransformatoryFor(p.nazwaPola)
        );
      })
      .join('');
  }

  function renderPrzodkiFor(nrChodnika) {
    return przodki
      .filter((p) => p.chodnik === nrChodnika)
      .map((p) => {
        usedIds.przodki.add(p.id);
        const urabianie = [p.urabianieRodzajChodnika, p.urabianieZakret].filter(Boolean).join(' / ');
        return node(
          `Przodek ${p.nrPrzodka}`,
          { meta: urabianie, entityKey: 'przodki', id: p.id },
          renderKombajnFor(p.kombajn)
        );
      })
      .join('');
  }

  function renderChodnikiFor(rejon) {
    return chodnikiTrasy
      .filter((c) => c.rejon === rejon)
      .map((c) => {
        const children = renderPrzodkiFor(c.nrChodnika) + renderPoleFor(c.nrChodnika);
        return node(
          `Chodnik ${c.nrChodnika}`,
          { meta: c.punktZasilania || '', entityKey: 'chodnikiTrasy', id: c.id },
          children || ''
        );
      })
      .join('');
  }

  const rejonySections = REJONY.map((rejon) => {
    const chodnikiHtml = renderChodnikiFor(rejon);
    if (!chodnikiHtml) return '';
    return `
      <div class="dash-rejon">
        <h3>Rejon: ${escapeHtml(rejon)}</h3>
        <ul class="dash-tree">${chodnikiHtml}</ul>
      </div>
    `;
  }).join('');

  // Rekordy, których nic nie dopasowało do drzewa — nie chowamy ich, bo
  // dopasowanie jest po treści pól, nie po prawdziwych kluczach obcych.
  // Każda grupa zna swój entityKey, żeby te węzły też były klikalne.
  const orphanGroups = [
    { label: 'Chodniki (brak dopasowanego rejonu z listy zachód/wschód/centrum)', entityKey: 'chodnikiTrasy', records: chodnikiTrasy.filter((c) => !REJONY.includes(c.rejon)), titleField: 'nrChodnika' },
    { label: 'Przodki', entityKey: 'przodki', records: przodki.filter((r) => !usedIds.przodki.has(r.id)), titleField: 'nrPrzodka' },
    { label: 'Kombajny', entityKey: 'kombajny', records: kombajny.filter((r) => !usedIds.kombajny.has(r.id)), titleField: 'nrKombajnu' },
    { label: 'Pola rozdzielcze', entityKey: 'poleRozdzielcze', records: poleRozdzielcze.filter((r) => !usedIds.poleRozdzielcze.has(r.id)), titleField: 'nazwaPola' },
    { label: 'Transformatory', entityKey: 'transformatory', records: transformatory.filter((r) => !usedIds.transformatory.has(r.id)), titleField: 'nr' },
    { label: 'Urządzenia rejonowe', entityKey: 'urzadzeniaRejonowe', records: urzadzenia.filter((r) => !usedIds.urzadzenia.has(r.id)), titleField: 'nazwa' },
  ].filter((g) => g.records.length > 0);

  const orphansHtml = orphanGroups.length
    ? `
      <div class="dash-rejon dash-orphans">
        <h3>Niepowiązane / do sprawdzenia</h3>
        <p class="field-hint">Te rekordy nie dopasowały się automatycznie do żadnego węzła drzewa (np. pole "Zasilany z" nie zgadza się dokładnie z nazwą). Kliknij, żeby poprawić dane referencyjne.</p>
        <ul class="dash-tree">
          ${orphanGroups
            .map(
              (group) => `
              <li class="dash-node">
                <div class="dash-node-row"><span class="dash-node-label">${escapeHtml(group.label)} (${group.records.length})</span></div>
                <ul class="dash-children">
                  ${group.records
                    .map((r) => node(r[group.titleField] || '(bez nazwy)', { entityKey: group.entityKey, id: r.id }))
                    .join('')}
                </ul>
              </li>
            `
            )
            .join('')}
        </ul>
      </div>
    `
    : '';

  container.innerHTML =
    rejonySections || orphansHtml
      ? rejonySections + orphansHtml
      : '<p class="empty-state">Brak danych do pokazania — dodaj rekordy w Nadzorze rejonu.</p>';

  if (onEditRecord) {
    container.querySelectorAll('.dash-clickable').forEach((el) => {
      el.addEventListener('click', () => {
        onEditRecord(el.dataset.entity, Number(el.dataset.id));
      });
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEditRecord(el.dataset.entity, Number(el.dataset.id));
        }
      });
    });
  }
}
