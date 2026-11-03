// Widok "Plan rejonu" (03.11.2026) — schematyczny plan oddziału wg wzoru
// "plan rejonu dla kombajnu chodnikowego": chodniki z kierunkami, przenośniki
// z napędami i numerami, rozdzielnie z polami, transformatory, urządzenia,
// kombajny (KB) oraz kable zasilające prowadzone wzdłuż chodników.
//
// Dane wyłącznie z istniejących magazynów PROTEKTORA:
//   - geometria: chodniki (odchodzi od chodnika X w metrażu M, kierunek w
//     stopniach, długość),
//   - położenie obiektów: lok_chodnik + lok_metraz + lok_strona,
//   - kto kogo zasila: istniejące pola "zasilany z" (te same, z których
//     korzysta Graf zasilania),
//   - cechy kabla: pola kabel_* przy obiekcie ZASILANYM.
// Nic nie jest liczone "na boku" — plan to tylko inny widok tych samych
// rekordów. Przesunięcie symbolu myszką zapisuje plan_dx/plan_dy w rekordzie
// (czysto rysunkowe, nie zmienia metrażu).
//
// Rysunek to inline SVG generowany od nowa przy każdej zmianie (danych jest
// mało — dziesiątki obiektów), zdarzenia przez delegację na <svg>.

import { nadzorGetAll, nadzorUpdate, nadzorAdd, nadzorDelete } from './db.js';
import { NADZOR_ENTITIES } from './nadzor-entities.js';

const OBIEKTY = [
  { store: 'rozdzielnie', label: 'Rozdzielnia', title: 'nazwa_r', symbol: 'rozdzielnia' },
  { store: 'transformatory', label: 'Transformator', title: 't_nr', symbol: 'transformator' },
  { store: 'urzadzenia', label: 'Urządzenie', title: 'nazwa', symbol: 'urzadzenie' },
  { store: 'kb', label: 'Kombajn / KB', title: 'kb_nazwa', symbol: 'kombajn' },
];

// Skąd brać źródło zasilania dla danego magazynu: [pole FK, magazyn źródła, pole nazwy źródła, prefiks pól kabla]
const ZASILANIE = {
  rozdzielnie: [
    ['r_zasilana_z_glowne', 'rozdzielnie', 'nazwa_r', 'kabel'],
    ['r_zasilana_z_rezerwowe', 'rozdzielnie', 'nazwa_r', 'kabel_rez'],
  ],
  transformatory: [['zasilany_z_pola', 'poleRozdzielcze', 'p_nazwa', 'kabel']],
  urzadzenia: [
    ['zasilane_z_transformatora', 'transformatory', 't_nr', 'kabel'],
    ['zasilane_z_urzadzenia', 'urzadzenia', 'nazwa', 'kabel'],
  ],
  kb: [
    ['zasilany_z_transformatora', 'transformatory', 't_nr', 'kabel'],
    ['zasilany_z_urzadzenia', 'urzadzenia', 'nazwa', 'kabel'],
  ],
  przenosniki: [['zasilany_z_urzadzenia', 'urzadzenia', 'nazwa', 'kabel']],
};

const KOLOR = {
  linia: '#1a7f1a',
  chodnik: '#d5dbe0',
  chodnikBrzeg: '#b8c1c9',
  kabelSN: '#c0392b',
  kabelNN: '#d68910',
  tekst: '#1b1b1b',
  zrodlo: { Excel: '#1f6fb5', 'ręcznie': '#d68910', pomiar: '#1a7f1a', '': '#9aa5ae' },
};

const MARKER_PRZYKLADU = 'plan-rejonu';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

// fk-or-free: numeryczne id albo tekst dopasowany po nazwie (jak w graph-view.js)
function rozwiaz(wartosc, rekordy, pole) {
  if (wartosc === undefined || wartosc === null || wartosc === '') return null;
  if (typeof wartosc === 'number') return rekordy.find((r) => r.id === wartosc) || null;
  const w = String(wartosc).trim().toLowerCase();
  return rekordy.find((r) => String(r[pole] || '').trim().toLowerCase() === w) || null;
}

function kv(tekst) {
  if (!tekst) return null;
  const m = String(tekst).replace(',', '.').match(/[\d.]+/);
  return m ? Number(m[0]) : null;
}

export function createPlanView(containerId) {
  const container = document.getElementById(containerId);
  let onEditRecord = null;
  let dane = {};
  let geo = new Map(); // chodnik.id -> geometria w metrach
  let widok = { s: 1.6, tx: 40, ty: 60, dopasowany: false }; // px = m * s + t
  let warstwy = { chodniki: true, przenosniki: true, obiekty: true, kable: true, opisyKabli: true, zrodlo: false };
  let stawianie = null; // { store, id } — tryb "kliknij na chodniku"
  let pozycje = {}; // `${store}:${id}` -> { x, y } (px, ekran)
  let ostatnieKable = [];
  let przeciaganie = null;
  let recznie = false; // user przesunął/przybliżył — nie dopasowuj sam przy zmianie rozmiaru
  const dotyki = new Map(); // pointerId -> punkt (przybliżanie dwoma palcami)
  let szczypanie = null;

  container.innerHTML = `
    <div class="plan-toolbar">
      <button type="button" class="btn-small" data-akcja="zoom-">−</button>
      <button type="button" class="btn-small" data-akcja="zoom+">+</button>
      <button type="button" class="btn-small" data-akcja="dopasuj">Dopasuj</button>
      <button type="button" class="btn-small" data-akcja="drukuj">Drukuj / PDF</button>
      <button type="button" class="btn-small" data-akcja="svg">Zapisz SVG</button>
      <details class="plan-warstwy">
        <summary class="btn-small">Warstwy</summary>
        <label><input type="checkbox" data-warstwa="chodniki" checked> Chodniki i opisy</label>
        <label><input type="checkbox" data-warstwa="przenosniki" checked> Przenośniki i napędy</label>
        <label><input type="checkbox" data-warstwa="obiekty" checked> Urządzenia</label>
        <label><input type="checkbox" data-warstwa="kable" checked> Kable</label>
        <label><input type="checkbox" data-warstwa="opisyKabli" checked> Opisy kabli</label>
        <label><input type="checkbox" data-warstwa="zrodlo"> Źródło danych (kolor obwódki)</label>
      </details>
    </div>
    <div id="plan-baner" class="plan-baner hidden"></div>
    <div id="plan-stawianie" class="plan-stawianie hidden"></div>
    <div id="plan-wrap" class="plan-wrap">
      <svg id="plan-svg" xmlns="http://www.w3.org/2000/svg"></svg>
      <div id="plan-karta" class="plan-karta hidden"></div>
    </div>
    <div id="plan-legenda" class="plan-legenda"></div>
    <div id="plan-braki" class="plan-braki"></div>
  `;
  const wrapEl = container.querySelector('#plan-wrap');
  const svgEl = container.querySelector('#plan-svg');
  const kartaEl = container.querySelector('#plan-karta');
  const banerEl = container.querySelector('#plan-baner');
  const stawianieEl = container.querySelector('#plan-stawianie');
  const legendaEl = container.querySelector('#plan-legenda');
  const brakiEl = container.querySelector('#plan-braki');

  // ---------- dane i geometria ----------

  async function wczytajDane() {
    const magazyny = ['chodniki', 'przenosniki', 'rozdzielnie', 'poleRozdzielcze', 'transformatory', 'urzadzenia', 'kb'];
    const wyniki = await Promise.all(magazyny.map((m) => nadzorGetAll(m)));
    dane = Object.fromEntries(magazyny.map((m, i) => [m, wyniki[i]]));
    zbudujGeometrie();
  }

  function zbudujGeometrie() {
    geo = new Map();
    const chodniki = dane.chodniki || [];
    let nrKorzenia = 0;
    const oblicz = (ch, sciezka = new Set()) => {
      if (geo.has(ch.id)) return geo.get(ch.id);
      const az = num(ch.ch_azymut) ?? 90;
      const len = Math.max(1, num(ch.ch_dlugosc) ?? 100);
      const rad = (az * Math.PI) / 180;
      const g = {
        rec: ch,
        az,
        len,
        dx: Math.sin(rad),
        dy: -Math.cos(rad),
        nx: Math.cos(rad), // normalna "w prawo" od kierunku biegu (oś y w dół)
        ny: Math.sin(rad),
        parentId: null,
        parentM: 0,
        brakDanych: num(ch.ch_azymut) === null || num(ch.ch_dlugosc) === null,
      };
      const rodzic = rozwiaz(ch.ch_od_chodnika, chodniki, 'ch_nazwa');
      if (rodzic && rodzic.id !== ch.id && !sciezka.has(rodzic.id)) {
        sciezka.add(ch.id);
        const gp = oblicz(rodzic, sciezka);
        const pm = Math.min(Math.max(num(ch.ch_od_metraz) ?? gp.len, 0), gp.len);
        g.parentId = rodzic.id;
        g.parentM = pm;
        g.x0 = gp.x0 + gp.dx * pm;
        g.y0 = gp.y0 + gp.dy * pm;
      } else {
        // chodnik początkowy (albo pętla w danych) — kolejne korzenie obok siebie
        g.x0 = nrKorzenia * 400;
        g.y0 = 0;
        nrKorzenia += 1;
      }
      geo.set(ch.id, g);
      return g;
    };
    for (const ch of chodniki) oblicz(ch);
  }

  function punktM(chId, m) {
    const g = geo.get(chId);
    if (!g) return null;
    const mm = Math.min(Math.max(m ?? 0, 0), g.len);
    return { x: g.x0 + g.dx * mm, y: g.y0 + g.dy * mm };
  }

  const naEkran = (p, v = widok) => ({ x: p.x * v.s + v.tx, y: p.y * v.s + v.ty });
  const zEkranu = (p, v = widok) => ({ x: (p.x - v.tx) / v.s, y: (p.y - v.ty) / v.s });

  function lokalizacja(store, rec) {
    if (store === 'przenosniki') {
      const ch = rozwiaz(rec.pr_chodnik, dane.chodniki, 'ch_nazwa');
      if (!ch) return null;
      const m = num(rec.pr_naped_m) ?? num(rec.pr_do_m) ?? 0;
      return { ch: ch.id, m, strona: 'oś' };
    }
    if (store === 'poleRozdzielcze') {
      const r = rozwiaz(rec.miejsce_zabudowy, dane.rozdzielnie, 'nazwa_r');
      return r ? lokalizacja('rozdzielnie', r) : null;
    }
    const ch = rozwiaz(rec.lok_chodnik, dane.chodniki, 'ch_nazwa');
    if (!ch || num(rec.lok_metraz) === null) return null;
    return { ch: ch.id, m: num(rec.lok_metraz), strona: rec.lok_strona || 'lewa' };
  }

  function obszarSwiata() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const g of geo.values()) {
      for (const p of [{ x: g.x0, y: g.y0 }, { x: g.x0 + g.dx * g.len, y: g.y0 + g.dy * g.len }]) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
    }
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 300, maxY: 200 };
    return { minX, minY, maxX, maxY };
  }

  function dopasuj(szer, wys, v = widok) {
    const o = obszarSwiata();
    const margines = Math.max(36, Math.min(110, szer * 0.12)); // miejsce na symbole i opisy po bokach chodników
    const sw = Math.max(o.maxX - o.minX, 20);
    const sh = Math.max(o.maxY - o.minY, 20);
    v.s = Math.max(0.05, Math.min((szer - 2 * margines) / sw, (wys - 2 * margines) / sh, 8));
    v.tx = margines - o.minX * v.s + ((szer - 2 * margines) - sw * v.s) / 2;
    v.ty = margines - o.minY * v.s + ((wys - 2 * margines) - sh * v.s) / 2;
    return v;
  }

  // ---------- trasa kabla wzdłuż drzewa chodników ----------

  function lancuch(chId, m) {
    const out = [];
    let c = chId;
    let mm = m;
    for (let i = 0; c !== null && c !== undefined && i < 60; i += 1) {
      out.push({ ch: c, m: mm });
      const g = geo.get(c);
      if (!g || g.parentId === null) break;
      mm = g.parentM;
      c = g.parentId;
    }
    return out;
  }

  function trasa(a, b) {
    const la = lancuch(a.ch, a.m);
    const lb = lancuch(b.ch, b.m);
    const idxB = new Map(lb.map((e, i) => [e.ch, i]));
    const ia = la.findIndex((e) => idxB.has(e.ch));
    if (ia < 0) return null;
    const ib = idxB.get(la[ia].ch);
    const pts = [];
    for (let i = 0; i < ia; i += 1) {
      pts.push({ ch: la[i].ch, m: la[i].m });
      pts.push({ ch: la[i].ch, m: 0 });
    }
    pts.push({ ch: la[ia].ch, m: la[ia].m });
    pts.push({ ch: lb[ib].ch, m: lb[ib].m });
    for (let i = ib - 1; i >= 0; i -= 1) {
      pts.push({ ch: lb[i].ch, m: 0 });
      pts.push({ ch: lb[i].ch, m: lb[i].m });
    }
    return pts;
  }

  // ---------- połączenia zasilające (kable) ----------

  function polaczenia() {
    const wynik = [];
    const spozaBazy = [];
    for (const [store, reguly] of Object.entries(ZASILANIE)) {
      for (const rec of dane[store] || []) {
        for (const [pole, zrodloStore, zrodloPole, prefiks] of reguly) {
          const w = rec[pole];
          if (w === undefined || w === null || w === '') continue;
          const zrodlo = rozwiaz(w, dane[zrodloStore] || [], zrodloPole);
          if (!zrodlo) {
            spozaBazy.push({ store, rec, opis: String(w) });
            continue;
          }
          if (zrodloStore === store && zrodlo.id === rec.id) continue;
          wynik.push({ cel: { store, rec }, zrodlo: { store: zrodloStore, rec: zrodlo }, prefiks });
        }
      }
    }
    return { wynik, spozaBazy };
  }

  function napiecieKabla(p) {
    const { store, rec } = p.zrodlo;
    if (store === 'rozdzielnie') return kv(rec.r_napiecie) ?? 6;
    if (store === 'poleRozdzielcze') {
      const r = rozwiaz(rec.miejsce_zabudowy, dane.rozdzielnie, 'nazwa_r');
      return kv(r?.r_napiecie) ?? 6;
    }
    if (store === 'transformatory') {
      const czesci = String(rec.t_napiecie || '').split('/').slice(1).map((x) => kv(x)).filter((x) => x !== null);
      return czesci.length ? Math.max(...czesci) : 1;
    }
    return kv(p.cel.rec.nap_zas) ?? kv(rec.nap_zas) ?? 1;
  }

  function opisKabla(rec, prefiks) {
    const dl = num(rec[`${prefiks}_dlugosc`]);
    return [rec[`${prefiks}_nr`], rec[`${prefiks}_typ`], rec[`${prefiks}_przekroj`], dl !== null && dl !== 0 ? `${dl} m` : '']
      .filter(Boolean)
      .join(' ');
  }

  const maOpisKabla = (rec, prefiks) => ['typ', 'przekroj', 'dlugosc', 'nr'].some((k) => rec[`${prefiks}_${k}`] !== undefined && rec[`${prefiks}_${k}`] !== '' && rec[`${prefiks}_${k}`] !== 0);

  // ---------- symbole ----------

  function symbol(typ, x, y, obwodka) {
    const st = `stroke="${obwodka}" stroke-width="3"`;
    if (typ === 'rozdzielnia') return `<rect x="${x - 24}" y="${y - 17}" width="48" height="34" rx="7" fill="#b3d495" ${st}/>`;
    if (typ === 'pole') return `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" fill="#ffffff" stroke="${obwodka}" stroke-width="2"/>`;
    if (typ === 'transformator') return `<circle cx="${x}" cy="${y - 8}" r="11" fill="#ffffff" ${st}/><circle cx="${x}" cy="${y + 8}" r="11" fill="none" ${st}/>`;
    if (typ === 'naped') return `<rect x="${x - 11}" y="${y - 11}" width="22" height="22" transform="rotate(45 ${x} ${y})" fill="#777777" ${st}/>`;
    if (typ === 'kombajn') {
      const pkt = [];
      for (let i = 0; i < 10; i += 1) {
        const r = i % 2 === 0 ? 16 : 7;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        pkt.push(`${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`);
      }
      return `<polygon points="${pkt.join(' ')}" fill="#111111" ${st}/>`;
    }
    return `<rect x="${x - 11}" y="${y - 11}" width="22" height="22" fill="#1fa31f" ${st}/>`;
  }

  const ROZMIAR = { rozdzielnia: [26, 19], transformator: [13, 21], naped: [16, 16], kombajn: [17, 17], pole: [7, 7], urzadzenie: [13, 13] };

  // ---------- rysowanie ----------

  function rysuj(v = widok, opcje = {}) {
    const szer = opcje.szer || wrapEl.clientWidth || 800;
    const wys = opcje.wys || Math.max(460, wrapEl.clientHeight || 560);
    const czesci = { chodniki: [], przenosniki: [], kable: [], obiekty: [], opisy: [] };
    const zajete = []; // prostokąty opisów i symboli — proste unikanie nachodzenia
    const poz = {};

    const zajmij = (x1, y1, x2, y2) => zajete.push({ x1, y1, x2, y2 });
    const koliduje = (b) => zajete.some((z) => b.x1 < z.x2 && b.x2 > z.x1 && b.y1 < z.y2 && b.y2 > z.y1);
    function opis(x, y, tekst, { rx = 13, ry = 13, rozmiar = 12, kolor = KOLOR.tekst, grupa = 'opisy', wazny = false } = {}) {
      if (!tekst) return;
      const w = tekst.length * rozmiar * 0.56;
      const h = rozmiar + 2;
      const kandydaci = [
        { x: x + rx + 4, y: y + rozmiar * 0.35, a: 'start' },
        { x: x - rx - 4, y: y + rozmiar * 0.35, a: 'end' },
        { x, y: y - ry - 6, a: 'middle' },
        { x, y: y + ry + rozmiar + 2, a: 'middle' },
        { x: x + rx + 4, y: y - ry, a: 'start' },
        { x: x + rx + 4, y: y + ry + rozmiar, a: 'start' },
      ];
      const pudlo = (k) => {
        const x1 = k.a === 'start' ? k.x : k.a === 'end' ? k.x - w : k.x - w / 2;
        return { x1, y1: k.y - rozmiar, x2: x1 + w, y2: k.y - rozmiar + h };
      };
      const wybrany = kandydaci.find((k) => !koliduje(pudlo(k))) || kandydaci[0];
      const b = pudlo(wybrany);
      zajmij(b.x1, b.y1, b.x2, b.y2);
      czesci[grupa].push(`<text x="${wybrany.x.toFixed(1)}" y="${wybrany.y.toFixed(1)}" text-anchor="${wybrany.a}" font-size="${rozmiar}" font-family="Arial, sans-serif" fill="${kolor}"${wazny ? ' font-weight="bold"' : ''} paint-order="stroke" stroke="#ffffff" stroke-width="3" stroke-linejoin="round">${esc(tekst)}</text>`);
    }

    // chodniki
    for (const [id, g] of geo) {
      const a = naEkran({ x: g.x0, y: g.y0 }, v);
      const b = naEkran({ x: g.x0 + g.dx * g.len, y: g.y0 + g.dy * g.len }, v);
      czesci.chodniki.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${KOLOR.chodnikBrzeg}" stroke-width="16" stroke-linecap="round"/><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${KOLOR.chodnik}" stroke-width="13" stroke-linecap="round" data-chodnik="${id}"/>`);
      if (g.rec.ch_w_drazeniu === 'tak') {
        const k = 26;
        const c = { x: b.x + g.dx * 6, y: b.y + g.dy * 6 };
        czesci.chodniki.push(`<line x1="${c.x - g.dx * k}" y1="${c.y - g.dy * k}" x2="${c.x + g.dx * 14}" y2="${c.y + g.dy * 14}" stroke="${KOLOR.linia}" stroke-width="3" marker-end="url(#plan-strzalka)"/>`);
      }
    }

    // obiekty z położeniem (kolejność: rozdzielnie, transformatory, urządzenia, KB)
    const stos = {};
    for (const def of OBIEKTY) {
      for (const rec of dane[def.store] || []) {
        const lok = lokalizacja(def.store, rec);
        if (!lok || !geo.has(lok.ch)) continue;
        const g = geo.get(lok.ch);
        const p = naEkran(punktM(lok.ch, lok.m), v);
        const znak = lok.strona === 'prawa' ? 1 : lok.strona === 'oś' ? 0 : -1;
        const klucz = `${lok.ch}:${Math.round(lok.m / 8)}:${znak}`;
        const k = stos[klucz] || 0;
        stos[klucz] = k + 1;
        let x;
        let y;
        if (znak === 0) {
          x = p.x + g.dx * 30 * k;
          y = p.y + g.dy * 30 * k;
        } else {
          const odl = 46 + 32 * k;
          x = p.x + znak * g.nx * odl;
          y = p.y + znak * g.ny * odl;
        }
        x += num(rec.plan_dx) || 0;
        y += num(rec.plan_dy) || 0;
        poz[`${def.store}:${rec.id}`] = { x, y, lok, def, rec };
      }
    }
    // pola rozdzielcze — rząd kwadracików przy swojej rozdzielni
    const polaRozdz = {};
    for (const pole of dane.poleRozdzielcze || []) {
      const r = rozwiaz(pole.miejsce_zabudowy, dane.rozdzielnie, 'nazwa_r');
      const pr = r && poz[`rozdzielnie:${r.id}`];
      if (!pr) continue;
      const i = polaRozdz[r.id] || 0;
      polaRozdz[r.id] = i + 1;
      poz[`poleRozdzielcze:${pole.id}`] = { x: pr.x - 18 + i * 16, y: pr.y + 28, lok: pr.lok, rec: pole, def: { store: 'poleRozdzielcze', symbol: 'pole', label: 'Pole rozdzielcze', title: 'p_nazwa' } };
    }
    // napędy przenośników
    for (const pr of dane.przenosniki || []) {
      const lok = lokalizacja('przenosniki', pr);
      if (!lok || !geo.has(lok.ch)) continue;
      const p = naEkran(punktM(lok.ch, lok.m), v);
      poz[`przenosniki:${pr.id}`] = { x: p.x + (num(pr.plan_dx) || 0), y: p.y + (num(pr.plan_dy) || 0), lok, rec: pr, def: { store: 'przenosniki', symbol: 'naped', label: 'Przenośnik / napęd', title: 'pr_nr' } };
    }

    // zarezerwuj miejsca symboli, zanim rozmieścimy opisy
    for (const p of Object.values(poz)) {
      const [rx, ry] = ROZMIAR[p.def.symbol] || [12, 12];
      zajmij(p.x - rx, p.y - ry, p.x + rx, p.y + ry);
    }

    // przenośniki — linia na osi chodnika
    for (const pr of dane.przenosniki || []) {
      const ch = rozwiaz(pr.pr_chodnik, dane.chodniki, 'ch_nazwa');
      if (!ch || !geo.has(ch.id)) continue;
      const g = geo.get(ch.id);
      const a = naEkran(punktM(ch.id, num(pr.pr_od_m) ?? 0), v);
      const b = naEkran(punktM(ch.id, num(pr.pr_do_m) ?? g.len), v);
      czesci.przenosniki.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${KOLOR.linia}" stroke-width="3.5"/>`);
    }

    // kable
    const { wynik: pol, spozaBazy } = polaczenia();
    const kable = [];
    const opisyKabli = []; // rozmieszczane PO opisach urządzeń — te mają pierwszeństwo
    let pas = 0;
    for (const p of pol) {
      const a = poz[`${p.zrodlo.store}:${p.zrodlo.rec.id}`];
      const b = poz[`${p.cel.store}:${p.cel.rec.id}`];
      if (!a || !b) {
        kable.push({ ...p, narysowany: false });
        continue;
      }
      const kolor = napiecieKabla(p) >= 3 ? KOLOR.kabelSN : KOLOR.kabelNN;
      const odsun = -(12 + 4.5 * (pas % 7));
      pas += 1;
      let punkty = [{ x: a.x, y: a.y }];
      const t = a.lok && b.lok ? trasa(a.lok, b.lok) : null;
      if (t) {
        for (const q of t) {
          const g = geo.get(q.ch);
          const s = naEkran(punktM(q.ch, q.m), v);
          punkty.push({ x: s.x + g.nx * odsun, y: s.y + g.ny * odsun });
        }
      }
      punkty.push({ x: b.x, y: b.y });
      punkty = punkty.filter((q, i) => i === 0 || Math.hypot(q.x - punkty[i - 1].x, q.y - punkty[i - 1].y) > 0.5);
      const idKabla = `${p.cel.store}:${p.cel.rec.id}:${p.prefiks}`;
      czesci.kable.push(`<polyline points="${punkty.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${kolor}" stroke-width="2.2" stroke-dasharray="8 4" stroke-linejoin="round"/><polyline points="${punkty.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}" fill="none" stroke="transparent" stroke-width="12" data-kabel="${esc(idKabla)}" class="plan-klik"/>`);
      if (warstwy.opisyKabli) {
        let naj = 0;
        let s = [punkty[0], punkty[1] || punkty[0]];
        for (let i = 1; i < punkty.length; i += 1) {
          const d = Math.hypot(punkty[i].x - punkty[i - 1].x, punkty[i].y - punkty[i - 1].y);
          if (d > naj) { naj = d; s = [punkty[i - 1], punkty[i]]; }
        }
        const tekst = maOpisKabla(p.cel.rec, p.prefiks) ? opisKabla(p.cel.rec, p.prefiks) : '? kabel';
        opisyKabli.push([(s[0].x + s[1].x) / 2, (s[0].y + s[1].y) / 2, tekst, { rx: 2, ry: 4, rozmiar: 10, kolor, grupa: 'kable' }]);
      }
      kable.push({ ...p, narysowany: true, id: idKabla });
    }
    ostatnieKable = kable;

    // symbole obiektów + opisy
    for (const [klucz, p] of Object.entries(poz)) {
      const { rec, def } = p;
      if (def.store === 'przenosniki' && !warstwy.przenosniki) continue;
      if (def.store !== 'przenosniki' && !warstwy.obiekty) continue;
      const obw = warstwy.zrodlo ? KOLOR.zrodlo[rec.zrodlo_danych || ''] || KOLOR.zrodlo[''] : KOLOR.linia;
      czesci.obiekty.push(`<g data-obiekt="${esc(klucz)}" class="plan-klik">${symbol(def.symbol, p.x, p.y, obw)}</g>`);
      if (def.store === 'poleRozdzielcze') continue;
      const [rx, ry] = ROZMIAR[def.symbol] || [12, 12];
      const tytul = def.store === 'przenosniki' ? [rec.pr_typ, rec.pr_nr].filter(Boolean).join(' ') : rec[def.title];
      opis(p.x, p.y, tytul || '(bez nazwy)', { rx, ry, wazny: def.store === 'rozdzielnie' || def.store === 'kb' });
    }

    for (const args of opisyKabli) opis(...args);

    // nazwy chodników
    if (warstwy.chodniki) {
      for (const g of geo.values()) {
        const srodek = naEkran({ x: g.x0 + (g.dx * g.len) / 2, y: g.y0 + (g.dy * g.len) / 2 }, v);
        opis(srodek.x, srodek.y, g.rec.ch_nazwa + (g.brakDanych ? ' ⚠' : ''), { rx: 10, ry: 12, rozmiar: 11, kolor: '#5b6874' });
      }
    }

    const svg = `
      <defs>
        <marker id="plan-strzalka" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${KOLOR.linia}"/></marker>
      </defs>
      <rect x="0" y="0" width="${szer}" height="${wys}" fill="#ffffff" data-tlo="1"/>
      ${czesci.chodniki.join('')}
      ${warstwy.przenosniki ? czesci.przenosniki.join('') : ''}
      ${warstwy.kable ? czesci.kable.join('') : ''}
      ${czesci.obiekty.join('')}
      ${czesci.opisy.join('')}
    `;
    return { svg, szer, wys, poz, kable, spozaBazy };
  }

  function render() {
    if (!(dane.chodniki || []).length) {
      svgEl.innerHTML = '';
      svgEl.setAttribute('width', 0);
      svgEl.setAttribute('height', 0);
      wrapEl.classList.add('hidden');
      legendaEl.innerHTML = '';
      brakiEl.innerHTML = `
        <div class="plan-pusty">
          <p><b>Plan rejonu jest pusty.</b> Plan rysuje się z zakładki Rejon → <b>Chodniki</b> (skąd chodnik wychodzi, w którą stronę i jak długi) oraz z położenia urządzeń w chodnikach (pola „Położenie na planie rejonu” w formularzach).</p>
          <p>Kolejność: 1) dodaj chodniki, 2) przy rozdzielniach, transformatorach, urządzeniach i KB wpisz chodnik i metraż (albo postaw je tu kliknięciem), 3) dodaj przenośniki, 4) uzupełnij kable w formularzach obiektów zasilanych.</p>
          <button type="button" class="btn-primary" data-akcja="przyklad">Wczytaj przykładowy rejon (AM-1), żeby zobaczyć, jak to działa</button>
        </div>`;
      return;
    }
    wrapEl.classList.remove('hidden');
    const szer = wrapEl.clientWidth || 800;
    const maksWys = Math.max(360, Math.round(window.innerHeight * 0.72));
    if (!widok.dopasowany) {
      // wysokość dobrana do kształtu rejonu (wąski telefon + "płaski" rejon = niski plan, bez pustego pasa)
      dopasuj(szer, maksWys);
      const o = obszarSwiata();
      const potrzebna = (o.maxY - o.minY) * widok.s + 2 * Math.max(36, Math.min(110, szer * 0.12));
      widok.wys = Math.round(Math.min(maksWys, Math.max(360, potrzebna)));
      dopasuj(szer, widok.wys);
      widok.dopasowany = true;
    }
    const wys = widok.wys || maksWys;
    const w = rysuj(widok, { szer, wys });
    pozycje = w.poz;
    svgEl.setAttribute('width', szer);
    svgEl.setAttribute('height', wys);
    svgEl.setAttribute('viewBox', `0 0 ${szer} ${wys}`);
    svgEl.innerHTML = w.svg;
    renderBaner();
    renderLegenda();
    renderBraki(w);
  }

  function renderBaner() {
    const przyklad = Object.values(dane).some((lista) => (lista || []).some((r) => r._przyklad === MARKER_PRZYKLADU));
    banerEl.classList.toggle('hidden', !przyklad);
    banerEl.innerHTML = przyklad
      ? `Na planie są <b>dane przykładowe</b> (rejon AM-1 ze wzoru). Nie mieszaj ich z prawdziwymi. <button type="button" class="btn-small btn-danger" data-akcja="usun-przyklad">Usuń przykład</button>`
      : '';
  }

  function renderLegenda() {
    const pozycja = (typ, tekst) => `<span class="plan-leg"><svg width="34" height="34" viewBox="0 0 34 34">${symbol(typ, 17, 17, KOLOR.linia)}</svg>${tekst}</span>`;
    legendaEl.innerHTML = `
      ${pozycja('rozdzielnia', 'Rozdzielnia')}
      ${pozycja('pole', 'Pole rozdzielcze')}
      ${pozycja('transformator', 'Transformator')}
      ${pozycja('urzadzenie', 'Urządzenie')}
      ${pozycja('naped', 'Napęd nr')}
      ${pozycja('kombajn', 'Kombajn / KB')}
      <span class="plan-leg"><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke="${KOLOR.kabelSN}" stroke-width="2.2" stroke-dasharray="8 4"/></svg>Kabel SN (6 kV)</span>
      <span class="plan-leg"><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke="${KOLOR.kabelNN}" stroke-width="2.2" stroke-dasharray="8 4"/></svg>Kabel nn (1 / 0,5 kV)</span>
      <span class="plan-leg"><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke="${KOLOR.linia}" stroke-width="3.5"/></svg>Przenośnik</span>
      ${warstwy.zrodlo ? `<span class="plan-leg">Obwódka: <b style="color:${KOLOR.zrodlo.Excel}">Excel</b> · <b style="color:${KOLOR.zrodlo['ręcznie']}">ręcznie</b> · <b style="color:${KOLOR.zrodlo.pomiar}">pomiar</b> · <b style="color:${KOLOR.zrodlo['']}">nie podano</b></span>` : ''}
    `;
  }

  function renderBraki(w) {
    const bezPolozenia = [];
    for (const def of OBIEKTY) {
      for (const rec of dane[def.store] || []) {
        if (!w.poz[`${def.store}:${rec.id}`]) bezPolozenia.push({ def, rec });
      }
    }
    const przenBez = (dane.przenosniki || []).filter((r) => !w.poz[`przenosniki:${r.id}`]);
    const bezKabla = w.kable.filter((k) => !maOpisKabla(k.cel.rec, k.prefiks));
    const niewidoczne = w.kable.filter((k) => !k.narysowany);
    const chodnikiBraki = [...geo.values()].filter((g) => g.brakDanych);
    const nazwa = (store, rec) => {
      const d = OBIEKTY.find((o) => o.store === store);
      if (store === 'przenosniki') return `przenośnik ${rec.pr_nr}`;
      if (store === 'poleRozdzielcze') return `pole ${rec.p_nazwa}`;
      return `${d ? d.label.toLowerCase() : store} ${rec[d ? d.title : 'id'] ?? ''}`;
    };
    const blok = (tytul, lista) => (lista.length ? `<details class="plan-brak" ${lista.length <= 6 ? 'open' : ''}><summary>${tytul} (${lista.length})</summary><ul>${lista.join('')}</ul></details>` : '');

    brakiEl.innerHTML = [
      blok('Bez położenia na planie', bezPolozenia.map(({ def, rec }) => `<li>${esc(nazwa(def.store, rec))} <button type="button" class="btn-small" data-postaw="${def.store}:${rec.id}">Postaw na planie</button> <button type="button" class="btn-small" data-edytuj="${def.store}:${rec.id}">Edytuj</button></li>`)),
      blok('Przenośniki bez chodnika', przenBez.map((rec) => `<li>${esc(nazwa('przenosniki', rec))} <button type="button" class="btn-small" data-edytuj="przenosniki:${rec.id}">Edytuj</button></li>`)),
      blok('Połączenia bez opisu kabla', bezKabla.map((k) => `<li>${esc(nazwa(k.zrodlo.store, k.zrodlo.rec))} → ${esc(nazwa(k.cel.store, k.cel.rec))}${k.prefiks === 'kabel_rez' ? ' (rezerwowe)' : ''} <button type="button" class="btn-small" data-edytuj="${k.cel.store}:${k.cel.rec.id}">Uzupełnij kabel</button></li>`)),
      blok('Kable nienarysowane (jeden z końców bez położenia)', niewidoczne.map((k) => `<li>${esc(nazwa(k.zrodlo.store, k.zrodlo.rec))} → ${esc(nazwa(k.cel.store, k.cel.rec))}</li>`)),
      blok('Zasilanie wpisane tekstem, spoza bazy', w.spozaBazy.map((s) => `<li>${esc(nazwa(s.store, s.rec))}: „${esc(s.opis)}” <button type="button" class="btn-small" data-edytuj="${s.store}:${s.rec.id}">Edytuj</button></li>`)),
      blok('Chodniki bez kierunku lub długości (przyjęto 90° / 100 m)', chodnikiBraki.map((g) => `<li>${esc(g.rec.ch_nazwa)} <button type="button" class="btn-small" data-edytuj="chodniki:${g.rec.id}">Edytuj</button></li>`)),
    ].join('') || '<p class="field-hint">Wszystkie obiekty mają położenie, a połączenia — opis kabla.</p>';
  }

  // ---------- karta obiektu / kabla ----------

  function wartoscPola(f, rec) {
    const v = rec[f.key];
    if (f.type === 'fk-or-free') {
      if (typeof v === 'number') {
        const r = (dane[f.refStore] || []).find((x) => x.id === v);
        return r ? r[f.refField] : '';
      }
      return v || '';
    }
    if (f.type === 'sublist') return Array.isArray(v) ? v.map((w) => Object.values(w).filter(Boolean).join(' — ')).join('; ') : '';
    if (f.type === 'fk-multi') return Array.isArray(v) && v.length ? `${v.length} pozycji` : '';
    return v === 0 && f.blank ? '0' : v;
  }

  function pokazKarte(store, id, x, y) {
    const rec = (dane[store] || []).find((r) => r.id === id);
    const def = NADZOR_ENTITIES[store];
    if (!rec || !def) return;
    const wiersze = def.fields
      .filter((f) => f.type !== 'heading' && !f.key.startsWith('kabel'))
      .map((f) => [f.label, wartoscPola(f, rec)])
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
      .join('');
    const kabel = maOpisKabla(rec, 'kabel') ? `<p class="plan-karta-kabel">Kabel zasilający: ${esc(opisKabla(rec, 'kabel'))}${rec.kabel_odplyw ? ` (odpływ: ${esc(rec.kabel_odplyw)})` : ''}</p>` : '';
    otworzKarte(`
      <h4>${esc(def.labelSingular)}: ${esc(rec[def.titleField] || '')}</h4>
      <table>${wiersze}</table>
      ${kabel}
      <div class="form-actions">
        <button type="button" class="btn-small" data-edytuj="${store}:${id}">Edytuj</button>
        ${store !== 'poleRozdzielcze' && store !== 'przenosniki' ? `<button type="button" class="btn-small" data-postaw="${store}:${id}">Przestaw</button>` : ''}
        ${num(rec.plan_dx) || num(rec.plan_dy) ? `<button type="button" class="btn-small" data-reset="${store}:${id}">Cofnij przesunięcie</button>` : ''}
        <button type="button" class="btn-small" data-akcja="zamknij-karte">Zamknij</button>
      </div>`, x, y);
  }

  function pokazKarteKabla(idKabla, x, y) {
    const k = ostatnieKable.find((q) => q.id === idKabla);
    if (!k) return;
    const r = k.cel.rec;
    const p = k.prefiks;
    const nazwaZ = k.zrodlo.rec[NADZOR_ENTITIES[k.zrodlo.store].titleField];
    const nazwaDo = r[NADZOR_ENTITIES[k.cel.store].titleField];
    const dl = num(r[`${p}_dlugosc`]);
    otworzKarte(`
      <h4>Kabel ${esc(r[`${p}_nr`] || '')}</h4>
      <table>
        <tr><th>Skąd</th><td>${esc(nazwaZ)}${r[`${p}_odplyw`] ? ` — ${esc(r[`${p}_odplyw`])}` : ''}</td></tr>
        <tr><th>Dokąd</th><td>${esc(nazwaDo)}</td></tr>
        <tr><th>Napięcie</th><td>${esc(String(napiecieKabla(k)).replace('.', ','))} kV</td></tr>
        <tr><th>Typ</th><td>${esc(r[`${p}_typ`] || '—')}</td></tr>
        <tr><th>Przekrój</th><td>${esc(r[`${p}_przekroj`] || '—')}</td></tr>
        <tr><th>Długość</th><td>${dl ? `${dl} m` : '—'}</td></tr>
      </table>
      <div class="form-actions">
        <button type="button" class="btn-small" data-edytuj="${k.cel.store}:${r.id}">Edytuj kabel</button>
        <button type="button" class="btn-small" data-akcja="zamknij-karte">Zamknij</button>
      </div>`, x, y);
  }

  function otworzKarte(html, x, y) {
    kartaEl.innerHTML = html;
    kartaEl.classList.remove('hidden');
    const sw = wrapEl.clientWidth;
    kartaEl.style.left = `${Math.max(6, Math.min(x + 14, sw - 300))}px`;
    kartaEl.style.top = `${Math.max(6, y - 10)}px`;
  }

  const zamknijKarte = () => kartaEl.classList.add('hidden');

  // ---------- stawianie obiektu kliknięciem ----------

  function najblizszyChodnik(pkt) {
    let naj = null;
    for (const [id, g] of geo) {
      const vx = pkt.x - g.x0;
      const vy = pkt.y - g.y0;
      const t = Math.min(Math.max(vx * g.dx + vy * g.dy, 0), g.len);
      const px = g.x0 + g.dx * t;
      const py = g.y0 + g.dy * t;
      const d = Math.hypot(pkt.x - px, pkt.y - py);
      if (!naj || d < naj.d) {
        const strona = (pkt.x - px) * g.nx + (pkt.y - py) * g.ny;
        naj = { id, m: Math.round(t), d, strona: d * widok.s < 8 ? 'oś' : strona > 0 ? 'prawa' : 'lewa' };
      }
    }
    return naj;
  }

  function zacznijStawianie(store, id) {
    const rec = (dane[store] || []).find((r) => r.id === id);
    if (!rec) return;
    stawianie = { store, id };
    zamknijKarte();
    const def = NADZOR_ENTITIES[store];
    stawianieEl.innerHTML = `Kliknij na planie przy chodniku, gdzie stoi <b>${esc(rec[def.titleField])}</b> — metraż i strona wpiszą się same. <button type="button" class="btn-small" data-akcja="anuluj-stawianie">Anuluj</button>`;
    stawianieEl.classList.remove('hidden');
    wrapEl.classList.add('plan-tryb-stawiania');
    wrapEl.scrollIntoView({ block: 'nearest' });
  }

  function zakonczStawianie() {
    stawianie = null;
    stawianieEl.classList.add('hidden');
    wrapEl.classList.remove('plan-tryb-stawiania');
  }

  async function postaw(ekranX, ekranY) {
    const { store, id } = stawianie;
    const rec = (dane[store] || []).find((r) => r.id === id);
    const n = najblizszyChodnik(zEkranu({ x: ekranX, y: ekranY }));
    zakonczStawianie();
    if (!rec || !n) return;
    await nadzorUpdate(store, { ...rec, lok_chodnik: n.id, lok_metraz: n.m, lok_strona: n.strona, plan_dx: 0, plan_dy: 0 });
    await wczytajDane();
    render();
  }

  // ---------- przykładowy rejon (wzór AM-1) ----------

  async function wczytajPrzyklad() {
    const P = { _przyklad: MARKER_PRZYKLADU, zrodlo_danych: 'ręcznie' };
    const dodaj = (store, rec) => nadzorAdd(store, { ...P, ...rec });
    const ch1 = await dodaj('chodniki', { ch_nazwa: 'Chodnik 1', ch_azymut: 90, ch_dlugosc: 320, ch_w_drazeniu: 'nie' });
    const ch2 = await dodaj('chodniki', { ch_nazwa: 'Przecinka 2', ch_od_chodnika: ch1, ch_od_metraz: 320, ch_azymut: 180, ch_dlugosc: 150, ch_w_drazeniu: 'nie' });
    const ch3 = await dodaj('chodniki', { ch_nazwa: 'Chodnik 3', ch_od_chodnika: ch2, ch_od_metraz: 150, ch_azymut: 90, ch_dlugosc: 190, ch_w_drazeniu: 'nie' });
    const ch4 = await dodaj('chodniki', { ch_nazwa: 'Chodnik 4', ch_od_chodnika: ch3, ch_od_metraz: 190, ch_azymut: 180, ch_dlugosc: 140, ch_w_drazeniu: 'nie' });
    const ch5 = await dodaj('chodniki', { ch_nazwa: 'Chodnik 5 (przodek)', ch_od_chodnika: ch4, ch_od_metraz: 140, ch_azymut: 148, ch_dlugosc: 320, ch_w_drazeniu: 'tak' });
    const r = await dodaj('rozdzielnie', { nazwa_r: 'R-650', r_napiecie: '6 kV', lok_chodnik: ch1, lok_metraz: 0, lok_strona: 'lewa' });
    const p1 = await dodaj('poleRozdzielcze', { p_nazwa: 'R-650 pole 1', miejsce_zabudowy: r });
    const p2 = await dodaj('poleRozdzielcze', { p_nazwa: 'R-650 pole 2', miejsce_zabudowy: r });
    const k = (nr, przekroj, dl) => ({ kabel_nr: nr, kabel_przekroj: przekroj, kabel_dlugosc: dl });
    const t1 = await dodaj('transformatory', { t_nr: 'It3sb 340', t_napiecie: '6/1 kV', zasilany_z_pola: p1, lok_chodnik: ch1, lok_metraz: 190, lok_strona: 'lewa', ...k('K1', '3x50', 200) });
    const t2 = await dodaj('transformatory', { t_nr: 'Mar 439', t_napiecie: '6/1 kV', zasilany_z_pola: p2, lok_chodnik: ch4, lok_metraz: 80, lok_strona: 'lewa', ...k('K2', '3x50', 690) });
    const u = async (nazwa, zT, zU, ch, m, strona, kab) =>
      dodaj('urzadzenia', { nazwa, nap_zas: '1 kV', zasilane_z_transformatora: zT ?? '', zasilane_z_urzadzenia: zU ?? '', lok_chodnik: ch, lok_metraz: m, lok_strona: strona, ...(kab || {}) });
    const u1 = await u('WSN-40P/1', t1, null, ch2, 150, 'prawa', k('K3', '3x95', 290));
    const u2 = await u('BTH-125', t1, null, ch2, 150, 'prawa', k('K4', '3x70', 290));
    const u3 = await u('RE-22 (1.4)', t2, null, ch3, 190, 'lewa', k('K5', '3x35', 80));
    const u4 = await u('RE-22 (1.5)', t2, null, ch4, 140, 'lewa', k('K6', '3x35', 60));
    await u('ZT-145', t2, null, ch4, 140, 'lewa');
    const u6 = await u('WSN-100PD', t2, null, ch5, 110, 'prawa', k('K8', '3x120', 170));
    await u('HMC-BHO', null, u6, ch5, 140, 'prawa', k('K9', '3x35', 30));
    await u('OSWCA', null, u6, ch5, 170, 'prawa');
    await dodaj('kb', { typ_kb: 'przodkowy', kb_nazwa: 'AM-1', zasilany_z_transformatora: '', zasilany_z_urzadzenia: u6, silniki: [], czujniki: [], nastawy_zabezpieczen: [], lok_chodnik: ch5, lok_metraz: 320, lok_strona: 'oś', ...k('K10', '3x95', 210) });
    const prz = (nr, typ, ch, od, doM, zU, kab) => dodaj('przenosniki', { pr_nr: nr, pr_typ: typ, pr_chodnik: ch, pr_od_m: od, pr_do_m: doM, pr_naped_m: od, zasilany_z_urzadzenia: zU, ...(kab || {}) });
    await prz('1.1', 'Ptgm', ch1, 0, 320, u2, k('K11', '3x35', 160));
    await prz('1.2', 'Ptgm', ch2, 0, 150, u2, k('K12', '3x35', 150));
    await prz('1.3', 'Pt1000', ch3, 0, 190, u1);
    await prz('1.4', 'Ptgm', ch4, 0, 140, u3, k('K13', '3x35', 40));
    await prz('1.5', 'Mifama1100', ch5, 0, 300, u4, k('K14', '3x35', 15));
    widok.dopasowany = false;
    recznie = false;
  }

  async function usunPrzyklad() {
    for (const store of ['chodniki', 'przenosniki', 'rozdzielnie', 'poleRozdzielcze', 'transformatory', 'urzadzenia', 'kb']) {
      for (const rec of await nadzorGetAll(store)) {
        if (rec._przyklad === MARKER_PRZYKLADU) await nadzorDelete(store, rec.id);
      }
    }
    widok.dopasowany = false;
  }

  // ---------- druk / SVG ----------

  function svgDoPliku() {
    const szer = 1600;
    const wys = 1100;
    const v = dopasuj(szer, wys, { s: 1, tx: 0, ty: 0 });
    const w = rysuj(v, { szer, wys });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${szer}" height="${wys}" viewBox="0 0 ${szer} ${wys}">${w.svg}</svg>`;
  }

  function drukuj() {
    const svg = svgDoPliku();
    const okno = window.open('', '_blank');
    if (!okno) {
      alert('Przeglądarka zablokowała nowe okno. Użyj „Zapisz SVG” albo zezwól na wyskakujące okna.');
      return;
    }
    const data = new Date().toLocaleDateString('pl-PL');
    okno.document.write(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Plan rejonu ${data}</title>
      <style>@page{size:A3 landscape;margin:10mm}body{margin:0;font-family:Arial,sans-serif}svg{width:100%;height:auto}
      .leg{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12px;margin-top:6px}.leg span{display:inline-flex;align-items:center;gap:6px}h1{font-size:16px;margin:0 0 4px}</style></head>
      <body><h1>Plan rejonu — PROTEKTOR · ${data}</h1>${svg}<div class="leg">${legendaEl.innerHTML}</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    okno.document.close();
  }

  function zapiszSvg() {
    const blob = new Blob([svgDoPliku()], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plan-rejonu-${new Date().toISOString().slice(0, 10)}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- zdarzenia ----------

  function zoom(mnoznik, ox, oy) {
    recznie = true;
    const sx = ox ?? (wrapEl.clientWidth || 800) / 2;
    const sy = oy ?? (svgEl.clientHeight || 500) / 2;
    const nowe = Math.max(0.03, Math.min(widok.s * mnoznik, 20));
    const k = nowe / widok.s;
    widok.tx = sx - (sx - widok.tx) * k;
    widok.ty = sy - (sy - widok.ty) * k;
    widok.s = nowe;
    render();
  }

  container.addEventListener('click', async (e) => {
    const t = e.target.closest('button, [data-akcja]');
    if (!t) return;
    const akcja = t.dataset.akcja;
    if (akcja === 'zoom+') zoom(1.3);
    else if (akcja === 'zoom-') zoom(1 / 1.3);
    else if (akcja === 'dopasuj') { widok.dopasowany = false; recznie = false; render(); }
    else if (akcja === 'drukuj') drukuj();
    else if (akcja === 'svg') zapiszSvg();
    else if (akcja === 'zamknij-karte') zamknijKarte();
    else if (akcja === 'anuluj-stawianie') zakonczStawianie();
    else if (akcja === 'przyklad') {
      t.disabled = true;
      await wczytajPrzyklad();
      await wczytajDane();
      render();
    } else if (akcja === 'usun-przyklad') {
      if (!confirm('Usunąć wszystkie rekordy przykładowego rejonu (oznaczone jako przykład)? Twoje dane zostają.')) return;
      await usunPrzyklad();
      await wczytajDane();
      render();
    }
    if (t.dataset.edytuj && onEditRecord) {
      const [store, id] = t.dataset.edytuj.split(':');
      onEditRecord(store, Number(id));
    }
    if (t.dataset.postaw) {
      const [store, id] = t.dataset.postaw.split(':');
      zacznijStawianie(store, Number(id));
    }
    if (t.dataset.reset) {
      const [store, id] = t.dataset.reset.split(':');
      const rec = (dane[store] || []).find((r) => r.id === Number(id));
      if (rec) {
        await nadzorUpdate(store, { ...rec, plan_dx: 0, plan_dy: 0 });
        zamknijKarte();
        await wczytajDane();
        render();
      }
    }
  });

  container.querySelectorAll('[data-warstwa]').forEach((cb) => {
    cb.addEventListener('change', () => {
      warstwy[cb.dataset.warstwa] = cb.checked;
      render();
    });
  });

  function punktZdarzenia(e) {
    const r = svgEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  svgEl.addEventListener('pointerdown', (e) => {
    const p = punktZdarzenia(e);
    dotyki.set(e.pointerId, p);
    if (dotyki.size === 2) {
      const [a, b] = [...dotyki.values()];
      szczypanie = { d: Math.hypot(a.x - b.x, a.y - b.y), s: widok.s };
      przeciaganie = null;
      return;
    }
    const obiekt = e.target.closest('[data-obiekt]');
    const kabel = e.target.closest('[data-kabel]');
    przeciaganie = { start: p, ostatni: p, obiekt: obiekt?.dataset.obiekt || null, kabel: kabel?.dataset.kabel || null, ruszone: false };
    svgEl.setPointerCapture(e.pointerId);
  });

  svgEl.addEventListener('pointermove', (e) => {
    if (dotyki.has(e.pointerId)) dotyki.set(e.pointerId, punktZdarzenia(e));
    if (szczypanie && dotyki.size === 2) {
      const [a, b] = [...dotyki.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 10) zoom((szczypanie.s * (d / szczypanie.d)) / widok.s, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (!przeciaganie) return;
    const p = punktZdarzenia(e);
    const dx = p.x - przeciaganie.ostatni.x;
    const dy = p.y - przeciaganie.ostatni.y;
    if (!przeciaganie.ruszone && Math.hypot(p.x - przeciaganie.start.x, p.y - przeciaganie.start.y) < 5) return;
    przeciaganie.ruszone = true;
    przeciaganie.ostatni = p;
    if (przeciaganie.obiekt && !stawianie) {
      const [store, id] = przeciaganie.obiekt.split(':');
      const rec = (dane[store] || []).find((r) => r.id === Number(id));
      if (rec && store !== 'poleRozdzielcze') {
        rec.plan_dx = (num(rec.plan_dx) || 0) + dx;
        rec.plan_dy = (num(rec.plan_dy) || 0) + dy;
        render();
      }
    } else {
      recznie = true;
      widok.tx += dx;
      widok.ty += dy;
      render();
    }
  });

  const koniecDotyku = (e) => {
    dotyki.delete(e.pointerId);
    if (dotyki.size < 2) szczypanie = null;
  };
  svgEl.addEventListener('pointercancel', (e) => {
    koniecDotyku(e);
    przeciaganie = null;
  });
  svgEl.addEventListener('pointerup', async (e) => {
    koniecDotyku(e);
    const s = przeciaganie;
    przeciaganie = null;
    if (!s) return;
    const p = punktZdarzenia(e);
    if (s.ruszone) {
      if (s.obiekt && !stawianie) {
        const [store, id] = s.obiekt.split(':');
        const rec = (dane[store] || []).find((r) => r.id === Number(id));
        if (rec && store !== 'poleRozdzielcze') {
          const swiezy = (await nadzorGetAll(store)).find((r) => r.id === rec.id);
          if (swiezy) await nadzorUpdate(store, { ...swiezy, plan_dx: Math.round(rec.plan_dx), plan_dy: Math.round(rec.plan_dy) });
        }
      }
      return;
    }
    if (stawianie) {
      await postaw(p.x, p.y);
      return;
    }
    if (s.obiekt) {
      const [store, id] = s.obiekt.split(':');
      pokazKarte(store, Number(id), p.x, p.y);
    } else if (s.kabel) {
      pokazKarteKabla(s.kabel, p.x, p.y);
    } else {
      zamknijKarte();
    }
  });

  svgEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = punktZdarzenia(e);
    zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  }, { passive: false });

  window.addEventListener('resize', () => {
    if (container.closest('.hidden')) return;
    if (!recznie) widok.dopasowany = false; // np. obrót telefonu — dopasuj na nowo
    render();
  });

  async function init(opts = {}) {
    onEditRecord = opts.onEditRecord || null;
    await wczytajDane();
    render();
  }

  return { init, _test: { wczytajPrzyklad, usunPrzyklad, rysuj: () => rysuj(widok, { szer: 1000, wys: 700 }), dane: () => dane } };
}
