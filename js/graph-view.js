// Widok graficzny "Graf zasilania" (Faza 4 reorganizacji, 31.08.2026) — user
// wybiera urządzenia z listy (picker), klik dodaje węzeł na płótno; appka
// AUTOMATYCZNIE dorysowuje strzałki do już obecnych, powiązanych węzłów na
// podstawie REALNYCH kluczy obcych (fk-or-free/fk-multi, patrz
// nadzor-entities.js) — nie trzeba ręcznie łączyć strzałek. Inline SVG (nie
// <canvas>) tylko dla strzałek — węzły to zwykłe pozycjonowane <div>-y (łatwiej
// o klikalność/dostępność/zawijanie tekstu niż w <canvas> albo <foreignObject>).
// Kolejność dodawania NIE ma znaczenia — krawędzie liczone są na nowo przy
// każdej zmianie płótna, dla WSZYSTKICH par węzłów na płótnie jednocześnie.
//
// 01.09.2026: dołożone Urządzenia — jeden typ węzła może mieć DWA różne
// możliwe typy rodzica (Urządzenie: Transformator ALBO inne Urządzenie;
// KB: Transformator ALBO Urządzenie; Rozdzielnia: inna Rozdzielnia,
// główne/rezerwowe). Self-referencje (Urządzenie, Rozdzielnia) mają guard
// przeciw strzałce węzła do samego siebie w znajdzRodzicowNaPlotnie —
// architektura już wspiera węzeł z wieloma rodzicami (rodzice to tablica),
// więc nic więcej nie było potrzebne.

import { nadzorGetAll } from './db.js';

// 01.09.2026: dołożone Urządzenia (poziom 3) między Transformator i KB —
// KB dostało drugie, opcjonalne pole zasilania (zasilany_z_urzadzenia), więc
// jego poziom przesunięty z 3 na 4 (i silniki/czujniki z 4 na 5), żeby
// KB-zasilane-z-Urządzenia mogło stanąć wizualnie NIŻEJ niż Urządzenie
// zamiast w tym samym rzędzie. Bezpośredni przypadek Transformator->KB (bez
// pośredniego Urządzenia, najczęstszy w bazie) dostaje wtedy "pusty" rząd 3
// między nimi — kosmetyczna, nieszkodliwa luka.
const TYPY = [
  { key: 'rozdzielnie', label: 'Rozdzielnia', titleField: 'nazwa_r', poziom: 0 },
  { key: 'poleRozdzielcze', label: 'Pole rozdzielcze', titleField: 'p_nazwa', poziom: 1 },
  { key: 'transformatory', label: 'Transformator', titleField: 't_nr', poziom: 2 },
  { key: 'urzadzenia', label: 'Urządzenie', titleField: 'nazwa', poziom: 3 },
  { key: 'kb', label: 'KB', titleField: 'kb_nazwa', poziom: 4 },
  { key: 'silniki', label: 'Silnik', titleField: 'nazwa_silnika', poziom: 5 },
  { key: 'czujniki', label: 'Czujnik', titleField: 'nazwa_czujnik', poziom: 5 },
];

const WEZEL_SZEROKOSC = 190;
const WEZEL_WYSOKOSC = 84;
const ODSTEP_X = 24;
const ODSTEP_Y = 56;
const MARGINES = 20;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// Ten sam mechanizm dopasowania co dashboard.js: fk-or-free może być
// numerycznym id (prawdziwy klucz) albo wolnym tekstem (dopasowanie po nazwie).
function wskazujeNa(wartosc, rekordRodzica, poleWyswietlaneRodzica) {
  if (wartosc === undefined || wartosc === null || wartosc === '') return false;
  if (typeof wartosc === 'number') return wartosc === rekordRodzica.id;
  return String(wartosc).trim().toLowerCase() === String(rekordRodzica[poleWyswietlaneRodzica] || '').trim().toLowerCase();
}

export function createGraphView(containerId) {
  const container = document.getElementById(containerId);
  let onEditRecord = null;
  let dane = {};
  let platno = []; // [{ typ, id }] — kolejność dodania, ale nieużywana do liczenia krawędzi

  container.innerHTML = `
    <div class="graph-toolbar">
      <button type="button" id="graph-add-toggle" class="btn-small">+ Dodaj urządzenie do widoku</button>
      <button type="button" id="graph-clear-btn" class="btn-small">Wyczyść widok</button>
    </div>
    <div id="graph-picker" class="graph-picker hidden"></div>
    <div id="graph-canvas-wrap">
      <svg id="graph-arrows"></svg>
      <div id="graph-nodes"></div>
    </div>
  `;

  const pickerEl = container.querySelector('#graph-picker');
  const addToggleBtn = container.querySelector('#graph-add-toggle');
  const clearBtn = container.querySelector('#graph-clear-btn');
  const wrapEl = container.querySelector('#graph-canvas-wrap');
  const svgEl = container.querySelector('#graph-arrows');
  const nodesEl = container.querySelector('#graph-nodes');

  function znajdzRekord(typ, id) {
    return (dane[typ] || []).find((r) => r.id === id);
  }

  function jestNaPlotnie(typ, id) {
    return platno.some((w) => w.typ === typ && w.id === id);
  }

  async function wczytajDane() {
    const [rozdzielnie, poleRozdzielcze, transformatory, urzadzenia, kb, silniki, czujniki] = await Promise.all([
      nadzorGetAll('rozdzielnie'),
      nadzorGetAll('poleRozdzielcze'),
      nadzorGetAll('transformatory'),
      nadzorGetAll('urzadzenia'),
      nadzorGetAll('kb'),
      nadzorGetAll('silniki'),
      nadzorGetAll('czujniki'),
    ]);
    dane = { rozdzielnie, poleRozdzielcze, transformatory, urzadzenia, kb, silniki, czujniki };
  }

  // Rodzice DANEGO węzła spośród węzłów już obecnych na płótnie (patrz
  // komentarz na górze pliku — kierunek zasilania idzie zawsze
  // rozdzielnia -> pole -> kb -> silnik/czujnik).
  function znajdzRodzicowNaPlotnie(typ, rekord) {
    const rodzice = [];
    if (typ === 'poleRozdzielcze') {
      for (const w of platno) {
        if (w.typ !== 'rozdzielnie') continue;
        const r = znajdzRekord('rozdzielnie', w.id);
        if (r && wskazujeNa(rekord.miejsce_zabudowy, r, 'nazwa_r')) rodzice.push(w);
      }
    } else if (typ === 'transformatory') {
      for (const w of platno) {
        if (w.typ !== 'poleRozdzielcze') continue;
        const r = znajdzRekord('poleRozdzielcze', w.id);
        if (r && wskazujeNa(rekord.zasilany_z_pola, r, 'p_nazwa')) rodzice.push(w);
      }
    } else if (typ === 'urzadzenia') {
      // Urządzenie może być zasilane z Transformatora ALBO z innego
      // Urządzenia (self-referencja, patrz nadzor-entities.js) — dwa
      // niezależne dopasowania w jednej pętli po węzłach na płótnie.
      for (const w of platno) {
        if (w.typ === 'transformatory') {
          const r = znajdzRekord('transformatory', w.id);
          if (r && wskazujeNa(rekord.zasilane_z_transformatora, r, 't_nr')) rodzice.push(w);
        } else if (w.typ === 'urzadzenia') {
          if (w.id === rekord.id) continue; // nie rysuj strzałki węzła do samego siebie
          const r = znajdzRekord('urzadzenia', w.id);
          if (r && wskazujeNa(rekord.zasilane_z_urzadzenia, r, 'nazwa')) rodzice.push(w);
        }
      }
    } else if (typ === 'kb') {
      // KB może być zasilane bezpośrednio z Transformatora ALBO z końca
      // łańcucha Urządzeń — dwa niezależne dopasowania (01.09.2026).
      for (const w of platno) {
        if (w.typ === 'transformatory') {
          const r = znajdzRekord('transformatory', w.id);
          if (r && wskazujeNa(rekord.zasilany_z_transformatora, r, 't_nr')) rodzice.push(w);
        } else if (w.typ === 'urzadzenia') {
          const r = znajdzRekord('urzadzenia', w.id);
          if (r && wskazujeNa(rekord.zasilany_z_urzadzenia, r, 'nazwa')) rodzice.push(w);
        }
      }
    } else if (typ === 'rozdzielnie') {
      // Self-referencja (01.09.2026) — Rozdzielnia ma DWA niezależne pola
      // zasilania (główne/rezerwowe), oba sprawdzane osobno; może więc mieć
      // do dwóch rodziców naraz (już wspierane przez architekturę — rodzice
      // to tablica).
      for (const w of platno) {
        if (w.typ !== 'rozdzielnie' || w.id === rekord.id) continue;
        const r = znajdzRekord('rozdzielnie', w.id);
        if (!r) continue;
        if (wskazujeNa(rekord.r_zasilana_z_glowne, r, 'nazwa_r')) rodzice.push(w);
        if (wskazujeNa(rekord.r_zasilana_z_rezerwowe, r, 'nazwa_r')) rodzice.push(w);
      }
    } else if (typ === 'silniki' || typ === 'czujniki') {
      for (const w of platno) {
        if (w.typ !== 'kb') continue;
        const r = znajdzRekord('kb', w.id);
        const lista = typ === 'silniki' ? r?.silniki : r?.czujniki;
        if (Array.isArray(lista) && lista.includes(rekord.id)) rodzice.push(w);
      }
    }
    return rodzice;
  }

  function obliczKrawedzie() {
    const krawedzie = [];
    for (const w of platno) {
      const rekord = znajdzRekord(w.typ, w.id);
      if (!rekord) continue;
      for (const rodzic of znajdzRodzicowNaPlotnie(w.typ, rekord)) {
        krawedzie.push({ od: rodzic, do: w });
      }
    }
    return krawedzie;
  }

  function obliczPozycje() {
    const poGrupach = {};
    for (const w of platno) {
      const poziom = TYPY.find((t) => t.key === w.typ).poziom;
      (poGrupach[poziom] = poGrupach[poziom] || []).push(w);
    }
    const pozycje = {};
    for (const [poziom, grupa] of Object.entries(poGrupach)) {
      grupa.forEach((w, i) => {
        pozycje[`${w.typ}:${w.id}`] = {
          x: MARGINES + i * (WEZEL_SZEROKOSC + ODSTEP_X),
          y: MARGINES + Number(poziom) * (WEZEL_WYSOKOSC + ODSTEP_Y),
        };
      });
    }
    return pozycje;
  }

  function etykietaWezla(typ, rekord) {
    const def = TYPY.find((t) => t.key === typ);
    const tytul = rekord[def.titleField] || '(bez nazwy)';
    let detale = '';
    if (typ === 'transformatory') detale = rekord.t_napiecie || '';
    else if (typ === 'urzadzenia') detale = [rekord.moc ? `${rekord.moc} kW` : '', rekord.nap_zas].filter(Boolean).join(' · ');
    else if (typ === 'kb') detale = rekord.typ_kb || '';
    else if (typ === 'silniki') detale = [rekord.s_moc ? `${rekord.s_moc} kW` : '', rekord.napiecie_zas, rekord.s_rodzaj].filter(Boolean).join(' · ');
    else if (typ === 'czujniki') detale = rekord.opis || '';
    else if (typ === 'rozdzielnie') detale = rekord.pole_nr ? `pole nr ${rekord.pole_nr}` : '';
    else if (typ === 'poleRozdzielcze') detale = rekord.p_zasilane_z ? `zasilane z: ${rekord.p_zasilane_z}` : '';
    return { tytul, detale };
  }

  function renderWezly(pozycje) {
    if (platno.length === 0) {
      nodesEl.innerHTML = '<p class="empty-state">Dodaj urządzenia z listy powyżej, żeby zbudować widok. Strzałki między nimi pojawią się same, jeśli są realnie powiązane.</p>';
      return;
    }

    nodesEl.innerHTML = platno
      .map((w) => {
        const rekord = znajdzRekord(w.typ, w.id);
        if (!rekord) return '';
        const def = TYPY.find((t) => t.key === w.typ);
        const { tytul, detale } = etykietaWezla(w.typ, rekord);
        const pos = pozycje[`${w.typ}:${w.id}`];
        return `
          <div class="graph-node" data-typ="${w.typ}" data-id="${w.id}" style="left:${pos.x}px; top:${pos.y}px; width:${WEZEL_SZEROKOSC}px;">
            <div class="graph-node-head">
              <span class="graph-node-typ">${escapeHtml(def.label)}</span>
              <button type="button" class="graph-node-remove" data-typ="${w.typ}" data-id="${w.id}" aria-label="Usuń z widoku">×</button>
            </div>
            <div class="graph-node-title">${escapeHtml(tytul)}</div>
            ${detale ? `<div class="graph-node-detale">${escapeHtml(detale)}</div>` : ''}
          </div>
        `;
      })
      .join('');

    nodesEl.querySelectorAll('.graph-node').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.graph-node-remove')) return;
        if (onEditRecord) onEditRecord(el.dataset.typ, Number(el.dataset.id));
      });
    });
    nodesEl.querySelectorAll('.graph-node-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        usunZPlotna(btn.dataset.typ, Number(btn.dataset.id));
      });
    });
  }

  function renderStrzalki(pozycje, krawedzie, szerokosc, wysokosc) {
    svgEl.setAttribute('width', szerokosc);
    svgEl.setAttribute('height', wysokosc);
    svgEl.innerHTML = `
      <defs>
        <marker id="graph-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent)"></path>
        </marker>
      </defs>
      ${krawedzie
        .map((k) => {
          const od = pozycje[`${k.od.typ}:${k.od.id}`];
          const do_ = pozycje[`${k.do.typ}:${k.do.id}`];
          if (!od || !do_) return '';
          const x1 = od.x + WEZEL_SZEROKOSC / 2;
          const y1 = od.y + WEZEL_WYSOKOSC;
          const x2 = do_.x + WEZEL_SZEROKOSC / 2;
          const y2 = do_.y;
          const midY = (y1 + y2) / 2;
          return `<path d="M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}" stroke="var(--accent)" stroke-width="2" fill="none" marker-end="url(#graph-arrowhead)"></path>`;
        })
        .join('')}
    `;
  }

  function render() {
    const pozycje = obliczPozycje();
    const krawedzie = obliczKrawedzie();
    const wartosciX = Object.values(pozycje).map((p) => p.x + WEZEL_SZEROKOSC);
    const wartosciY = Object.values(pozycje).map((p) => p.y + WEZEL_WYSOKOSC);
    const szerokosc = Math.max(360, ...wartosciX, 0) + MARGINES;
    const wysokosc = Math.max(220, ...wartosciY, 0) + MARGINES;
    wrapEl.style.minWidth = `${szerokosc}px`;
    nodesEl.style.height = `${wysokosc}px`;
    renderStrzalki(pozycje, krawedzie, szerokosc, wysokosc);
    renderWezly(pozycje);
  }

  function renderPicker() {
    const grupyHtml = TYPY.map((def) => {
      const rekordy = (dane[def.key] || []).filter((r) => !jestNaPlotnie(def.key, r.id));
      if (rekordy.length === 0) return '';
      return `
        <div class="graph-picker-group">
          <h4>${escapeHtml(def.label)}</h4>
          <div class="graph-picker-chips">
            ${rekordy.map((r) => `<button type="button" class="chip" data-typ="${def.key}" data-id="${r.id}">${escapeHtml(r[def.titleField] || '(bez nazwy)')}</button>`).join('')}
          </div>
        </div>
      `;
    })
      .filter(Boolean)
      .join('');

    pickerEl.innerHTML = grupyHtml || '<p class="empty-state-small">Wszystkie istniejące rekordy są już na widoku (albo baza jest pusta — dodaj coś w zakładce Rejon).</p>';

    pickerEl.querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => dodajDoPlotna(btn.dataset.typ, Number(btn.dataset.id)));
    });
  }

  function dodajDoPlotna(typ, id) {
    if (jestNaPlotnie(typ, id)) return;
    platno.push({ typ, id });
    renderPicker();
    render();
  }

  function usunZPlotna(typ, id) {
    platno = platno.filter((w) => !(w.typ === typ && w.id === id));
    renderPicker();
    render();
  }

  addToggleBtn.addEventListener('click', () => pickerEl.classList.toggle('hidden'));
  clearBtn.addEventListener('click', () => {
    if (platno.length && !confirm('Wyczyścić widok? To nie usuwa żadnych rekordów, tylko czyści to płótno.')) return;
    platno = [];
    renderPicker();
    render();
  });

  async function init(opts = {}) {
    onEditRecord = opts.onEditRecord || null;
    await wczytajDane();
    // Usuń z płótna węzły rekordów skasowanych od ostatniej wizyty na tej
    // zakładce — inaczej picker błędnie ukrywałby je jako "już na widoku".
    platno = platno.filter((w) => !!znajdzRekord(w.typ, w.id));
    renderPicker();
    render();
  }

  return { init };
}
