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
import { NADZOR_ENTITIES, U_RODZAJE } from './nadzor-entities.js';
import { KOLOR, kolorNapiecia, kv, symbolSvg, napiecieRekordu } from './symbole.js';

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
  poleRozdzielcze: [['zasilane_z_pola', 'poleRozdzielcze', 'p_nazwa', 'kabel']], // przelot 6 kV
  transformatory: [
    ['zasilany_z_pola', 'poleRozdzielcze', 'p_nazwa', 'kabel'],
    ['zasilany_z_transformatora', 'transformatory', 't_nr', 'kabel'], // przelot 6 kV
    ['zasilany_z_urzadzenia', 'urzadzenia', 'nazwa', 'kabel'], // aparat 6 kV
  ],
  urzadzenia: [
    ['zasilane_z_transformatora', 'transformatory', 't_nr', 'kabel'],
    ['zasilane_z_urzadzenia', 'urzadzenia', 'nazwa', 'kabel'],
    ['zasilane_z_pola', 'poleRozdzielcze', 'p_nazwa', 'kabel'], // aparat / pompa 6 kV
  ],
  kb: [
    ['zasilany_z_transformatora', 'transformatory', 't_nr', 'kabel'],
    ['zasilany_z_urzadzenia', 'urzadzenia', 'nazwa', 'kabel'],
  ],
  przenosniki: [['zasilany_z_urzadzenia', 'urzadzenia', 'nazwa', 'kabel']],
};

// Układ zasilania (03.11.2026, Piotr): pole zasila transformator albo inne pole (przelot 6 kV);
// transformator zasila wyłączniki / aparaty, nie bezpośrednio silniki; wyłącznik zasila kolejny
// wyłącznik, odbiornik, kombajn albo napęd przenośnika; odbiornik nie zasila niczego.
const jestOdbiornik = (rec) => String(rec?.u_rodzaj || '').startsWith('odbiornik');
// rodzaj -> kto może go zasilać: [pole FK, magazyn źródła, rodzaj źródła]
const ZRODLA_RODZAJU = {
  rozdzielnie: [['przelot', 'poleRozdzielcze', 'poleRozdzielcze']], // tworzy pole zasilające nowej rozdzielni
  poleRozdzielcze: [['zasilane_z_pola', 'poleRozdzielcze', 'poleRozdzielcze']],
  // transformator: z pola, z przelotu 6 kV innego transformatora albo (rzadko) z aparatu 6 kV
  transformatory: [['zasilany_z_pola', 'poleRozdzielcze', 'poleRozdzielcze'], ['zasilany_z_transformatora', 'transformatory', 'transformatory'], ['zasilany_z_urzadzenia', 'urzadzenia', 'wylacznik']],
  // wyłącznik / aparat: z transformatora, z innego wyłącznika albo (aparat 6 kV: SK, APST, APSPa — rzadko) z pola
  wylacznik: [['zasilane_z_transformatora', 'transformatory', 'transformatory'], ['zasilane_z_urzadzenia', 'urzadzenia', 'wylacznik'], ['zasilane_z_pola', 'poleRozdzielcze', 'poleRozdzielcze']],
  // odbiornik: z wyłącznika; odbiornik 6 kV (pompa odwadniania) wprost z pola
  odbiornik: [['zasilane_z_urzadzenia', 'urzadzenia', 'wylacznik'], ['zasilane_z_pola', 'poleRozdzielcze', 'poleRozdzielcze']],
  kb: [['zasilany_z_urzadzenia', 'urzadzenia', 'wylacznik']],
  przenosniki: [['zasilany_z_urzadzenia', 'urzadzenia', 'wylacznik']],
};
const DOMYSLNY_ODPLYW = { poleRozdzielcze: 'transformatory', transformatory: 'wylacznik', wylacznik: 'odbiornik' };

// Rodzaje elementów do dodania z planu: pole nazwy i napięcia (te same co w formularzach).
const NAP_URZ = { key: 'nap_zas', opcje: ['1 kV', '0,5 kV', '6 kV'] };
const RODZAJE = [
  { id: 'rozdzielnie', store: 'rozdzielnie', label: 'Rozdzielnia', krotko: 'Rozdzielnia', nazwa: 'nazwa_r', przyklad: 'np. R-650', nap: { key: 'r_napiecie', opcje: ['6 kV', '1 kV', '0,5 kV'] },
    zasilanyEtykieta: 'Zasilona z pola (przelot 6 kV)', uwaga: 'Przy zasilaniu z pola innej rozdzielni powstanie pole zasilające nowej rozdzielni z kablem przelotowym.' },
  { id: 'poleRozdzielcze', store: 'poleRozdzielcze', label: 'Pole rozdzielcze', krotko: 'Pole', nazwa: 'p_nazwa', przyklad: 'np. R-650 pole 3',
    zasilanyEtykieta: 'Zasilane z pola (przelot 6 kV)', uwaga: 'Pole zasila transformatory, rzadko aparat 6 kV (SK, APST, APSPa) albo pompę 6 kV; przelotem — pole innej rozdzielni (każda rozdzielnia ma dwa pola zasilające).' },
  { id: 'transformatory', store: 'transformatory', label: 'Transformator', krotko: 'Transformator', nazwa: 't_nr', przyklad: 'np. It3sb 340', nap: { key: 't_napiecie', opcje: ['6/1 kV', '6/0,5 kV', '6/0,5/1 kV'] },
    zasilanyEtykieta: 'Zasilany z pola', uwaga: 'Transformator zasilany z pola, z przelotu 6 kV innego transformatora albo z aparatu 6 kV; zasila wyłączniki / aparaty i przelotem kolejne transformatory.' },
  { id: 'wylacznik', store: 'urzadzenia', label: 'Wyłącznik / aparat (WSN, BTH, OSW…)', krotko: 'Wyłącznik', nazwa: 'nazwa', przyklad: 'np. WSN-40P/1', nap: NAP_URZ, stale: { u_rodzaj: U_RODZAJE[0] },
    zasilanyEtykieta: 'Zasilany z', uwaga: 'Wyłącznik zasilany z transformatora albo z innego wyłącznika; zasila odbiorniki, kombajn i napędy.' },
  { id: 'odbiornik', store: 'urzadzenia', label: 'Odbiornik (silnik, pompa, wentylator…)', krotko: 'Odbiornik', nazwa: 'nazwa', przyklad: 'np. pompa PH-1', nap: NAP_URZ, stale: { u_rodzaj: U_RODZAJE[1] },
    zasilanyEtykieta: 'Zasilany z wyłącznika', uwaga: 'Odbiornik zasilany z wyłącznika — nie bezpośrednio z transformatora.' },
  { id: 'kb', store: 'kb', label: 'Kombajn / KB', krotko: 'Kombajn', nazwa: 'kb_nazwa', przyklad: 'np. AM-1',
    zasilanyEtykieta: 'Zasilany z wyłącznika', uwaga: 'Kombajn zasilany z wyłącznika.' },
  { id: 'przenosniki', store: 'przenosniki', label: 'Przenośnik / napęd', krotko: 'Przenośnik', nazwa: 'pr_nr', przyklad: 'np. 1.6',
    zasilanyEtykieta: 'Napęd zasilany z wyłącznika', uwaga: 'Napęd przenośnika zasilany z wyłącznika.' },
];
// Znacznik napiecia przy kablu: 6 kV / 1 kV / 0,5 kV
const znacznikNapiecia = (kV) => (kV === null || kV === undefined ? '' : `${String(+Number(kV).toFixed(2)).replace('.', ',')} kV`);

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

export function createPlanView(containerId) {
  const container = document.getElementById(containerId);
  let onEditRecord = null;
  let dane = {};
  let geo = new Map(); // chodnik.id -> geometria w metrach
  let widok = { s: 1.6, tx: 40, ty: 60, dopasowany: false }; // px = m * s + t
  // 03.11.2026: wielkość symboli (Piotr: "nieczytelne, zmniejsz ikony") — domyślnie średnie (0,65 dawnych)
  const SKALE = { male: 0.5, srednie: 0.65, duze: 0.9 };
  let wielkosc = 'srednie';
  try { wielkosc = localStorage.getItem('protektor-plan-symbole') || 'srednie'; } catch {}
  if (!SKALE[wielkosc]) wielkosc = 'srednie';
  const sk = () => SKALE[wielkosc];
  const WARSTWY_DOMYSLNE = { chodniki: true, przenosniki: true, obiekty: true, daneObiektow: true, kable: true, napiecieKabli: true, opisyKabli: true, zrodlo: false };
  let warstwy = { ...WARSTWY_DOMYSLNE };
  try { Object.assign(warstwy, JSON.parse(localStorage.getItem('protektor-plan-warstwy') || '{}')); } catch {}
  const zaznacz = (k) => (warstwy[k] ? 'checked' : '');
  let stawianie = null; // { store, id } — tryb "kliknij na chodniku"
  let pozycje = {}; // `${store}:${id}` -> { x, y } (px, ekran)
  let ostatnieKable = [];
  let przeciaganie = null;
  let recznie = false; // user przesunął/przybliżył — nie dopasowuj sam przy zmianie rozmiaru
  const dotyki = new Map(); // pointerId -> punkt (przybliżanie dwoma palcami)
  let szczypanie = null;

  container.innerHTML = `
    <div class="plan-toolbar">
      <button type="button" class="btn-small btn-primary" data-akcja="dodaj-element">+ Dodaj element</button>
      <button type="button" class="btn-small" data-akcja="zoom-" aria-label="Pomniejsz">−</button>
      <span class="plan-zoom" id="plan-zoom" title="Przybliżenie względem dopasowania">100%</span>
      <button type="button" class="btn-small" data-akcja="zoom+" aria-label="Powiększ">+</button>
      <button type="button" class="btn-small" data-akcja="dopasuj">Dopasuj</button>
      <button type="button" class="btn-small" data-akcja="pelny" id="plan-pelny-btn">⛶ Pełny ekran</button>
      <label class="plan-wielkosc">Symbole
        <select data-akcja-wielkosc="1">
          <option value="male" ${wielkosc === 'male' ? 'selected' : ''}>małe</option>
          <option value="srednie" ${wielkosc === 'srednie' ? 'selected' : ''}>średnie</option>
          <option value="duze" ${wielkosc === 'duze' ? 'selected' : ''}>duże</option>
        </select>
      </label>
      <button type="button" class="btn-small" data-akcja="drukuj">Drukuj / PDF</button>
      <button type="button" class="btn-small" data-akcja="svg">Zapisz SVG</button>
      <details class="plan-warstwy">
        <summary class="btn-small">☰ Warstwy — co pokazać</summary>
        <label><input type="checkbox" data-warstwa="chodniki" ${zaznacz('chodniki')}> Chodniki i ich nazwy</label>
        <label><input type="checkbox" data-warstwa="przenosniki" ${zaznacz('przenosniki')}> Przenośniki i napędy</label>
        <label><input type="checkbox" data-warstwa="obiekty" ${zaznacz('obiekty')}> Urządzenia (symbole i nazwy)</label>
        <label><input type="checkbox" data-warstwa="daneObiektow" ${zaznacz('daneObiektow')}> Dane urządzeń (napięcie, moc, typ)</label>
        <label><input type="checkbox" data-warstwa="kable" ${zaznacz('kable')}> Kable (linie)</label>
        <label><input type="checkbox" data-warstwa="napiecieKabli" ${zaznacz('napiecieKabli')}> Znaczniki napięcia kabli (6 kV / 1 kV / 0,5 kV)</label>
        <label><input type="checkbox" data-warstwa="opisyKabli" ${zaznacz('opisyKabli')}> Opisy kabli (nr, typ, przekrój, długość)</label>
        <label><input type="checkbox" data-warstwa="zrodlo" ${zaznacz('zrodlo')}> Źródło danych (kolor obrysu)</label>
      </details>
    </div>
    <div id="plan-baner" class="plan-baner hidden"></div>
    <div id="plan-stawianie" class="plan-stawianie hidden"></div>
    <form id="plan-dodaj" class="plan-dodaj hidden" autocomplete="off"></form>
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
  const dodajEl = container.querySelector('#plan-dodaj');
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
    if (v === widok) widok.sFit = v.s;
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
      // przelot 6 kV (do transformatora albo aparatu 6 kV) idzie stroną pierwotną
      const wszystkie = String(rec.t_napiecie || '').split('/').map((x) => kv(x));
      if (p.cel.store === 'transformatory' || (kv(p.cel.rec.nap_zas) ?? 0) >= 3) return wszystkie[0] ?? 6;
      const czesci = wszystkie.slice(1).filter((x) => x !== null);
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

  const napiecieObiektu = (store, rec) => napiecieRekordu(store, rec, dane.rozdzielnie || []);
  const symbol = (typ, x, y, obwodka, k = sk(), nap = [null, null]) => symbolSvg(typ, x, y, obwodka, k, nap);

  // Krótkie dane pod nazwą obiektu (warstwa "Dane urządzeń")
  function daneObiektu(store, rec) {
    const kw = (v, j) => (num(v) ? `${num(v)} ${j}` : '');
    if (store === 'rozdzielnie') return [rec.r_napiecie, rec.r_typ].filter(Boolean).join(' · ');
    if (store === 'transformatory') return [rec.t_typ, rec.t_napiecie, kw(rec.t_moc, 'kVA')].filter(Boolean).join(' · ');
    if (store === 'urzadzenia') return [rec.nap_zas, kw(rec.moc, 'kW')].filter(Boolean).join(' · ');
    if (store === 'kb') return [rec.typ_kb, rec.nap_zas].filter(Boolean).join(' · ');
    if (store === 'przenosniki') return kw(rec.pr_moc, 'kW');
    return '';
  }

  const ROZMIAR_BAZOWY = { rozdzielnia: [24, 15], transformator: [11, 17], naped: [11, 11], kombajn: [20, 10], pole: [7, 7], urzadzenie: [13, 9] };
  const rozmiarSymbolu = (typ) => (ROZMIAR_BAZOWY[typ] || [12, 12]).map((v) => v * sk());

  // ---------- rysowanie ----------

  function rysuj(v = widok, opcje = {}) {
    const szer = opcje.szer || wrapEl.clientWidth || 800;
    const wys = opcje.wys || Math.max(460, wrapEl.clientHeight || 560);
    const czesci = { chodniki: [], przenosniki: [], kable: [], obiekty: [], opisy: [] };
    const zajete = []; // prostokąty opisów i symboli — proste unikanie nachodzenia
    const poz = {};

    const zajmij = (x1, y1, x2, y2) => zajete.push({ x1, y1, x2, y2 });
    const koliduje = (b) => zajete.some((z) => b.x1 < z.x2 && b.x2 > z.x1 && b.y1 < z.y2 && b.y2 > z.y1);
    function opis(x, y, tekst, { rx = 13, ry = 13, rozmiar = Math.round(9 + 3 * sk()), kolor = KOLOR.tekst, grupa = 'opisy', wazny = false } = {}) {
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
      return { ...wybrany, rozmiar };
    }
    // druga linia pod opisem (dane urządzenia) — mniejsza, szara
    function podpis(pol, tekst) {
      if (!pol || !tekst) return;
      const r = Math.max(7, Math.round(pol.rozmiar * 0.82));
      const y = pol.y + r + 1;
      const w = tekst.length * r * 0.56;
      const x1 = pol.a === 'start' ? pol.x : pol.a === 'end' ? pol.x - w : pol.x - w / 2;
      zajmij(x1, y - r, x1 + w, y + 2);
      czesci.opisy.push(`<text x="${pol.x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${pol.a}" font-size="${r}" font-family="Arial, sans-serif" fill="#546e7a" paint-order="stroke" stroke="#ffffff" stroke-width="3" stroke-linejoin="round">${esc(tekst)}</text>`);
    }

    const pasChodnika = Math.max(6, Math.round(13 * sk()));
    // chodniki
    for (const [id, g] of geo) {
      const a = naEkran({ x: g.x0, y: g.y0 }, v);
      const b = naEkran({ x: g.x0 + g.dx * g.len, y: g.y0 + g.dy * g.len }, v);
      czesci.chodniki.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${KOLOR.chodnikBrzeg}" stroke-width="${pasChodnika + 3}" stroke-linecap="round"/><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${KOLOR.chodnik}" stroke-width="${pasChodnika}" stroke-linecap="round" data-chodnik="${id}"/>`);
      if (g.rec.ch_w_drazeniu === 'tak') {
        const k = 26 * sk();
        const c = { x: b.x + g.dx * 6, y: b.y + g.dy * 6 };
        czesci.chodniki.push(`<line x1="${c.x - g.dx * k}" y1="${c.y - g.dy * k}" x2="${c.x + g.dx * 14 * sk()}" y2="${c.y + g.dy * 14 * sk()}" stroke="${KOLOR.drazenie}" stroke-width="${Math.max(1.5, 3 * sk())}" marker-end="url(#plan-strzalka)"/>`);
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
          x = p.x + g.dx * 30 * sk() * k;
          y = p.y + g.dy * 30 * sk() * k;
        } else {
          const odl = pasChodnika / 2 + 30 * sk() + 6 + 32 * sk() * k;
          x = p.x + znak * g.nx * odl;
          y = p.y + znak * g.ny * odl;
        }
        x += num(rec.plan_dx) || 0;
        y += num(rec.plan_dy) || 0;
        poz[`${def.store}:${rec.id}`] = { x, y, lok, def: def.store === 'urzadzenia' && jestOdbiornik(rec) ? { ...def, symbol: 'naped' } : def, rec };
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
      poz[`poleRozdzielcze:${pole.id}`] = { x: pr.x - 18 * sk() + i * 16 * sk(), y: pr.y + 28 * sk(), lok: pr.lok, rec: pole, def: { store: 'poleRozdzielcze', symbol: 'pole', label: 'Pole rozdzielcze', title: 'p_nazwa' } };
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
      const [rx, ry] = rozmiarSymbolu(p.def.symbol);
      zajmij(p.x - rx, p.y - ry, p.x + rx, p.y + ry);
    }

    // przenośniki — linia na osi chodnika
    for (const pr of dane.przenosniki || []) {
      const ch = rozwiaz(pr.pr_chodnik, dane.chodniki, 'ch_nazwa');
      if (!ch || !geo.has(ch.id)) continue;
      const g = geo.get(ch.id);
      const a = naEkran(punktM(ch.id, num(pr.pr_od_m) ?? 0), v);
      const b = naEkran(punktM(ch.id, num(pr.pr_do_m) ?? g.len), v);
      const grub = 2 + 3 * sk();
      czesci.przenosniki.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${KOLOR.przenosnik}" stroke-width="${grub.toFixed(1)}" stroke-linecap="butt"/><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#ffffff" stroke-width="${(grub * 0.45).toFixed(1)}" stroke-dasharray="1.5 ${(7 * sk() + 4).toFixed(1)}"/>`);
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
      const napKabla = napiecieKabla(p);
      const kolor = kolorNapiecia(napKabla);
      const grubKabla = (napKabla >= 3 ? 1.6 : 1.1) + 1 * sk();
      const kreski = p.prefiks === 'kabel_rez' ? ' stroke-dasharray="7 4"' : '';
      const odsun = -(pasChodnika / 2 + 3 + 3.5 * (pas % 7));
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
      czesci.kable.push(`<polyline points="${punkty.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${kolor}" stroke-width="${grubKabla.toFixed(1)}"${kreski} stroke-linejoin="round"/><polyline points="${punkty.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}" fill="none" stroke="transparent" stroke-width="12" data-kabel="${esc(idKabla)}" class="plan-klik"/>`);
      if (warstwy.napiecieKabli || warstwy.opisyKabli) {
        let naj = 0;
        let s = [punkty[0], punkty[1] || punkty[0]];
        for (let i = 1; i < punkty.length; i += 1) {
          const d = Math.hypot(punkty[i].x - punkty[i - 1].x, punkty[i].y - punkty[i - 1].y);
          if (d > naj) { naj = d; s = [punkty[i - 1], punkty[i]]; }
        }
        // 03.11.2026: dwie warstwy — znacznik napięcia i opis kabla (nr, typ, przekrój, długość), każdą można wyłączyć
        const tekst = [warstwy.napiecieKabli ? znacznikNapiecia(napKabla) : '', warstwy.opisyKabli && maOpisKabla(p.cel.rec, p.prefiks) ? opisKabla(p.cel.rec, p.prefiks) : '']
          .filter(Boolean).join(' · ');
        if (tekst) opisyKabli.push([(s[0].x + s[1].x) / 2, (s[0].y + s[1].y) / 2, tekst, { rx: 2, ry: 4, rozmiar: Math.round(8 + 2 * sk()), kolor, grupa: 'kable' }]);
      }
      kable.push({ ...p, narysowany: true, id: idKabla });
    }
    ostatnieKable = kable;

    // symbole obiektów + opisy
    for (const [klucz, p] of Object.entries(poz)) {
      const { rec, def } = p;
      if (def.store === 'przenosniki' && !warstwy.przenosniki) continue;
      if (def.store !== 'przenosniki' && !warstwy.obiekty) continue;
      const obw = warstwy.zrodlo ? KOLOR.zrodlo[rec.zrodlo_danych || ''] || KOLOR.zrodlo[''] : KOLOR.obrys;
      czesci.obiekty.push(`<g data-obiekt="${esc(klucz)}" class="plan-klik">${symbol(def.symbol, p.x, p.y, obw, sk(), napiecieObiektu(def.store, rec))}</g>`);
      if (def.store === 'poleRozdzielcze') continue;
      const [rx, ry] = rozmiarSymbolu(def.symbol);
      const tytul = def.store === 'przenosniki' ? [rec.pr_typ, rec.pr_nr].filter(Boolean).join(' ') : rec[def.title];
      const pol = opis(p.x, p.y, tytul || '(bez nazwy)', { rx, ry, wazny: def.store === 'rozdzielnie' || def.store === 'kb' });
      if (warstwy.daneObiektow) podpis(pol, daneObiektu(def.store, rec));
    }

    for (const args of opisyKabli) opis(...args);

    // nazwy chodników
    if (warstwy.chodniki) {
      for (const g of geo.values()) {
        const srodek = naEkran({ x: g.x0 + (g.dx * g.len) / 2, y: g.y0 + (g.dy * g.len) / 2 }, v);
        opis(srodek.x, srodek.y, g.rec.ch_nazwa + (g.brakDanych ? ' ⚠' : ''), { rx: 10 * sk(), ry: 12 * sk(), rozmiar: Math.round(8.5 + 2.5 * sk()), kolor: KOLOR.tekstChodnika });
      }
    }

    const svg = `
      <defs>
        <marker id="plan-strzalka" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${KOLOR.drazenie}"/></marker>
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
    const pelny = container.classList.contains('plan-pelny');
    const maksWys = pelny
      ? Math.max(300, Math.round(window.innerHeight - wrapEl.getBoundingClientRect().top - 6))
      : Math.max(360, Math.round(window.innerHeight * 0.72));
    if (pelny) widok.wys = maksWys;
    if (!widok.dopasowany) {
      // wysokość dobrana do kształtu rejonu (wąski telefon + "płaski" rejon = niski plan, bez pustego pasa)
      dopasuj(szer, maksWys);
      const o = obszarSwiata();
      const potrzebna = (o.maxY - o.minY) * widok.s + 2 * Math.max(36, Math.min(110, szer * 0.12));
      widok.wys = pelny ? maksWys : Math.round(Math.min(maksWys, Math.max(360, potrzebna)));
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
    const zoomEl = container.querySelector('#plan-zoom');
    if (zoomEl && widok.sFit) zoomEl.textContent = `${Math.round((widok.s / widok.sFit) * 100)}%`;
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
    const pozycja = (typ, tekst, nap = [6, 1]) => `<span class="plan-leg"><svg width="30" height="26" viewBox="-2 0 38 34">${symbol(typ, 17, 17, KOLOR.obrys, 0.62, nap)}</svg>${tekst}</span>`;
    const kabel = (kolor, tekst, kreski = '') => `<span class="plan-leg"><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke="${kolor}" stroke-width="2.4"${kreski}/></svg>${tekst}</span>`;
    legendaEl.innerHTML = `
      ${pozycja('rozdzielnia', 'Rozdzielnia (szyna zbiorcza)', [6, 6])}
      ${pozycja('pole', 'Pole z wyłącznikiem', [6, 6])}
      ${pozycja('transformator', 'Transformator SN/nn')}
      ${pozycja('urzadzenie', 'Wyłącznik / aparat', [1, 1])}
      ${pozycja('naped', 'Odbiornik / napęd (silnik M)')}
      ${pozycja('kombajn', 'Kombajn / KB')}
      ${kabel(KOLOR.sn, 'Kabel SN (6 kV)')}
      ${kabel(KOLOR.nn1, 'Kabel nn 1 kV')}
      ${kabel(KOLOR.nn05, 'Kabel nn ≤ 0,69 kV')}
      ${kabel(KOLOR.obrys, 'Kabel rezerwowy', ' stroke-dasharray="7 4"')}
      <span class="plan-leg"><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke="${KOLOR.przenosnik}" stroke-width="4"/><line x1="0" y1="5" x2="34" y2="5" stroke="#fff" stroke-width="1.8" stroke-dasharray="1.5 6"/></svg>Przenośnik</span>
      <span class="plan-leg"><svg width="34" height="10"><line x1="0" y1="5" x2="26" y2="5" stroke="${KOLOR.drazenie}" stroke-width="2.5"/><path d="M24,1 L33,5 L24,9 z" fill="${KOLOR.drazenie}"/></svg>Kierunek drążenia</span>
      ${warstwy.zrodlo ? `<span class="plan-leg">Obrys: <b style="color:${KOLOR.zrodlo.Excel}">Excel</b> · <b style="color:${KOLOR.zrodlo['ręcznie']}">ręcznie</b> · <b style="color:${KOLOR.zrodlo.pomiar}">pomiar</b> · <b style="color:${KOLOR.zrodlo['']}">nie podano</b></span>` : ''}
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
    const niezgodne = w.kable.filter((k) => !zgodnePolaczenie(k));
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
      blok('Połączenia niezgodne z układem zasilania', niezgodne.map((k) => `<li>${esc(nazwa(k.zrodlo.store, k.zrodlo.rec))} → ${esc(nazwa(k.cel.store, k.cel.rec))}: ${esc(powodNiezgodnosci(k))} <button type="button" class="btn-small" data-zasilanie="${k.cel.store}:${k.cel.rec.id}">Zmień zasilanie</button></li>`)),
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
        ${store !== 'rozdzielnie' ? `<button type="button" class="btn-small" data-zasilanie="${store}:${id}">Zasilanie…</button>` : ''}
        ${DOMYSLNY_ODPLYW[rodzajRek(store, rec)] ? `<button type="button" class="btn-small" data-odplyw="${store}:${id}">+ Odpływ stąd</button>` : ''}
        ${store === 'rozdzielnie' ? `<button type="button" class="btn-small" data-dodaj-pole="${id}">+ Pole</button>` : ''}
        ${store !== 'poleRozdzielcze' && store !== 'przenosniki' ? `<button type="button" class="btn-small" data-postaw="${store}:${id}">Przestaw</button>` : ''}
        ${num(rec.plan_dx) || num(rec.plan_dy) ? `<button type="button" class="btn-small" data-reset="${store}:${id}">Cofnij przesunięcie</button>` : ''}
        <button type="button" class="btn-small btn-danger" data-usun="${store}:${id}">Usuń</button>
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
    if (store === 'przenosniki') {
      const len = Math.round(geo.get(n.id)?.len ?? n.m);
      const nowy = rec.pr_chodnik === undefined || rec.pr_chodnik === '';
      await nadzorUpdate(store, { ...rec, pr_chodnik: n.id, pr_naped_m: n.m, ...(nowy ? { pr_od_m: n.m, pr_do_m: len } : {}), plan_dx: 0, plan_dy: 0 });
    } else {
      await nadzorUpdate(store, { ...rec, lok_chodnik: n.id, lok_metraz: n.m, lok_strona: n.strona, plan_dx: 0, plan_dy: 0 });
    }
    await wczytajDane();
    render();
  }

  // ---------- edycja układu: dodawanie, zasilanie, odpływ, usuwanie ----------
  // Wpisuje te same pola "zasilany z" co formularze — zmiana widać od razu na planie, w Grafie i w Mapie rejonu.
  // Listy źródeł i odpływów pokazują tylko połączenia zgodne z układem (ZRODLA_RODZAJU) i bez pętli.

  const nazwaRek = (store, rec) => rec[NADZOR_ENTITIES[store]?.titleField] || `#${rec.id}`;
  const rodzajRek = (store, rec) => (store === 'urzadzenia' ? (jestOdbiornik(rec) ? 'odbiornik' : 'wylacznik') : store);
  const rodzajDef = (id) => RODZAJE.find((r) => r.id === id);
  const etykietaRodzaju = (id) => rodzajDef(id)?.krotko || id;
  const opisRek = (store, rec) => `${etykietaRodzaju(rodzajRek(store, rec))} ${nazwaRek(store, rec)}`;
  const pusty = (v) => v === undefined || v === null || v === '';

  function zgodnePolaczenie(p) {
    if (p.cel.store === 'rozdzielnie') return true; // dawne zasilanie rozdzielnia → rozdzielnia
    const reguly = ZRODLA_RODZAJU[rodzajRek(p.cel.store, p.cel.rec)] || [];
    return reguly.some(([, s, r]) => s === p.zrodlo.store && r === rodzajRek(p.zrodlo.store, p.zrodlo.rec));
  }

  function powodNiezgodnosci(p) {
    const zr = rodzajRek(p.zrodlo.store, p.zrodlo.rec);
    const cel = rodzajRek(p.cel.store, p.cel.rec);
    if (zr === 'transformatory') return 'transformator nie zasila odbiorów bezpośrednio — wstaw wyłącznik';
    if (zr === 'odbiornik') return 'odbiornik nie zasila innych urządzeń';
    if (cel === 'odbiornik' || cel === 'kb' || cel === 'przenosniki') return 'zasilanie powinno iść z wyłącznika';
    return 'niezgodne z układem zasilania';
  }

  // źródło zasilania głównego rekordu (pierwsze rozpoznane pole "zasilany z")
  function zrodloRek(store, rec) {
    for (const [pole, zStore, zPole, prefiks] of ZASILANIE[store] || []) {
      if (prefiks === 'kabel_rez') continue;
      const z = rozwiaz(rec[pole], dane[zStore] || [], zPole);
      if (z) return { store: zStore, rec: z, pole };
    }
    return null;
  }
  const maWpisaneZasilanie = (store, rec) => (ZASILANIE[store] || []).some(([pole, , , prefiks]) => prefiks !== 'kabel_rez' && !pusty(rec[pole]));

  // ustawia jedno źródło zasilania i czyści pozostałe pola "zasilany z" (urządzenie ma jedno źródło)
  function zZasilaniem(store, rec, pole, wartosc) {
    const nowy = { ...rec };
    if (store !== 'rozdzielnie') for (const [p, , , prefiks] of ZASILANIE[store] || []) if (prefiks !== 'kabel_rez') nowy[p] = '';
    if (pole) nowy[pole] = wartosc;
    return nowy;
  }

  // wszystko, co jest zasilane (pośrednio) z danego elementu — żeby nie zrobić pętli
  function potomkowie(store, id) {
    const wynik = new Set();
    const kolejka = [`${store}:${id}`];
    const { wynik: pol } = polaczenia();
    while (kolejka.length) {
      const k = kolejka.shift();
      for (const p of pol) {
        const cel = `${p.cel.store}:${p.cel.rec.id}`;
        if (`${p.zrodlo.store}:${p.zrodlo.rec.id}` === k && !wynik.has(cel)) {
          wynik.add(cel);
          kolejka.push(cel);
        }
      }
    }
    return wynik;
  }

  function zrodlaDla(rodzajId, wyklucz = null) {
    // [{ wartosc: 'poleFK|magazyn|id', opis }] — kto może zasilać element tego rodzaju
    const zakazane = wyklucz ? potomkowie(wyklucz.store, wyklucz.id) : new Set();
    if (wyklucz) zakazane.add(`${wyklucz.store}:${wyklucz.id}`);
    const wynik = [];
    for (const [pole, zStore, zRodzaj] of ZRODLA_RODZAJU[rodzajId] || []) {
      for (const r of dane[zStore] || []) {
        if (rodzajRek(zStore, r) !== zRodzaj || zakazane.has(`${zStore}:${r.id}`)) continue;
        let opis = `${etykietaRodzaju(zRodzaj)} ${nazwaRek(zStore, r)}`;
        if (zStore === 'poleRozdzielcze') {
          const gdzie = rozwiaz(r.miejsce_zabudowy, dane.rozdzielnie || [], 'nazwa_r');
          if (gdzie && !opis.includes(nazwaRek('rozdzielnie', gdzie))) opis += ` (${nazwaRek('rozdzielnie', gdzie)})`;
        }
        wynik.push({ wartosc: `${pole}|${zStore}|${r.id}`, opis });
      }
    }
    return wynik;
  }

  function odplywyDla(rodzajId) {
    // [{ wartosc: 'magazyn|id|poleFK', opis }] — kogo nowy element może zasilać
    const zStore = rodzajDef(rodzajId)?.store;
    const wynik = [];
    for (const [celRodzaj, reguly] of Object.entries(ZRODLA_RODZAJU)) {
      if (celRodzaj === 'rozdzielnie') continue;
      const regula = reguly.find(([, s, r]) => s === zStore && r === rodzajId);
      if (!regula) continue;
      const celStore = rodzajDef(celRodzaj).store;
      for (const r of dane[celStore] || []) {
        if (rodzajRek(celStore, r) !== celRodzaj) continue;
        const obecne = zrodloRek(celStore, r);
        wynik.push({ wartosc: `${celStore}|${r.id}|${regula[0]}`, opis: `${opisRek(celStore, r)}${obecne ? ` (teraz z: ${nazwaRek(obecne.store, obecne.rec)})` : ''}` });
      }
    }
    return wynik;
  }

  const opcjeSelect = (lista, pusta, wybrana = '') => (pusta === null ? '' : `<option value="">${pusta}</option>`)
    + lista.map((o) => `<option value="${esc(o.wartosc)}" ${o.wartosc === wybrana ? 'selected' : ''}>${esc(o.opis)}</option>`).join('');

  let wstepneDodawania = {};

  function pokazDodawanie(rodzajId = 'wylacznik', wstepne = {}) {
    zamknijKarte();
    wstepneDodawania = wstepne;
    const rodzaj = rodzajDef(rodzajId) || rodzajDef('wylacznik');
    const jestPole = rodzaj.id === 'poleRozdzielcze';
    const zrodla = zrodlaDla(rodzaj.id);
    const wybraneZr = wstepne.zrodlo ? zrodla.find((o) => o.wartosc.endsWith(`|${wstepne.zrodlo.store}|${wstepne.zrodlo.id}`))?.wartosc || '' : '';
    const odplywy = odplywyDla(rodzaj.id);
    const rozdzielnie = (dane.rozdzielnie || []).map((r) => ({ wartosc: String(r.id), opis: nazwaRek('rozdzielnie', r) }));
    dodajEl.dataset.tryb = 'dodaj';
    dodajEl.innerHTML = `
      <h4>Dodaj element do planu</h4>
      <div class="plan-dodaj-pola">
        <label>Rodzaj
          <select name="rodzaj">${RODZAJE.map((r) => `<option value="${r.id}" ${r.id === rodzaj.id ? 'selected' : ''}>${r.label}</option>`).join('')}</select>
        </label>
        <label>Nazwa / numer
          <input name="nazwa" required placeholder="${esc(rodzaj.przyklad)}">
        </label>
        ${rodzaj.nap ? `<label>Napięcie
          <select name="napiecie">${rodzaj.nap.opcje.map((o) => `<option>${o}</option>`).join('')}</select>
        </label>` : ''}
        ${jestPole ? `<label>W rozdzielni
          <select name="rozdzielnia" required>${opcjeSelect(rozdzielnie, '— wybierz —', wstepne.rozdzielnia ? String(wstepne.rozdzielnia) : '')}</select>
        </label>` : ''}
        <label>${rodzaj.zasilanyEtykieta}
          <select name="zrodlo">${opcjeSelect(zrodla, zrodla.length ? '— nie podaję —' : '— brak źródeł tego rodzaju —', wybraneZr)}</select>
        </label>
        ${odplywy.length ? `<label>Odpływ do
          <select name="odplyw">${opcjeSelect(odplywy, '— nie podaję —')}</select>
        </label>` : ''}
      </div>
      <p class="plan-dodaj-uwaga">${esc(rodzaj.uwaga)} ${jestPole ? 'Pole stanie przy swojej rozdzielni.' : 'Po zapisie kliknij na planie przy chodniku, gdzie stoi element — metraż i strona wpiszą się same.'} Kabel (typ, przekrój, długość) uzupełnisz później w formularzu.</p>
      <div class="form-actions">
        <button type="submit" class="btn-small btn-primary">Zapisz${jestPole ? '' : ' i postaw na planie'}</button>
        <button type="button" class="btn-small" data-akcja="anuluj-dodawanie">Anuluj</button>
      </div>`;
    dodajEl.classList.remove('hidden');
    dodajEl.querySelector('[name="nazwa"]').focus();
    dodajEl.scrollIntoView({ block: 'nearest' });
  }

  const zamknijDodawanie = () => { dodajEl.classList.add('hidden'); dodajEl.innerHTML = ''; };

  async function zapiszDodawanie() {
    const f = new FormData(dodajEl);
    const rodzaj = rodzajDef(f.get('rodzaj'));
    const nazwa = String(f.get('nazwa') || '').trim();
    if (!rodzaj || !nazwa) return;
    const store = rodzaj.store;
    const rec = { [rodzaj.nazwa]: nazwa, ...(rodzaj.stale || {}), zrodlo_danych: 'ręcznie' };
    if (rodzaj.nap && f.get('napiecie')) rec[rodzaj.nap.key] = f.get('napiecie');
    if (rodzaj.id === 'poleRozdzielcze') rec.miejsce_zabudowy = Number(f.get('rozdzielnia'));
    const [pole, , idZr] = String(f.get('zrodlo') || '').split('|');
    if (idZr && pole !== 'przelot') rec[pole] = Number(idZr);
    const noweId = await nadzorAdd(store, rec);
    if (idZr && pole === 'przelot') {
      // rozdzielnia zasilona przelotem: jej pole zasilające z kablem od pola źródłowego
      await nadzorAdd('poleRozdzielcze', { p_nazwa: `${nazwa} – pole zasilające`, miejsce_zabudowy: noweId, zasilane_z_pola: Number(idZr), zrodlo_danych: 'ręcznie' });
    }
    const [celStore, idCelu, celPole] = String(f.get('odplyw') || '').split('|');
    if (idCelu) {
      const celRec = (await nadzorGetAll(celStore)).find((r) => r.id === Number(idCelu));
      if (celRec) await nadzorUpdate(celStore, zZasilaniem(celStore, celRec, celPole, noweId));
    }
    zamknijDodawanie();
    await wczytajDane();
    render();
    if (store !== 'poleRozdzielcze') zacznijStawianie(store, noweId);
  }

  // zmiana zasilania (i rodzaju urządzenia) istniejącego elementu
  function pokazZasilanie(store, id, rodzajUrz = null) {
    const rec = (dane[store] || []).find((r) => r.id === id);
    if (!rec || store === 'rozdzielnie') return;
    zamknijKarte();
    const rodzajId = rodzajUrz || rodzajRek(store, rec);
    const zrodla = zrodlaDla(rodzajId, { store, id });
    const obecne = zrodloRek(store, rec);
    let wybrana = obecne ? `${obecne.pole}|${obecne.store}|${obecne.rec.id}` : '';
    let bezZmian = '';
    if (!zrodla.some((o) => o.wartosc === wybrana) && maWpisaneZasilanie(store, rec)) {
      // źródło spoza bazy albo niezgodne z układem — nie kasuj go bez wyraźnego wyboru
      const tekst = obecne ? `${nazwaRek(obecne.store, obecne.rec)} (niezgodne z układem)` : `„${(ZASILANIE[store] || []).map(([p]) => rec[p]).find((v) => !pusty(v))}” (spoza bazy)`;
      bezZmian = `<option value="__bez_zmian" selected>bez zmian: ${esc(tekst)}</option>`;
      wybrana = '__bez_zmian';
    }
    const def = rodzajDef(rodzajId);
    dodajEl.dataset.tryb = 'zasilanie';
    dodajEl.dataset.cel = `${store}:${id}`;
    dodajEl.innerHTML = `
      <h4>Zasilanie: ${esc(opisRek(store, rec))}</h4>
      <div class="plan-dodaj-pola">
        ${store === 'urzadzenia' ? `<label>Rodzaj urządzenia
          <select name="u_rodzaj">${U_RODZAJE.map((o) => `<option ${(o === U_RODZAJE[1]) === (rodzajId === 'odbiornik') ? 'selected' : ''}>${o}</option>`).join('')}</select>
        </label>` : ''}
        <label>${esc(def?.zasilanyEtykieta || 'Zasilany z')}
          <select name="zrodlo">${bezZmian}${opcjeSelect(zrodla, '— brak zasilania —', wybrana)}</select>
        </label>
      </div>
      <p class="plan-dodaj-uwaga">${esc(def?.uwaga || '')} Lista pokazuje tylko źródła zgodne z układem, bez elementów zasilanych z tego (bez pętli).</p>
      <div class="form-actions">
        <button type="submit" class="btn-small btn-primary">Zapisz</button>
        <button type="button" class="btn-small" data-akcja="anuluj-dodawanie">Anuluj</button>
      </div>`;
    dodajEl.classList.remove('hidden');
    dodajEl.scrollIntoView({ block: 'nearest' });
  }

  async function zapiszZasilanie() {
    const f = new FormData(dodajEl);
    const [store, id] = String(dodajEl.dataset.cel || '').split(':');
    const rec = (await nadzorGetAll(store)).find((r) => r.id === Number(id));
    if (!rec) return;
    let nowy = { ...rec };
    if (f.get('u_rodzaj')) nowy.u_rodzaj = f.get('u_rodzaj');
    const zr = String(f.get('zrodlo') || '');
    if (zr !== '__bez_zmian') {
      const [pole, , idZr] = zr.split('|');
      nowy = zZasilaniem(store, nowy, idZr ? pole : null, idZr ? Number(idZr) : '');
    }
    await nadzorUpdate(store, nowy);
    zamknijDodawanie();
    await wczytajDane();
    render();
  }

  async function usunElement(store, id) {
    const rec = (dane[store] || []).find((r) => r.id === id);
    if (!rec) return;
    const pola = store === 'rozdzielnie' ? (dane.poleRozdzielcze || []).filter((p) => rozwiaz(p.miejsce_zabudowy, dane.rozdzielnie || [], 'nazwa_r')?.id === id) : [];
    const usuwane = [{ store, rec }, ...pola.map((p) => ({ store: 'poleRozdzielcze', rec: p }))];
    const klucze = new Set(usuwane.map((d) => `${d.store}:${d.rec.id}`));
    const odbiory = polaczenia().wynik.filter((p) => klucze.has(`${p.zrodlo.store}:${p.zrodlo.rec.id}`) && !klucze.has(`${p.cel.store}:${p.cel.rec.id}`));
    const nazwyOdb = [...new Set(odbiory.map((p) => nazwaRek(p.cel.store, p.cel.rec)))];
    const pytanie = `Usunąć ${opisRek(store, rec)}${pola.length ? ` razem z polami (${pola.length})` : ''}?`
      + (nazwyOdb.length ? `\n\nZostaną bez zasilania: ${nazwyOdb.join(', ')}.` : '')
      + '\n\nTego nie da się cofnąć (chyba że masz kopię — Eksport).';
    if (!confirm(pytanie)) return;
    for (const p of odbiory) {
      const swiezy = (await nadzorGetAll(p.cel.store)).find((r) => r.id === p.cel.rec.id);
      if (!swiezy) continue;
      const nowy = { ...swiezy };
      for (const [pole, zStore, zPole] of ZASILANIE[p.cel.store] || []) {
        const z = rozwiaz(nowy[pole], dane[zStore] || [], zPole);
        if (z && klucze.has(`${zStore}:${z.id}`)) nowy[pole] = '';
      }
      await nadzorUpdate(p.cel.store, nowy);
    }
    for (const d of usuwane) await nadzorDelete(d.store, d.rec.id);
    zamknijKarte();
    await wczytajDane();
    render();
  }

  dodajEl.addEventListener('change', (e) => {
    if (dodajEl.dataset.tryb === 'dodaj' && e.target.name === 'rodzaj') {
      const nazwa = dodajEl.querySelector('[name="nazwa"]').value;
      pokazDodawanie(e.target.value, wstepneDodawania);
      dodajEl.querySelector('[name="nazwa"]').value = nazwa;
    } else if (dodajEl.dataset.tryb === 'zasilanie' && e.target.name === 'u_rodzaj') {
      const [store, id] = String(dodajEl.dataset.cel).split(':');
      pokazZasilanie(store, Number(id), e.target.value === U_RODZAJE[1] ? 'odbiornik' : 'wylacznik');
    }
  });
  dodajEl.addEventListener('submit', (e) => {
    e.preventDefault();
    if (dodajEl.dataset.tryb === 'zasilanie') zapiszZasilanie();
    else zapiszDodawanie();
  });

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
      dodaj('urzadzenia', { nazwa, u_rodzaj: nazwa.startsWith('HMC') ? U_RODZAJE[1] : U_RODZAJE[0], nap_zas: '1 kV', zasilane_z_transformatora: zT ?? '', zasilane_z_urzadzenia: zU ?? '', lok_chodnik: ch, lok_metraz: m, lok_strona: strona, ...(kab || {}) });
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

  function ustawPelny(wlacz) {
    container.classList.toggle('plan-pelny', wlacz);
    document.body.classList.toggle('plan-pelny-body', wlacz);
    const btn = container.querySelector('#plan-pelny-btn');
    if (btn) btn.textContent = wlacz ? '✕ Zamknij pełny ekran' : '⛶ Pełny ekran';
    widok.dopasowany = false;
    recznie = false;
    render();
  }

  async function przelaczPelny() {
    const wlacz = !container.classList.contains('plan-pelny');
    if (wlacz) {
      ustawPelny(true);
      try { if (container.requestFullscreen && !document.fullscreenElement) await container.requestFullscreen(); } catch {}
    } else {
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
      ustawPelny(false);
    }
  }

  document.addEventListener('fullscreenchange', () => {
    // wyjście klawiszem Esc / gestem systemu — zsynchronizuj widok
    if (!document.fullscreenElement && container.classList.contains('plan-pelny')) ustawPelny(false);
    else if (document.fullscreenElement === container) { widok.dopasowany = false; render(); }
  });

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
    else if (akcja === 'pelny') przelaczPelny();
    else if (akcja === 'dopasuj') { widok.dopasowany = false; recznie = false; render(); }
    else if (akcja === 'drukuj') drukuj();
    else if (akcja === 'svg') zapiszSvg();
    else if (akcja === 'zamknij-karte') zamknijKarte();
    else if (akcja === 'anuluj-stawianie') zakonczStawianie();
    else if (akcja === 'dodaj-element') pokazDodawanie();
    else if (akcja === 'anuluj-dodawanie') zamknijDodawanie();
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
    if (t.dataset.zasilanie) {
      const [store, id] = t.dataset.zasilanie.split(':');
      pokazZasilanie(store, Number(id));
    }
    if (t.dataset.odplyw) {
      const [store, id] = t.dataset.odplyw.split(':');
      const rec = (dane[store] || []).find((r) => r.id === Number(id));
      if (rec) pokazDodawanie(DOMYSLNY_ODPLYW[rodzajRek(store, rec)], { zrodlo: { store, id: Number(id) } });
    }
    if (t.dataset.dodajPole) pokazDodawanie('poleRozdzielcze', { rozdzielnia: Number(t.dataset.dodajPole) });
    if (t.dataset.usun) {
      const [store, id] = t.dataset.usun.split(':');
      await usunElement(store, Number(id));
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

  container.querySelector('[data-akcja-wielkosc]').addEventListener('change', (e) => {
    wielkosc = e.target.value;
    try { localStorage.setItem('protektor-plan-symbole', wielkosc); } catch {}
    if (!recznie) widok.dopasowany = false;
    render();
  });

  container.querySelectorAll('[data-warstwa]').forEach((cb) => {
    cb.addEventListener('change', () => {
      warstwy[cb.dataset.warstwa] = cb.checked;
      try { localStorage.setItem('protektor-plan-warstwy', JSON.stringify(warstwy)); } catch {}
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

  return { init, _test: { zrodlaDla, odplywyDla, zgodnePolaczenie, wczytajPrzyklad, usunPrzyklad, rysuj: () => rysuj(widok, { szer: 1000, wys: 700 }), dane: () => dane } };
}
