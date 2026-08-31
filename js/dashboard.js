// Dashboard: drzewiasta mapa urządzeń rejonu — NIE jest to wykres
// statystyczny (bez porównania wielkości/trendu/udziału), więc nie ma tu
// kolorystyki kategorialnej/sekwencyjnej — to drzewo nawigacyjne w spójnym
// języku wizualnym appki (te same kolory co reszta PROTEKTORA).
//
// Od 31.08.2026 hierarchia idzie po REALNYCH kluczach obcych (fk-or-free /
// fk-multi, patrz nadzor-entities.js/crud-module.js), nie po dopasowaniu
// tekstu jak w poprzednim schemacie: Rozdzielnia -> Pole rozdzielcze
// (miejsce_zabudowy) -> KB (zasilany_z_pola) -> Silniki/Czujniki (fk-multi).
// Pole rozdzielcze/KB mogą wciąż wskazywać "rodzica" wolnym tekstem (opcja
// "inny, wpisz ręcznie") — dopasowanie w takim przypadku jest po nazwie,
// więc rekordy, których nic nie dopasuje, nadal trafiają do sekcji
// "Niepowiązane" zamiast po cichu zniknąć z widoku. Każdy węzeł odpowiadający
// realnemu rekordowi jest klikalny — otwiera jego edycję (onEditRecord).

import { nadzorGetAll } from './db.js';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

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

// Rozwiązuje pole typu fk-or-free (wartość = numeryczne id ALBO wolny tekst)
// względem konkretnego rekordu-rodzica. Zwraca true, jeśli dana wartość
// odnosi się do przekazanego rekordu rodzica.
function wskazujeNa(wartosc, rekordRodzica, poleWyswietlaneRodzica) {
  if (wartosc === undefined || wartosc === null || wartosc === '') return false;
  if (typeof wartosc === 'number') return wartosc === rekordRodzica.id;
  return String(wartosc).trim().toLowerCase() === String(rekordRodzica[poleWyswietlaneRodzica] || '').trim().toLowerCase();
}

export async function renderDashboard(containerId, { onEditRecord } = {}) {
  const container = document.getElementById(containerId);

  const [rozdzielnie, poleRozdzielcze, kb, silniki, czujniki] = await Promise.all([
    nadzorGetAll('rozdzielnie'),
    nadzorGetAll('poleRozdzielcze'),
    nadzorGetAll('kb'),
    nadzorGetAll('silniki'),
    nadzorGetAll('czujniki'),
  ]);

  const silnikiById = new Map(silniki.map((s) => [s.id, s]));
  const czujnikiById = new Map(czujniki.map((c) => [c.id, c]));

  const usedIds = { poleRozdzielcze: new Set(), kb: new Set(), silniki: new Set(), czujniki: new Set() };

  function renderSilnikiCzujnikiFor(kbRecord) {
    const silnikiHtml = (Array.isArray(kbRecord.silniki) ? kbRecord.silniki : [])
      .map((id) => {
        const s = silnikiById.get(id);
        if (!s) return node(`⚠ silnik #${id} — nie znaleziono (usunięty?)`, {});
        usedIds.silniki.add(s.id);
        return node(`Silnik: ${s.nazwa_silnika}`, {
          meta: [s.s_moc ? `${s.s_moc} kW` : '', s.napiecie_zas, s.s_rodzaj].filter(Boolean).join(' · '),
          entityKey: 'silniki',
          id: s.id,
        });
      })
      .join('');
    const czujnikiHtml = (Array.isArray(kbRecord.czujniki) ? kbRecord.czujniki : [])
      .map((id) => {
        const c = czujnikiById.get(id);
        if (!c) return node(`⚠ czujnik #${id} — nie znaleziono (usunięty?)`, {});
        usedIds.czujniki.add(c.id);
        return node(`Czujnik: ${c.nazwa_czujnik}`, { meta: c.opis || '', entityKey: 'czujniki', id: c.id });
      })
      .join('');
    return silnikiHtml + czujnikiHtml;
  }

  function renderKbFor(poleRecord) {
    return kb
      .filter((k) => wskazujeNa(k.zasilany_z_pola, poleRecord, 'p_nazwa'))
      .map((k) => {
        usedIds.kb.add(k.id);
        return node(
          `${k.typ_kb ? k.typ_kb + ' — ' : ''}${k.kb_nazwa}`,
          { expired: hasExpiredZabezpieczenie(k.nastawy_zabezpieczen), entityKey: 'kb', id: k.id },
          renderSilnikiCzujnikiFor(k)
        );
      })
      .join('');
  }

  function renderPoleFor(rozdzielniaRecord) {
    return poleRozdzielcze
      .filter((p) => wskazujeNa(p.miejsce_zabudowy, rozdzielniaRecord, 'nazwa_r'))
      .map((p) => {
        usedIds.poleRozdzielcze.add(p.id);
        return node(
          p.p_nazwa,
          { meta: p.p_zasilane_z ? `zasilane z: ${p.p_zasilane_z}` : '', entityKey: 'poleRozdzielcze', id: p.id },
          renderKbFor(p)
        );
      })
      .join('');
  }

  const rozdzielnieHtml = rozdzielnie
    .map((r) => {
      const children = renderPoleFor(r);
      return node(
        `Rozdzielnia: ${r.nazwa_r}`,
        { meta: r.pole_nr ? `pole nr ${r.pole_nr}` : '', entityKey: 'rozdzielnie', id: r.id },
        children
      );
    })
    .join('');

  // Rekordy, których nic nie dopasowało do drzewa — nie chowamy ich, bo
  // dopasowanie po wolnym tekście (opcja "inny, wpisz ręcznie") nie jest
  // prawdziwym kluczem obcym. Każda grupa zna swój entityKey, żeby te węzły
  // też były klikalne.
  const orphanGroups = [
    { label: 'Pola rozdzielcze', entityKey: 'poleRozdzielcze', records: poleRozdzielcze.filter((r) => !usedIds.poleRozdzielcze.has(r.id)), titleField: 'p_nazwa' },
    { label: 'KB', entityKey: 'kb', records: kb.filter((r) => !usedIds.kb.has(r.id)), titleField: 'kb_nazwa' },
    { label: 'Silniki (nieprzypisane do żadnego KB)', entityKey: 'silniki', records: silniki.filter((r) => !usedIds.silniki.has(r.id)), titleField: 'nazwa_silnika' },
    { label: 'Czujniki (nieprzypisane do żadnego KB)', entityKey: 'czujniki', records: czujniki.filter((r) => !usedIds.czujniki.has(r.id)), titleField: 'nazwa_czujnik' },
  ].filter((g) => g.records.length > 0);

  const orphansHtml = orphanGroups.length
    ? `
      <div class="dash-rejon dash-orphans">
        <h3>Niepowiązane / do sprawdzenia</h3>
        <p class="field-hint">Te rekordy nie dopasowały się automatycznie do żadnego węzła drzewa (np. pole "Miejsce zabudowy"/"Zasilany z" wpisane ręcznie nie zgadza się dokładnie z nazwą). Kliknij, żeby poprawić — albo uruchom samonaprawę w ustawieniach.</p>
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

  const rejonySections = rozdzielnieHtml
    ? `<div class="dash-rejon"><ul class="dash-tree">${rozdzielnieHtml}</ul></div>`
    : '';

  container.innerHTML =
    rejonySections || orphansHtml
      ? rejonySections + orphansHtml
      : '<p class="empty-state">Brak danych do pokazania — dodaj rekordy w zakładce Rejon.</p>';

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
