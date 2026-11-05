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
import { KOLOR, kolorNapiecia, kv, symbolSvg, napiecieRekordu, napieciaWtorne, rowneKV, napiecieSieci } from './symbole.js';
import { wczytajKatalog, zapiszKatalog, typAparatu, NAPIECIA_KATALOGU } from './katalog-aparatow.js';
import { ZASILANIE, jestOdbiornik, KONCOWE, rozwiaz, rodzajRek, polaczenia as polaczeniaSieci, zrodloRek as zrodloSieci, rodzajPolaczenia as rodzajPolaczeniaSieci, rejonySieci, MAGAZYNY_REJONU } from './siec-zasilania.js';

const OBIEKTY = [
  { store: 'rozdzielnie', label: 'Rozdzielnia', title: 'nazwa_r', symbol: 'rozdzielnia' },
  { store: 'transformatory', label: 'Transformator', title: 't_nr', symbol: 'transformator' },
  { store: 'urzadzenia', label: 'Urządzenie', title: 'nazwa', symbol: 'urzadzenie' },
  { store: 'kb', label: 'Kombajn / KB', title: 'kb_nazwa', symbol: 'kombajn' },
  { store: 'maszyny', label: 'Maszyna', title: 'm_nazwa', symbol: 'maszyna' },
];

// ZASILANIE, rozwiaz, jestOdbiornik, KONCOWE, rodzajRek: siec-zasilania.js (wspólne z Grafem zasilania)

// Układ zasilania (03.11.2026, Piotr): pole zasila transformator albo inne pole (przelot 6 kV);
// transformator zasila wyłączniki / aparaty, nie bezpośrednio silniki; wyłącznik zasila kolejny
// wyłącznik, odbiornik, kombajn albo napęd przenośnika; odbiornik nie zasila niczego.
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
  maszyny: [['zasilany_z_urzadzenia', 'urzadzenia', 'wylacznik']],
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
    zasilanyEtykieta: 'Zasilany z pola', uwaga: 'Strona pierwotna (6 kV): tylko dwa przyłącza — zasilanie (z pola, z przelotu innego transformatora albo z aparatu 6 kV) i najwyżej jeden przelot do kolejnego transformatora. Strona wtórna: dowolnie wiele odpływów do wyłączników; transformator dwunapięciowy (6/0,5/1 kV) daje 0,5 kV i 1 kV.' },
  { id: 'wylacznik', store: 'urzadzenia', label: 'Wyłącznik / szafa stycznikowa / zespół (WSN, BTH, OSW…)', krotko: 'Wyłącznik', nazwa: 'nazwa', przyklad: 'np. WSN-40P/1', nap: NAP_URZ, stale: { u_rodzaj: U_RODZAJE[0] },
    zasilanyEtykieta: 'Zasilany z', uwaga: 'Wyłącznik, szafa stycznikowa albo zespół transformatorowy — zabezpiecza urządzenia końcowe. Zasilany z transformatora albo przelotem z innego wyłącznika; zwykle ma zasilanie i jeden odpływ. Napięcie (1 kV albo 0,5 kV) wynika ze strony wtórnej transformatora.' },
  { id: 'odbiornik', store: 'urzadzenia', label: 'Odbiornik (silnik, pompa, wentylator…)', krotko: 'Odbiornik', nazwa: 'nazwa', przyklad: 'np. pompa PH-1', nap: NAP_URZ, stale: { u_rodzaj: U_RODZAJE[1] },
    zasilanyEtykieta: 'Zasilany z wyłącznika', uwaga: 'Urządzenie końcowe (silnik, pompa, maszyna) — zasilane z wyłącznika, nie bezpośrednio z transformatora; nie ma przelotów i nic nie zasila. Napięcie jak wyłącznika, z którego jest zasilane.' },
  { id: 'kb', store: 'kb', label: 'Kombajn / KB', krotko: 'Kombajn', nazwa: 'kb_nazwa', przyklad: 'np. AM-1',
    zasilanyEtykieta: 'Zasilany z wyłącznika', uwaga: 'Kombajn zasilany z wyłącznika.' },
  { id: 'maszyny', store: 'maszyny', label: 'Maszyna (wiertnica, ładowarka, kolejka…)', krotko: 'Maszyna', nazwa: 'm_nazwa', przyklad: 'np. wiertnica WD-1', nap: NAP_URZ,
    zasilanyEtykieta: 'Zasilana z wyłącznika', uwaga: 'Maszyna jest urządzeniem końcowym — zasilana z wyłącznika; rodzaj i silniki dopiszesz w zakładce Maszyny.' },
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


// tryb 'teren' — Plan rejonu (chodniki, metraże); tryb 'schemat' — Graf zasilania: drzewo od rozdzielni do odbiorników
// końcowych, z tych samych danych i tą samą edycją (05.11.2026, Piotr: graf tożsamy z planem, w pełni edytowalny).
export function createPlanView(containerId, ustawienia = {}) {
  const tryb = ustawienia.tryb === 'schemat' ? 'schemat' : 'teren';
  const SCHEMAT = tryb === 'schemat';
  const container = document.getElementById(containerId);
  let onPokazWInnymWidoku = null;
  let onEditRecord = null;
  let onShowInMap = null;
  let dane = {};
  let geo = new Map(); // chodnik.id -> geometria w metrach
  let katalog = []; // typy aparatów z napięciem (katalog-aparatow.js)
  let widok = { s: 1.6, tx: 40, ty: 60, dopasowany: false }; // px = m * s + t
  // 03.11.2026: wielkość symboli (Piotr: "nieczytelne, zmniejsz ikony") — domyślnie średnie (0,65 dawnych)
  const SKALE = { male: 0.5, srednie: 0.65, duze: 0.9 };
  let wielkosc = 'srednie';
  try { wielkosc = localStorage.getItem('protektor-plan-symbole') || 'srednie'; } catch {}
  if (!SKALE[wielkosc]) wielkosc = 'srednie';
  const sk = () => SKALE[wielkosc];
  const WARSTWY_DOMYSLNE = { chodniki: true, przenosniki: true, obiekty: true, daneObiektow: true, kable: true, napiecieKabli: true, opisyKabli: true, zrodlo: false, inneOddzialy: true };
  const ODDZIALY = ['odstawczy', 'przodkowy', 'ścianowy', 'inny'];
  let mojOddzial = 'wszystkie';
  try { mojOddzial = localStorage.getItem('protektor-plan-oddzial') || 'wszystkie'; } catch {}
  // 05.11.2026: rejon = KB — rozdzielnia i wszystko na sieci aż do odbiorników końcowych (wyliczany z połączeń)
  let mojRejon = 'wszystkie';
  try { mojRejon = localStorage.getItem('protektor-plan-rejon') || 'wszystkie'; } catch {}
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
        <label><input type="checkbox" data-warstwa="inneOddzialy" ${zaznacz('inneOddzialy')}> Elementy innych oddziałów i rejonów (wyblakłe)</label>
      </details>
      <label class="plan-oddzial">Rejon (KB)
        <select data-akcja-rejon><option>wszystkie</option></select>
      </label>
      <label class="plan-oddzial">Oddział
        <select data-akcja-oddzial>${['wszystkie', ...ODDZIALY].map((o) => `<option ${o === mojOddzial ? 'selected' : ''}>${o}</option>`).join('')}</select>
      </label>
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
    const magazyny = ['chodniki', 'przenosniki', 'rozdzielnie', 'poleRozdzielcze', 'transformatory', 'urzadzenia', 'kb', 'maszyny', 'silniki'];
    const wyniki = await Promise.all(magazyny.map((m) => nadzorGetAll(m)));
    dane = Object.fromEntries(magazyny.map((m, i) => [m, wyniki[i]]));
    katalog = await wczytajKatalog();
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

  // 05.11.2026 (Piotr): umiejscowienie "przy obiekcie" — np. wyłącznik napędowy przy napędzie, który zasila.
  // lok_przy = 'magazyn:id'; obiekt stoi przy wskazanym (ten sam chodnik i metraż) i przesuwa się razem z nim.
  const przyObiekcie = (rec) => {
    const [s0, i0] = String(rec?.lok_przy || '').split(':');
    const t = s0 && i0 ? (dane[s0] || []).find((r) => r.id === Number(i0)) : null;
    return t ? { store: s0, rec: t } : null;
  };

  function lokalizacja(store, rec, d = 0) {
    const przy = d < 6 ? przyObiekcie(rec) : null;
    if (przy) {
      const l = lokalizacja(przy.store, przy.rec, d + 1);
      if (l) return { ...l, strona: l.strona === 'oś' ? (rec.lok_strona === 'lewa' ? 'lewa' : 'prawa') : l.strona, przy: `${przy.store}:${przy.rec.id}` };
    }
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

  // początek schematu: pierwszy chodnik bez chodnika macierzystego
  const chodnikPoczatkowy = () => [...geo.values()].find((g) => !rozwiaz(g.rec.ch_od_chodnika, dane.chodniki || [], 'ch_nazwa')) || [...geo.values()][0] || null;
  function punktZdalny(i) {
    const g = chodnikPoczatkowy();
    if (!g) return null;
    const L = Math.max(40, Math.min(120, g.len * 0.35));
    return { p: { x: g.x0 - g.dx * L + g.nx * 30 * i, y: g.y0 - g.dy * L + g.ny * 30 * i }, lok: { ch: g.rec.id, m: 0, strona: 'lewa', zdalna: true } };
  }
  function rozdzielnieZdalne(poz) {
    const wynik = [];
    for (const r of dane.rozdzielnie || []) {
      if ((poz && poz[`rozdzielnie:${r.id}`]) || lokalizacja('rozdzielnie', r)) continue;
      const pola = new Set((dane.poleRozdzielcze || []).filter((pl) => rozwiaz(pl.miejsce_zabudowy, dane.rozdzielnie || [], 'nazwa_r')?.id === r.id).map((pl) => pl.id));
      const zasilaPlan = polaczenia().wynik.some((p) => ((p.zrodlo.store === 'poleRozdzielcze' && pola.has(p.zrodlo.rec.id)) || (p.zrodlo.store === 'rozdzielnie' && p.zrodlo.rec.id === r.id))
        && p.cel.store !== 'poleRozdzielcze' && p.cel.store !== 'rozdzielnie' && (poz ? poz[`${p.cel.store}:${p.cel.rec.id}`] : lokalizacja(p.cel.store, p.cel.rec) && !ukryty(p.cel.store, p.cel.rec)));
      if (zasilaPlan) wynik.push(r);
    }
    return wynik;
  }

  // ---------- układ schematu (Graf zasilania) ----------
  // Drzewo: rozdzielnia → pola → transformatory → wyłączniki → odbiorniki końcowe / KB / napędy. Rodzic = źródło
  // zasilania (pole: rozdzielnia, w której jest). Przelot (to samo piętro, np. trafo → trafo) stoi obok, na tym samym
  // poziomie. Elementy bez zasilania stają na poziomie swojego rodzaju. Jednostki "świata" jak na planie.
  const SCH_DX = 70;
  const SCH_DY = 80;
  const POZIOM_RODZAJU = { rozdzielnie: 0, poleRozdzielcze: 1, transformatory: 2, wylacznik: 3, odbiornik: 4, kb: 4, maszyny: 4, przenosniki: 4 };
  const MAGAZYNY_SCHEMATU = ['rozdzielnie', 'poleRozdzielcze', 'transformatory', 'urzadzenia', 'kb', 'maszyny', 'przenosniki'];
  let schCache = null;
  let schKlucz = null;
  function ukladSchematu() {
    const kluczStanu = `${mojRejon}|${mojOddzial}|${warstwy.inneOddzialy}`;
    if (schCache && schKlucz === kluczStanu && schCache.dane === dane) return schCache.uklad;
    const wezly = new Map();
    for (const st of MAGAZYNY_SCHEMATU) for (const rec of dane[st] || []) if (!ukryty(st, rec)) wezly.set(`${st}:${rec.id}`, { st, rec, dzieci: [], przeloty: [] });
    const rodzic = (w) => {
      if (w.st === 'rozdzielnie') return null;
      if (w.st === 'poleRozdzielcze') {
        const r = rozwiaz(w.rec.miejsce_zabudowy, dane.rozdzielnie || [], 'nazwa_r');
        return r && wezly.get(`rozdzielnie:${r.id}`) ? { k: `rozdzielnie:${r.id}`, przelot: false } : null;
      }
      const z = zrodloRek(w.st, w.rec);
      if (!z || !wezly.has(`${z.store}:${z.rec.id}`)) return null;
      return { k: `${z.store}:${z.rec.id}`, przelot: rodzajPolaczenia({ zrodlo: z, cel: { store: w.st, rec: w.rec } }) === 'przelot' && z.store !== 'urzadzenia' };
    };
    const korzenie = [];
    for (const [k, w] of wezly) {
      const r = rodzic(w);
      if (r) (r.przelot ? wezly.get(r.k).przeloty : wezly.get(r.k).dzieci).push(k);
      else korzenie.push(k);
    }
    const poziomRodz = (k) => POZIOM_RODZAJU[rodzajRek(wezly.get(k).st, wezly.get(k).rec)] ?? 3;
    korzenie.sort((a, b) => poziomRodz(a) - poziomRodz(b));
    // 05.11.2026 (Piotr): kombajn na końcu rejonu — gałąź z KB idzie ostatnia (z prawej), a KB stoi w ostatnim rzędzie
    const zKB = new Map();
    const maKB = (k, d = 0) => {
      if (zKB.has(k)) return zKB.get(k);
      zKB.set(k, false);
      const w = wezly.get(k);
      const wynik = w.st === 'kb' || (d < 60 && [...w.dzieci, ...w.przeloty].some((x) => maKB(x, d + 1)));
      zKB.set(k, wynik);
      return wynik;
    };
    for (const w of wezly.values()) w.dzieci.sort((a, b) => Number(maKB(a)) - Number(maKB(b)));
    korzenie.sort((a, b) => poziomRodz(a) - poziomRodz(b) || Number(maKB(a)) - Number(maKB(b)));
    const uklad = new Map();
    let kolumna = 0;
    const odwiedzone = new Set();
    const umiesc = (k, poziom) => {
      if (odwiedzone.has(k)) return null;
      odwiedzone.add(k);
      const w = wezly.get(k);
      const xs = w.dzieci.map((d) => umiesc(d, poziom + 1)).filter((x) => x !== null);
      const x = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : kolumna++ * SCH_DX;
      uklad.set(k, { x, y: poziom * SCH_DY });
      for (const pk of w.przeloty) umiesc(pk, poziom);
      return x;
    };
    for (const k of korzenie) {
      if (odwiedzone.has(k)) continue;
      umiesc(k, poziomRodz(k));
      kolumna += 1; // odstęp między gałęziami
    }
    const ostatni = Math.max(0, ...[...uklad.entries()].filter(([k]) => !k.startsWith('kb:')).map(([, q]) => q.y));
    for (const [k, q] of uklad) if (k.startsWith('kb:') && q.y < ostatni + SCH_DY) q.y = ostatni + SCH_DY;
    schCache = { dane, uklad };
    schKlucz = kluczStanu;
    return uklad;
  }

  function obszarSwiata() {
    if (SCHEMAT) {
      const u = [...ukladSchematu().values()];
      if (!u.length) return { minX: 0, minY: 0, maxX: 300, maxY: 200 };
      return { minX: Math.min(...u.map((q) => q.x)), minY: Math.min(...u.map((q) => q.y)), maxX: Math.max(...u.map((q) => q.x)) + 60, maxY: Math.max(...u.map((q) => q.y)) };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const zdalnych = Math.min(4, rozdzielnieZdalne(null).length);
    for (let i = 0; i < zdalnych; i += 1) {
      const pk = punktZdalny(i);
      if (pk) { minX = Math.min(minX, pk.p.x); minY = Math.min(minY, pk.p.y); maxX = Math.max(maxX, pk.p.x); maxY = Math.max(maxY, pk.p.y); }
    }
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

  const polaczenia = () => polaczeniaSieci(dane);

  // 05.11.2026 (Piotr): napięcie urządzenia wynika ze źródła — ze strony wtórnej transformatora (1 kV albo 0,5 kV;
  // dwunapięciowy daje oba), dalej przez wyłączniki. opcjeOd = jakie napięcia źródło może dać odbiorowi.
  const pierwotne = (t) => kv(String(t?.t_napiecie || '').split('/')[0]) ?? 6;
  function opcjeOd(zStore, zRec, celStore, celRec, d = 0) {
    if (!zRec || d > 30) return null;
    if (zStore === 'rozdzielnie') return [kv(zRec.r_napiecie) ?? 6];
    if (zStore === 'poleRozdzielcze') return [kv(rozwiaz(zRec.miejsce_zabudowy, dane.rozdzielnie || [], 'nazwa_r')?.r_napiecie) ?? 6];
    if (zStore === 'transformatory') {
      // przelot 6 kV (do transformatora albo aparatu 6 kV) idzie stroną pierwotną
      if (celStore === 'transformatory' || (kv(celRec?.nap_zas) ?? 0) >= 3) return [pierwotne(zRec)];
      return napieciaWtorne(zRec);
    }
    if (zStore === 'urzadzenia') {
      const e = napiecieEfektywne('urzadzenia', zRec, d + 1);
      return e === null ? null : [e];
    }
    return null;
  }
  // napięcie, na którym faktycznie pracuje urządzenie (null = nie da się ustalić)
  function napiecieEfektywne(store, rec, d = 0) {
    const z = zrodloRek(store, rec);
    const o = z ? opcjeOd(z.store, z.rec, store, rec, d) : null;
    const v = kv(rec.nap_zas);
    if (!o) return store === 'urzadzenia' ? v : null;
    if (o.length === 1) return o[0];
    return o.find((x) => rowneKV(x, v)) ?? null;
  }

  function napiecieKabla(p) {
    const o = opcjeOd(p.zrodlo.store, p.zrodlo.rec, p.cel.store, p.cel.rec);
    const v = kv(p.cel.rec.nap_zas);
    if (o && o.length) return o.find((x) => rowneKV(x, v)) ?? (o.length === 1 ? o[0] : Math.max(...o));
    return v ?? kv(p.zrodlo.rec.nap_zas) ?? 1;
  }

  // Rodzaj połączenia (05.11.2026, Piotr): zasilanie (z przelotami) — linia ciągła, grubsza wg napięcia;
  // odpływ do urządzenia końcowego — przerywana; kabel rezerwowy — kreska-kropka.
  const rodzajPolaczenia = rodzajPolaczeniaSieci;
  const grubWgNapiecia = (kV) => (kV >= 3 ? 2.8 : kV >= 0.9 ? 2.0 : 1.5);
  function stylKabla(rodzaj, kV) {
    if (rodzaj === 'odplyw') return { grub: 1.3, kreski: ' stroke-dasharray="6 3.5"' };
    if (rodzaj === 'rezerwowe') return { grub: grubWgNapiecia(kV) - 0.4, kreski: ' stroke-dasharray="10 3 2 3"' };
    return { grub: grubWgNapiecia(kV), kreski: '' };
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
    if (store === 'maszyny') return [rec.m_rodzaj, rec.nap_zas, num(rec.moc) ? `${rec.moc} kW` : ''].filter(Boolean).join(' · ');
    if (store === 'przenosniki') return kw(rec.pr_moc, 'kW');
    return '';
  }

  const ROZMIAR_BAZOWY = { rozdzielnia: [24, 15], transformator: [11, 17], naped: [11, 11], kombajn: [20, 10], maszyna: [13, 10], pole: [7, 7], urzadzenie: [13, 9] };
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
    for (const [id, g] of SCHEMAT ? [] : geo) {
      if (ukryty('chodniki', g.rec)) continue;
      const a = naEkran({ x: g.x0, y: g.y0 }, v);
      const b = naEkran({ x: g.x0 + g.dx * g.len, y: g.y0 + g.dy * g.len }, v);
      if (obcyRejon('chodniki', g.rec)) czesci.chodniki.push('<g opacity="0.35">');
      czesci.chodniki.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${KOLOR.chodnikBrzeg}" stroke-width="${pasChodnika + 3}" stroke-linecap="round"/><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${KOLOR.chodnik}" stroke-width="${pasChodnika}" stroke-linecap="round" data-chodnik="${id}"/>`);
      if (g.rec.ch_w_drazeniu === 'tak') {
        const k = 26 * sk();
        const c = { x: b.x + g.dx * 6, y: b.y + g.dy * 6 };
        czesci.chodniki.push(`<line x1="${c.x - g.dx * k}" y1="${c.y - g.dy * k}" x2="${c.x + g.dx * 14 * sk()}" y2="${c.y + g.dy * 14 * sk()}" stroke="${KOLOR.drazenie}" stroke-width="${Math.max(1.5, 3 * sk())}" marker-end="url(#plan-strzalka-${tryb})"/>`);
      }
      if (obcyRejon('chodniki', g.rec)) czesci.chodniki.push('</g>');
    }

    if (SCHEMAT) {
      for (const [k, q] of ukladSchematu()) {
        const [st, idS] = k.split(':');
        const rec = (dane[st] || []).find((r) => r.id === Number(idS));
        if (!rec) continue;
        const p = naEkran(q, v);
        const def = st === 'poleRozdzielcze' ? { store: st, symbol: 'pole', label: 'Pole rozdzielcze', title: 'p_nazwa' }
          : st === 'przenosniki' ? { store: st, symbol: 'naped', label: 'Przenośnik / napęd', title: 'pr_nr' }
            : OBIEKTY.find((o) => o.store === st);
        poz[k] = { x: p.x, y: p.y, lok: null, rec, obcy: obcyEl(st, rec), def: st === 'urzadzenia' && jestOdbiornik(rec) ? { ...def, symbol: 'naped' } : def };
      }
      // szyna rozdzielni: pole połączone ze swoją rozdzielnią
      for (const pole of dane.poleRozdzielcze || []) {
        const r = rozwiaz(pole.miejsce_zabudowy, dane.rozdzielnie || [], 'nazwa_r');
        const a = r && poz[`rozdzielnie:${r.id}`];
        const b = poz[`poleRozdzielcze:${pole.id}`];
        if (a && b) czesci.chodniki.push(`<polyline points="${a.x},${a.y} ${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y}" fill="none" stroke="${KOLOR.sn}" stroke-width="${(3 + sk()).toFixed(1)}"${a.obcy || b.obcy ? ' opacity="0.35"' : ''}/>`);
      }
    }
    // obiekty z położeniem (kolejność: rozdzielnie, transformatory, urządzenia, KB)
    const stos = {};
    for (const def of SCHEMAT ? [] : OBIEKTY) {
      for (const rec of dane[def.store] || []) {
        if (ukryty(def.store, rec)) continue;
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
        poz[`${def.store}:${rec.id}`] = { x, y, lok, def: def.store === 'urzadzenia' && jestOdbiornik(rec) ? { ...def, symbol: 'naped' } : def, rec, obcy: obcyEl(def.store, rec) };
      }
    }
    // 05.11.2026: rozdzielnia poza rejonem (może być daleko od początku schematu) — rysowana przed początkiem
    // pierwszego chodnika, gdy jej pole zasila coś, co jest na planie; kabel idzie od niej do chodnika i dalej
    const zdalne = SCHEMAT ? [] : rozdzielnieZdalne(poz);
    zdalne.forEach((r, i) => {
      const pk = punktZdalny(i);
      if (!pk) return;
      const p = naEkran(pk.p, v);
      poz[`rozdzielnie:${r.id}`] = { x: p.x + (num(r.plan_dx) || 0), y: p.y + (num(r.plan_dy) || 0), lok: pk.lok, rec: r, zdalna: true, obcy: obcyRejon('rozdzielnie', r), def: OBIEKTY[0] };
    });
    // pola rozdzielcze — rząd kwadracików przy swojej rozdzielni
    const polaRozdz = {};
    for (const pole of SCHEMAT ? [] : dane.poleRozdzielcze || []) {
      const r = rozwiaz(pole.miejsce_zabudowy, dane.rozdzielnie, 'nazwa_r');
      const pr = r && poz[`rozdzielnie:${r.id}`];
      if (!pr || ukryty('poleRozdzielcze', pole)) continue;
      const i = polaRozdz[r.id] || 0;
      polaRozdz[r.id] = i + 1;
      poz[`poleRozdzielcze:${pole.id}`] = { x: pr.x - 18 * sk() + i * 16 * sk(), y: pr.y + 28 * sk(), lok: pr.lok, rec: pole, obcy: obcyRejon('poleRozdzielcze', pole), def: { store: 'poleRozdzielcze', symbol: 'pole', label: 'Pole rozdzielcze', title: 'p_nazwa' } };
    }
    // napędy przenośników
    for (const pr of SCHEMAT ? [] : dane.przenosniki || []) {
      if (ukryty('przenosniki', pr)) continue;
      const lok = lokalizacja('przenosniki', pr);
      if (!lok || !geo.has(lok.ch)) continue;
      const p = naEkran(punktM(lok.ch, lok.m), v);
      poz[`przenosniki:${pr.id}`] = { x: p.x + (num(pr.plan_dx) || 0), y: p.y + (num(pr.plan_dy) || 0), lok, rec: pr, obcy: obcyEl('przenosniki', pr), def: { store: 'przenosniki', symbol: 'naped', label: 'Przenośnik / napęd', title: 'pr_nr' } };
    }

    // zarezerwuj miejsca symboli, zanim rozmieścimy opisy
    for (const p of Object.values(poz)) {
      const [rx, ry] = rozmiarSymbolu(p.def.symbol);
      zajmij(p.x - rx, p.y - ry, p.x + rx, p.y + ry);
    }

    // przenośniki — linia na osi chodnika
    for (const pr of SCHEMAT ? [] : dane.przenosniki || []) {
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
      const styl = stylKabla(rodzajPolaczenia(p), napKabla);
      const grubKabla = styl.grub + 1 * sk();
      const kreski = styl.kreski;
      const odsun = -(pasChodnika / 2 + 3 + 3.5 * (pas % 7));
      pas += 1;
      let punkty = [{ x: a.x, y: a.y }];
      if (SCHEMAT) {
        if (Math.abs(a.y - b.y) > 1) {
          const sy = a.y + (b.y - a.y) * 0.55 + (pas % 3) * 2;
          punkty.push({ x: a.x, y: sy }, { x: b.x, y: sy });
        }
      }
      const t = !SCHEMAT && a.lok && b.lok ? trasa(a.lok, b.lok) : null;
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
      const blade = a.obcy || b.obcy ? ' opacity="0.35"' : '';
      czesci.kable.push(`<polyline points="${punkty.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${kolor}" stroke-width="${grubKabla.toFixed(1)}"${kreski}${blade} stroke-linejoin="round"/><polyline points="${punkty.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}" fill="none" stroke="transparent" stroke-width="12" data-kabel="${esc(idKabla)}" class="plan-klik"/>`);
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
      czesci.obiekty.push(`<g data-obiekt="${esc(klucz)}" class="plan-klik"${p.obcy ? ' opacity="0.35"' : ''}>${symbol(def.symbol, p.x, p.y, obw, sk(), napiecieObiektu(def.store, rec))}</g>`);
      if (def.store === 'poleRozdzielcze' && !SCHEMAT) continue;
      const [rx, ry] = rozmiarSymbolu(def.symbol);
      let tytul = def.store === 'przenosniki' ? [rec.pr_typ, rec.pr_nr].filter(Boolean).join(' ') : rec[def.title];
      if (p.zdalna) tytul = `${tytul || ''} (poza rejonem)`;
      if (p.obcy) tytul = `${tytul || ''}${dopiskObcego(def.store, rec)}`;
      const pol = opis(p.x, p.y, tytul || '(bez nazwy)', { rx, ry, wazny: def.store === 'rozdzielnie' || def.store === 'kb' });
      if (warstwy.daneObiektow) podpis(pol, daneObiektu(def.store, rec));
    }

    for (const args of opisyKabli) opis(...args);

    // nazwy chodników
    if (warstwy.chodniki && !SCHEMAT) {
      for (const g of geo.values()) {
        if (ukryty('chodniki', g.rec)) continue;
        const srodek = naEkran({ x: g.x0 + (g.dx * g.len) / 2, y: g.y0 + (g.dy * g.len) / 2 }, v);
        opis(srodek.x, srodek.y, opisChodnika(g.rec) + (g.brakDanych ? ' ⚠' : ''), { rx: 10 * sk(), ry: 12 * sk(), rozmiar: Math.round(8.5 + 2.5 * sk()), kolor: KOLOR.tekstChodnika });
      }
    }

    const svg = `
      <defs>
        <marker id="plan-strzalka-${tryb}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${KOLOR.drazenie}"/></marker>
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

  function odswiezWyborRejonu() {
    const sel = container.querySelector('[data-akcja-rejon]');
    if (!sel) return;
    const lista = rejony().lista;
    if (mojRejon !== 'wszystkie' && !lista.includes(mojRejon)) mojRejon = 'wszystkie';
    sel.innerHTML = ['wszystkie', ...lista].map((o) => `<option ${o === mojRejon ? 'selected' : ''}>${esc(o)}</option>`).join('');
  }

  const skalaPowiekszenia = () => (widok.sFit ? Math.max(0.05, Math.min(40, widok.s / widok.sFit)) : 1);

  function render() {
    odswiezWyborRejonu();
    if (SCHEMAT && !ukladSchematu().size) {
      svgEl.innerHTML = '';
      wrapEl.classList.add('hidden');
      legendaEl.innerHTML = '';
      brakiEl.innerHTML = `<div class="plan-pusty"><p><b>Graf zasilania jest pusty.</b> Rysuje się sam z danych: rozdzielnie, pola, transformatory, wyłączniki, odbiorniki, KB i napędy z polami „zasilany z”. Dodaj pierwszy element przyciskiem „+ Dodaj element” albo zaimportuj dane w Synchronizacji.</p></div>`;
      return;
    }
    if (!SCHEMAT && !(dane.chodniki || []).length) {
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
    // 05.11.2026 (Piotr): powiększenie skaluje proporcjonalnie długości i wielkość elementów (symbole, linie, napisy):
    // rysunek powstaje w skali dopasowania, a przybliżenie to jedno skalowanie całości (k)
    const k = skalaPowiekszenia();
    const w = rysuj({ s: widok.s / k, tx: widok.tx / k, ty: widok.ty / k }, { szer: szer / k, wys: wys / k });
    pozycje = Object.fromEntries(Object.entries(w.poz).map(([kl, q]) => [kl, { ...q, x: q.x * k, y: q.y * k }]));
    svgEl.setAttribute('width', szer);
    svgEl.setAttribute('height', wys);
    svgEl.setAttribute('viewBox', `0 0 ${szer} ${wys}`);
    svgEl.innerHTML = k === 1 ? w.svg : `<g transform="scale(${k.toFixed(4)})">${w.svg}</g>`;
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
    const kabel = (kolor, tekst, kreski = '', grub = 2.4) => `<span class="plan-leg"><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke="${kolor}" stroke-width="${grub}"${kreski}/></svg>${tekst}</span>`;
    legendaEl.innerHTML = `
      ${pozycja('rozdzielnia', 'Rozdzielnia (szyna zbiorcza)', [6, 6])}
      ${pozycja('pole', 'Pole z wyłącznikiem', [6, 6])}
      ${pozycja('transformator', 'Transformator SN/nn')}
      ${pozycja('urzadzenie', 'Wyłącznik / szafa stycznikowa / zespół', [1, 1])}
      ${pozycja('naped', 'Urządzenie końcowe (silnik M, pompa, napęd)')}
      ${pozycja('kombajn', 'Kombajn / KB')}
      ${kabel(KOLOR.sn, 'Zasilanie 6 kV', '', 2.8)}
      ${kabel(KOLOR.nn1, 'Zasilanie 1 kV', '', 2.0)}
      ${kabel(KOLOR.nn05, 'Zasilanie 0,5 kV', '', 1.5)}
      ${kabel(KOLOR.nn1, 'Odpływ do urządzenia końcowego', ' stroke-dasharray="6 3.5"', 1.3)}
      ${kabel(KOLOR.obrys, 'Kabel rezerwowy', ' stroke-dasharray="10 3 2 3"')}
      ${SCHEMAT ? '' : `<span class="plan-leg"><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke="${KOLOR.przenosnik}" stroke-width="4"/><line x1="0" y1="5" x2="34" y2="5" stroke="#fff" stroke-width="1.8" stroke-dasharray="1.5 6"/></svg>Przenośnik</span>
      <span class="plan-leg"><svg width="34" height="10"><line x1="0" y1="5" x2="26" y2="5" stroke="${KOLOR.drazenie}" stroke-width="2.5"/><path d="M24,1 L33,5 L24,9 z" fill="${KOLOR.drazenie}"/></svg>Kierunek drążenia</span>`}
      ${warstwy.zrodlo ? `<span class="plan-leg">Obrys: <b style="color:${KOLOR.zrodlo.Excel}">Excel</b> · <b style="color:${KOLOR.zrodlo['ręcznie']}">ręcznie</b> · <b style="color:${KOLOR.zrodlo.pomiar}">pomiar</b> · <b style="color:${KOLOR.zrodlo['']}">nie podano</b></span>` : ''}
    `;
  }

  function blokKatalogu() {
    const wiersze = katalog.map((w, i) => `<li><b>${esc(w.typ)}</b>: ${esc(w.nap.join(' / '))} — <i>${w.zrodlo ? esc(w.zrodlo) : '<span style="color:#c62828">bez źródła w dokumentacji</span>'}</i> <button type="button" class="btn-small" data-katalog-usun="${i}">Usuń</button></li>`).join('');
    return `<details class="plan-brak plan-katalog"><summary>Katalog typów aparatów — napięcia (${katalog.length})</summary>
      <p class="field-hint">Typ rozpoznawany po początku nazwy urządzenia (np. „WSN-40P/1” pasuje do „WSN-40P/1 nr 5”). Przy dodawaniu napięcie ustawi się samo, a złe napięcie trafi do niezgodnych. Typy dostępne na każde napięcie nie muszą być wpisane. Napięcia wpisuj tylko z dokumentacji urządzenia (DTR, tabliczka znamionowa, karta producenta) i podaj źródło.</p>
      <ul>${wiersze || '<li>pusty</li>'}</ul>
      <div class="plan-katalog-dodaj"><input type="text" data-katalog-typ placeholder="typ, np. WSN-40P/1">
        ${NAPIECIA_KATALOGU.map((n) => `<label><input type="checkbox" data-katalog-nap value="${n}"> ${n}</label>`).join(' ')}
        <input type="text" data-katalog-zrodlo placeholder="źródło, np. DTR str. 4 / tabliczka"> <button type="button" class="btn-small" data-katalog-dodaj="1">Dodaj typ</button></div>
    </details>`;
  }

  async function zmienKatalog(fn) {
    const otwarty = brakiEl.querySelector('.plan-katalog')?.open;
    const k = await wczytajKatalog();
    fn(k);
    await zapiszKatalog(k);
    katalog = k;
    render();
    const d = brakiEl.querySelector('.plan-katalog');
    if (d && otwarty) d.open = true;
  }

  function renderBraki(w) {
    const bezPolozenia = [];
    for (const def of OBIEKTY) {
      for (const rec of dane[def.store] || []) {
        if (!SCHEMAT && !w.poz[`${def.store}:${rec.id}`] && !ukryty(def.store, rec)) bezPolozenia.push({ def, rec });
      }
    }
    const przenBez = (dane.przenosniki || []).filter((r) => !w.poz[`przenosniki:${r.id}`]);
    const bezKabla = w.kable.filter((k) => !maOpisKabla(k.cel.rec, k.prefiks));
    const niewidoczne = w.kable.filter((k) => !k.narysowany && !ukryty(k.cel.store, k.cel.rec) && !ukryty(k.zrodlo.store, k.zrodlo.rec));
    const chodnikiBraki = [...geo.values()].filter((g) => g.brakDanych);
    const niezgodne = w.kable.map((k) => ({ k, pow: problemyPolaczenia(k, w.kable) })).filter((x) => x.pow.length);
    const doSprawdzenia = kilkaOdplywow(w.kable);
    const zasilaneUrz = new Set(w.kable.filter((k) => k.cel.store === 'urzadzenia').map((k) => k.cel.rec.id));
    const zlyTyp = (dane.urzadzenia || []).filter((r) => !zasilaneUrz.has(r.id)).map((r) => ({ rec: r, pow: problemTypu('urzadzenia', r) })).filter((x) => x.pow);
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
      blok('Połączenia niezgodne z układem zasilania', niezgodne.map(({ k, pow }) => `<li>${esc(nazwa(k.zrodlo.store, k.zrodlo.rec))} → ${esc(nazwa(k.cel.store, k.cel.rec))}: ${esc(pow.join('; '))} <button type="button" class="btn-small" data-zasilanie="${k.cel.store}:${k.cel.rec.id}">Zmień zasilanie</button></li>`)),
      blok('Silniki z napięciem niezgodnym z zasilaniem', problemySilnikow().map(({ s, pow }) => `<li>${esc(pow)} <button type="button" class="btn-small" data-edytuj="silniki:${s.id}">Edytuj silnik</button></li>`)),
      blok('Urządzenia z napięciem niezgodnym z typem', zlyTyp.map(({ rec, pow }) => `<li>${esc(nazwa('urzadzenia', rec))}: ${esc(pow)} <button type="button" class="btn-small" data-edytuj="urzadzenia:${rec.id}">Edytuj</button></li>`)),
      blok('Do sprawdzenia: wyłącznik z kilkoma odpływami do urządzeń końcowych (zwykle jeden)', doSprawdzenia.map(({ rec, cele }) => `<li>${esc(nazwa('urzadzenia', rec))} → ${esc(cele.join(', '))}</li>`)),
      blok('Kable nienarysowane (jeden z końców bez położenia)', niewidoczne.map((k) => `<li>${esc(nazwa(k.zrodlo.store, k.zrodlo.rec))} → ${esc(nazwa(k.cel.store, k.cel.rec))}</li>`)),
      blok('Zasilanie wpisane tekstem, spoza bazy', w.spozaBazy.map((s) => `<li>${esc(nazwa(s.store, s.rec))}: „${esc(s.opis)}” <button type="button" class="btn-small" data-edytuj="${s.store}:${s.rec.id}">Edytuj</button></li>`)),
      blok('Chodniki bez kierunku lub długości (przyjęto 90° / 100 m)', chodnikiBraki.map((g) => `<li>${esc(g.rec.ch_nazwa)} <button type="button" class="btn-small" data-edytuj="chodniki:${g.rec.id}">Edytuj</button></li>`)),
    ].join('') || '<p class="field-hint">Wszystkie obiekty mają położenie, a połączenia — opis kabla.</p>';
    brakiEl.insertAdjacentHTML('beforeend', blokKatalogu());
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
    const chNap = store === 'przenosniki' ? chodnikNapedu(rec) : rozwiaz(rec.lok_chodnik, dane.chodniki || [], 'ch_nazwa');
    const wChodniku = chNap && !przyObiekcie(rec) ? `<p class="plan-karta-kabel">Chodnik: ${esc(opisChodnika(chNap))}${chNap.ch_nr || chNap.ch_rodzaj ? '' : ' — nr i rodzaj chodnika można dopisać w zakładce Chodniki'} <button type="button" class="btn-small" data-edytuj="chodniki:${chNap.id}">Edytuj chodnik</button></p>` : '';
    const odd = oddzialRek(store, rec);
    const oddz = odd && !rec.oddzial ? `<p class="plan-karta-kabel">Oddział: ${esc(odd)} (jak źródło zasilania)</p>` : '';
    const rejW = rejony().wlasny.get(`${store}:${rec.id}`);
    const rejZ = [...rejonyEl(store, rec)].filter((x) => x !== rejW);
    const rejon = rejW || rejZ.length ? `<p class="plan-karta-kabel">${rejW ? `Rejon: ${esc(rejW)}${store === 'kb' || rec.rejon ? '' : ' (z sieci zasilania)'}` : ''}${rejW && rejZ.length ? ' · ' : ''}${rejZ.length ? `na drodze zasilania rejonu ${esc(rejZ.join(', '))}` : ''}</p>` : '';
    const przy = przyObiekcie(rec);
    const umiejsc = przy ? `<p class="plan-karta-kabel">Umiejscowienie: przy ${esc(opisObiektu(przy.store, przy.rec))}</p>` : '';
    const kabel = maOpisKabla(rec, 'kabel') ? `<p class="plan-karta-kabel">Kabel zasilający: ${esc(opisKabla(rec, 'kabel'))}${rec.kabel_odplyw ? ` (odpływ: ${esc(rec.kabel_odplyw)})` : ''}</p>` : '';
    otworzKarte(`
      <h4>${esc(def.labelSingular)}: ${esc(rec[def.titleField] || '')}</h4>
      <table>${wiersze}</table>
      ${wChodniku}
      ${oddz}
      ${rejon}
      ${umiejsc}
      ${kabel}
      <div class="form-actions">
        <button type="button" class="btn-small" data-edytuj="${store}:${id}">Edytuj</button>
        ${store !== 'rozdzielnie' ? `<button type="button" class="btn-small" data-zasilanie="${store}:${id}">Zasilanie…</button>` : ''}
        ${DOMYSLNY_ODPLYW[rodzajRek(store, rec)] ? `<button type="button" class="btn-small" data-odplyw="${store}:${id}">+ Odpływ stąd</button>` : ''}
        ${store === 'rozdzielnie' ? `<button type="button" class="btn-small" data-dodaj-pole="${id}">+ Pole</button>` : ''}
        ${!SCHEMAT && store !== 'poleRozdzielcze' && store !== 'przenosniki' ? `<button type="button" class="btn-small" data-postaw="${store}:${id}">Przestaw</button>` : ''}
        ${!SCHEMAT && MOZE_STAC_PRZY.has(store) ? `<button type="button" class="btn-small" data-umiejscowienie="${store}:${id}">Umiejscowienie…</button>` : ''}
        ${!SCHEMAT && (num(rec.plan_dx) || num(rec.plan_dy)) ? `<button type="button" class="btn-small" data-reset="${store}:${id}">Cofnij przesunięcie</button>` : ''}
        ${onPokazWInnymWidoku ? `<button type="button" class="btn-small" data-inny-widok="${store}:${id}">${SCHEMAT ? 'Na planie' : 'W grafie'}</button>` : ''}
        ${onShowInMap ? `<button type="button" class="btn-small" data-mapa="${store}:${id}">W Mapie</button>` : ''}
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
      await nadzorUpdate(store, { ...rec, lok_chodnik: n.id, lok_metraz: n.m, lok_strona: n.strona, lok_przy: '', plan_dx: 0, plan_dy: 0 });
    }
    await wczytajDane();
    render();
  }

  // Oddział elektryczny (05.11.2026): wpisany przy elemencie albo jak źródło (transformator) — rozdzielnie i pola wspólne
  function oddzialRek(store, rec, d = 0) {
    if (!rec || d > 12) return '';
    if (rec.oddzial) return rec.oddzial;
    if (store === 'rozdzielnie' || store === 'poleRozdzielcze') return '';
    const zr = zrodloRek(store, rec);
    return zr && zr.store !== 'poleRozdzielcze' ? oddzialRek(zr.store, zr.rec, d + 1) : '';
  }
  const obcyOddzial = (store, rec) => { const o = oddzialRek(store, rec); return mojOddzial !== 'wszystkie' && !!o && o !== mojOddzial; };

  // Rejon (05.11.2026): z sieci (siec-zasilania.js); chodnik należy do rejonu, gdy stoją w nim elementy rejonu
  // (razem z chodnikami, od których odchodzi), albo gdy rejon wpisano przy chodniku (np. chodnik w przygotowaniu).
  let rejCache = null;
  let rejDane = null;
  function rejony() {
    if (rejCache && rejDane === dane) return rejCache;
    const r = rejonySieci(dane);
    const chodnikow = new Map();
    const dodajCh = (chId, nazwa, d = 0) => {
      if (!chId || d > 30) return;
      if (!chodnikow.has(chId)) chodnikow.set(chId, new Set());
      if (chodnikow.get(chId).has(nazwa)) return;
      chodnikow.get(chId).add(nazwa);
      const ch = (dane.chodniki || []).find((c) => c.id === chId);
      const nad = ch && rozwiaz(ch.ch_od_chodnika, dane.chodniki || [], 'ch_nazwa');
      if (nad) dodajCh(nad.id, nazwa, d + 1);
    };
    for (const ch of dane.chodniki || []) {
      const w = ch.rejon ? rozwiaz(ch.rejon, dane.kb || [], 'kb_nazwa')?.kb_nazwa || (typeof ch.rejon === 'number' ? '' : String(ch.rejon).trim()) : '';
      if (w) dodajCh(ch.id, w);
    }
    for (const st of MAGAZYNY_REJONU) {
      for (const rec of dane[st] || []) {
        const nazwa = r.wlasny.get(`${st}:${rec.id}`);
        const lok = nazwa && st !== 'poleRozdzielcze' ? lokalizacja(st, rec) : null;
        if (lok) dodajCh(lok.ch, nazwa);
      }
    }
    const lista = [...new Set([...r.lista, ...[...chodnikow.values()].flatMap((x) => [...x])])].sort((a, b) => a.localeCompare(b, 'pl'));
    rejCache = { ...r, chodnikow, lista };
    rejDane = dane;
    return rejCache;
  }
  const rejonyEl = (store, rec) => (store === 'chodniki' ? rejony().chodnikow.get(rec.id) : rejony().wRejonie.get(`${store}:${rec.id}`)) || new Set();
  const obcyRejon = (store, rec) => { if (mojRejon === 'wszystkie') return false; const z = rejonyEl(store, rec); return z.size > 0 && !z.has(mojRejon); };
  const obcyEl = (store, rec) => obcyOddzial(store, rec) || obcyRejon(store, rec);
  const ukryty = (store, rec) => !warstwy.inneOddzialy && obcyEl(store, rec);
  const dopiskObcego = (store, rec) => (obcyOddzial(store, rec) ? ` · odd. ${oddzialRek(store, rec)}` : ` · rejon ${[...rejonyEl(store, rec)].join(', ')}`);

  // opis chodnika: "nr 2 Chodnik 1 (odstawczy)"
  const opisChodnika = (ch) => (ch ? [ch.ch_nr ? `nr ${ch.ch_nr}` : '', ch.ch_nazwa || '', ch.ch_rodzaj ? `(${ch.ch_rodzaj})` : ''].filter(Boolean).join(' ') : '');
  const chodnikNapedu = (pr) => rozwiaz(pr?.pr_chodnik, dane.chodniki || [], 'ch_nazwa');

  // ---------- umiejscowienie przy obiekcie (05.11.2026) ----------
  const MOZE_STAC_PRZY = new Set(['urzadzenia', 'transformatory', 'kb', 'maszyny']);
  const MAGAZYNY_PRZY = ['przenosniki', 'urzadzenia', 'kb', 'maszyny', 'transformatory', 'rozdzielnie'];
  function opisObiektu(store, rec) {
    if (store === 'przenosniki') {
      const ch = chodnikNapedu(rec);
      return `napędzie przenośnika ${rec.pr_nr ?? ''}${ch ? ` (${opisChodnika(ch)})` : ''}`;
    }
    if (store === 'rozdzielnie') return `rozdzielni ${rec.nazwa_r ?? ''}`;
    if (store === 'transformatory') return `transformatorze ${rec.t_nr ?? ''}`;
    if (store === 'kb') return `kombajnie ${rec.kb_nazwa ?? ''}`;
    if (store === 'maszyny') return `maszynie ${rec.m_nazwa ?? ''}`;
    return `${jestOdbiornik(rec) ? 'urządzeniu' : 'wyłączniku'} ${rec.nazwa ?? ''}`;
  }
  // [{ wartosc: 'magazyn:id', opis }] — najpierw to, co element zasila, potem jego źródło, potem reszta;
  // bez niego samego i bez obiektów, które już stoją przy nim (pętla)
  function opcjePrzy(store, id) {
    const ja = store && id !== undefined ? `${store}:${id}` : null;
    const pol = polaczenia().wynik;
    const zasila = new Set(ja ? pol.filter((p) => `${p.zrodlo.store}:${p.zrodlo.rec.id}` === ja).map((p) => `${p.cel.store}:${p.cel.rec.id}`) : []);
    const zrodlo = ja ? pol.find((p) => `${p.cel.store}:${p.cel.rec.id}` === ja && p.prefiks !== 'kabel_rez') : null;
    const stojaPrzyMnie = (k, d = 0) => {
      if (!ja || d > 6) return false;
      const [s0, i0] = k.split(':');
      const r = (dane[s0] || []).find((x) => x.id === Number(i0));
      if (!r?.lok_przy) return false;
      return r.lok_przy === ja || stojaPrzyMnie(r.lok_przy, d + 1);
    };
    const wszystkie = [];
    for (const m of MAGAZYNY_PRZY) {
      for (const r of dane[m] || []) {
        const k = `${m}:${r.id}`;
        if (k === ja || stojaPrzyMnie(k)) continue;
        const ranga = zasila.has(k) ? 0 : zrodlo && k === `${zrodlo.zrodlo.store}:${zrodlo.zrodlo.rec.id}` ? 1 : 2;
        wszystkie.push({ wartosc: k, opis: `${ranga === 0 ? 'zasila: ' : ranga === 1 ? 'źródło: ' : ''}przy ${opisObiektu(m, r)}`, ranga });
      }
    }
    return wszystkie.sort((a, b) => a.ranga - b.ranga || a.opis.localeCompare(b.opis, 'pl'));
  }

  function pokazUmiejscowienie(store, id) {
    const rec = (dane[store] || []).find((r) => r.id === id);
    if (!rec) return;
    zamknijKarte();
    const opcje = opcjePrzy(store, id);
    dodajEl.dataset.tryb = 'umiejscowienie';
    dodajEl.dataset.cel = `${store}:${id}`;
    dodajEl.innerHTML = `
      <h4>Umiejscowienie: ${esc(opisRek(store, rec))}</h4>
      <div class="plan-dodaj-pola">
        <label>Stoi przy
          <select name="przy"><option value="">— na chodniku (metraż; ustaw przyciskiem Przestaw) —</option>${opcjeSelect(opcje, null, rec.lok_przy || '')}</select>
        </label>
        <label>Strona
          <select name="strona">${['lewa', 'prawa'].map((o) => `<option ${o === (rec.lok_strona || 'prawa') ? 'selected' : ''}>${o}</option>`).join('')}</select>
        </label>
      </div>
      <p class="plan-dodaj-uwaga">Np. wyłącznik napędowy przy napędzie, który zasila. Element stanie przy wskazanym obiekcie i będzie się przesuwał razem z nim. Na górze listy: to, co element zasila, i jego źródło. Strona ma znaczenie, gdy obiekt stoi na osi chodnika (napęd, kombajn).</p>
      <div class="form-actions">
        <button type="submit" class="btn-small btn-primary">Zapisz</button>
        <button type="button" class="btn-small" data-akcja="anuluj-dodawanie">Anuluj</button>
      </div>`;
    dodajEl.classList.remove('hidden');
    dodajEl.scrollIntoView({ block: 'nearest' });
  }

  async function zapiszUmiejscowienie() {
    const f = new FormData(dodajEl);
    const [store, id] = String(dodajEl.dataset.cel || '').split(':');
    const rec = (await nadzorGetAll(store)).find((r) => r.id === Number(id));
    if (!rec) return;
    const przy = String(f.get('przy') || '');
    await nadzorUpdate(store, { ...rec, lok_przy: przy, ...(przy ? { lok_strona: f.get('strona') || 'prawa', plan_dx: 0, plan_dy: 0 } : {}) });
    zamknijDodawanie();
    await wczytajDane();
    render();
    if (!SCHEMAT && !przy && !lokalizacja(store, { ...rec, lok_przy: '' })) zacznijStawianie(store, Number(id));
  }

  // ---------- edycja układu: dodawanie, zasilanie, odpływ, usuwanie ----------
  // Wpisuje te same pola "zasilany z" co formularze — zmiana widać od razu na planie, w Grafie i w Mapie rejonu.
  // Listy źródeł i odpływów pokazują tylko połączenia zgodne z układem (ZRODLA_RODZAJU) i bez pętli.

  const nazwaRek = (store, rec) => rec[NADZOR_ENTITIES[store]?.titleField] || `#${rec.id}`;
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
    if (cel === 'odbiornik' || cel === 'kb' || cel === 'maszyny' || cel === 'przenosniki') return 'zasilanie powinno iść z wyłącznika';
    return 'niezgodne z układem zasilania';
  }

  const fmtKV = (v) => znacznikNapiecia(v);
  // przeloty po stronie pierwotnej transformatora (do transformatora albo aparatu 6 kV)
  const przelotyPierwotne = (trafoId, pol) => pol.filter((p) => p.zrodlo.store === 'transformatory' && p.zrodlo.rec.id === trafoId && rodzajPolaczenia(p) === 'przelot');

  // 05.11.2026 (Piotr): napięcie zasilania zawsze zgodne z urządzeniem zasilającym i sterującym; urządzenia końcowe
  // (odbiornik, KB, maszyna, napęd) w 99% jednonapięciowe — ich napięcie = napięcie wyłącznika
  function problemNapiecia(p) {
    if (!['urzadzenia', 'kb', 'maszyny', 'przenosniki'].includes(p.cel.store)) return null;
    const o = opcjeOd(p.zrodlo.store, p.zrodlo.rec, p.cel.store, p.cel.rec);
    if (!o) return null;
    const v = kv(p.cel.rec.nap_zas);
    if (v === null) return o.length > 1 ? `źródło dwunapięciowe (${o.map(fmtKV).join(' / ')}) — wybierz napięcie urządzenia` : null;
    if (!o.some((x) => rowneKV(x, v))) return `${p.cel.store === 'urzadzenia' ? 'urządzenie' : 'urządzenie końcowe'} ${fmtKV(v)}, a ${p.zrodlo.store === 'urzadzenia' ? 'wyłącznik' : 'źródło'} daje ${o.map(fmtKV).join(' albo ')}`;
    return null;
  }

  // Silniki (05.11.2026): jednonapięciowy (1 kV / 0,5 kV) albo przełączalny 0,5/1 kV; musi pasować do napięcia,
  // na którym pracuje maszyna (z wyłącznika; gdy brak zasilania w bazie — wpisane napięcie maszyny).
  const napieciaSilnika = (s) => String(s?.napiecie_zas || '').split('/').map((x) => kv(x)).filter((x) => x !== null).map(napiecieSieci);
  const SILNIKI_W = ['kb', 'maszyny', 'przenosniki', 'urzadzenia'];
  function problemySilnikow() {
    const wynik = [];
    for (const st of SILNIKI_W) {
      for (const rec of dane[st] || []) {
        if (!Array.isArray(rec.silniki) || !rec.silniki.length || ukryty(st, rec)) continue;
        const v = napiecieEfektywne(st, rec) ?? kv(rec.nap_zas);
        if (v === null || v === undefined) continue;
        for (const id of rec.silniki) {
          const s = (dane.silniki || []).find((x) => x.id === id);
          const nap = napieciaSilnika(s);
          if (!s || !nap.length || nap.some((x) => rowneKV(x, v))) continue;
          wynik.push({ st, rec, s, pow: `silnik ${s.nazwa_silnika || '#' + s.id} (${s.napiecie_zas}${nap.length > 1 ? ', przełączalny' : ''}) w ${opisObiektu(st, rec)}, a zasilanie ${fmtKV(v)}` });
        }
      }
    }
    return wynik;
  }

  // wszystkie powody niezgodności: reguła układu, napięcie, strona pierwotna transformatora (zasilanie + 1 przelot)
  function problemyPolaczenia(p, pol = polaczenia().wynik) {
    const pow = [];
    if (!zgodnePolaczenie(p)) pow.push(powodNiezgodnosci(p));
    const n = problemNapiecia(p);
    if (n) pow.push(n);
    const t = problemTypu(p.cel.store, p.cel.rec);
    if (t) pow.push(t);
    if (p.zrodlo.store === 'transformatory' && rodzajPolaczenia(p) === 'przelot') {
      const lista = przelotyPierwotne(p.zrodlo.rec.id, pol);
      const i = lista.findIndex((q) => q.cel.store === p.cel.store && q.cel.rec.id === p.cel.rec.id);
      if (lista.length > 1 && i > 0) pow.push('transformator ma po stronie pierwotnej tylko dwa przyłącza: zasilanie i jeden przelot');
    }
    return pow;
  }

  // typ aparatu z katalogu pracuje tylko na wybranych napięciach (np. WSN-40P/1 — tylko 0,5 kV)
  function problemTypu(store, rec) {
    if (store !== 'urzadzenia') return null;
    const w = typAparatu(rec.nazwa, katalog);
    const v = kv(rec.nap_zas);
    if (!w || v === null || w.nap.some((x) => rowneKV(kv(x), v))) return null;
    return `typ ${w.typ} pracuje tylko na ${w.nap.join(' / ')}, a wpisano ${fmtKV(v)}`;
  }

  function kilkaOdplywow(pol) {
    const m = new Map();
    for (const p of pol) {
      if (p.zrodlo.store !== 'urzadzenia' || rodzajPolaczenia(p) !== 'odplyw') continue;
      const w = m.get(p.zrodlo.rec.id) || { rec: p.zrodlo.rec, cele: [] };
      w.cele.push(nazwaRek(p.cel.store, p.cel.rec));
      m.set(p.zrodlo.rec.id, w);
    }
    return [...m.values()].filter((w) => w.cele.length > 1);
  }

  // napięcia do wyboru w formularzu urządzenia przy danym źródle ('pole|magazyn|id'); null = pełna lista
  function opcjeNapieciaFormularza(rodzajId, wartoscZrodla, celRec = null) {
    if (!['wylacznik', 'odbiornik', 'maszyny'].includes(rodzajId) || !wartoscZrodla) return null;
    const [, zStore, id] = String(wartoscZrodla).split('|');
    const zRec = (dane[zStore] || []).find((r) => r.id === Number(id));
    const o = opcjeOd(zStore, zRec, 'urzadzenia', { ...(celRec || {}), nap_zas: '' });
    return o && o.length ? o.map(fmtKV) : null;
  }

  // napięcia do wyboru: część wspólna tego, co daje źródło, i tego, na czym pracuje typ aparatu z katalogu
  function napieciaDoWyboru(rodzajId, wartoscZrodla, celRec, nazwa) {
    const wgZrodla = opcjeNapieciaFormularza(rodzajId, wartoscZrodla, celRec);
    const w = ['wylacznik', 'odbiornik'].includes(rodzajId) ? typAparatu(nazwa, katalog) : null;
    const baza = wgZrodla || NAP_URZ.opcje;
    if (!w) return { opcje: baza, uwaga: wgZrodla && wgZrodla.length > 1 ? 'Transformator dwunapięciowy — wybierz stronę wtórną.' : wgZrodla ? 'Napięcie wynika ze źródła.' : '' };
    const wspolne = baza.filter((o) => w.nap.some((x) => rowneKV(kv(x), kv(o))));
    if (wspolne.length) return { opcje: wspolne, uwaga: `Typ ${w.typ}: ${w.nap.join(' / ')}${wgZrodla ? ', zgodnie ze źródłem' : ''}.` };
    return { opcje: w.nap, uwaga: `Uwaga: typ ${w.typ} pracuje tylko na ${w.nap.join(' / ')}, a źródło daje ${wgZrodla.join(' / ')} — zmień źródło.` };
  }

  function odswiezNapiecie(rodzajId, celRec = null, domyslneZrodlo = '') {
    const sel = dodajEl.querySelector('[name="napiecie"]');
    if (!sel) return;
    let zr = dodajEl.querySelector('[name="zrodlo"]')?.value || '';
    if (zr === '__bez_zmian') zr = domyslneZrodlo;
    const nazwa = dodajEl.querySelector('[name="nazwa"]')?.value ?? celRec?.nazwa ?? '';
    const { opcje, uwaga } = napieciaDoWyboru(rodzajId, zr, celRec, nazwa);
    const teraz = sel.value || (celRec ? fmtKV(kv(celRec.nap_zas)) : '');
    sel.innerHTML = opcje.map((o) => `<option ${o === teraz ? 'selected' : ''}>${o}</option>`).join('');
    const uw = dodajEl.querySelector('[data-uwaga-napiecia]');
    if (uw) uw.textContent = uwaga;
  }

  // źródło zasilania głównego rekordu (pierwsze rozpoznane pole "zasilany z")
  const zrodloRek = (store, rec) => zrodloSieci(dane, store, rec);
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
    const pol = polaczenia().wynik;
    for (const [pole, zStore, zRodzaj] of ZRODLA_RODZAJU[rodzajId] || []) {
      for (const r of dane[zStore] || []) {
        if (rodzajRek(zStore, r) !== zRodzaj || zakazane.has(`${zStore}:${r.id}`)) continue;
        // strona pierwotna transformatora: zasilanie + jeden przelot (05.11.2026)
        if (pole === 'zasilany_z_transformatora' && zStore === 'transformatory'
          && przelotyPierwotne(r.id, pol).some((q) => !(wyklucz && q.cel.store === wyklucz.store && q.cel.rec.id === wyklucz.id))) continue;
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
          <span class="field-hint" data-uwaga-napiecia></span>
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
        ${MOZE_STAC_PRZY.has(rodzaj.store) ? `<label>Stoi przy
          <select name="przy"><option value="">— kliknę na planie —</option>${odplywy.length ? '<option value="__odplyw">przy elemencie z pola „Odpływ do”</option>' : ''}${opcjeSelect(opcjePrzy(), null)}</select>
        </label>` : ''}
      </div>
      <p class="plan-dodaj-uwaga">${esc(rodzaj.uwaga)} ${jestPole ? 'Pole stanie przy swojej rozdzielni.' : 'Po zapisie kliknij na planie przy chodniku, gdzie stoi element — metraż i strona wpiszą się same.'} Kabel (typ, przekrój, długość) uzupełnisz później w formularzu.</p>
      <div class="form-actions">
        <button type="submit" class="btn-small btn-primary">Zapisz${jestPole ? '' : ' i postaw na planie'}</button>
        <button type="button" class="btn-small" data-akcja="anuluj-dodawanie">Anuluj</button>
      </div>`;
    dodajEl.classList.remove('hidden');
    odswiezNapiecie(rodzaj.id);
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
    let przy = String(f.get('przy') || '');
    if (przy === '__odplyw') {
      const [cs, ci] = String(f.get('odplyw') || '').split('|');
      przy = ci ? `${cs}:${ci}` : '';
    }
    if (przy) Object.assign(rec, { lok_przy: przy, lok_strona: 'prawa' });
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
    if (!SCHEMAT && store !== 'poleRozdzielcze' && !przy) zacznijStawianie(store, noweId);
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
        ${store === 'urzadzenia' ? `<label>Napięcie
          <select name="napiecie"></select>
          <span class="field-hint" data-uwaga-napiecia></span>
        </label>` : ''}
      </div>
      <p class="plan-dodaj-uwaga">${esc(def?.uwaga || '')} Lista pokazuje tylko źródła zgodne z układem, bez elementów zasilanych z tego (bez pętli).</p>
      <div class="form-actions">
        <button type="submit" class="btn-small btn-primary">Zapisz</button>
        <button type="button" class="btn-small" data-akcja="anuluj-dodawanie">Anuluj</button>
      </div>`;
    dodajEl.classList.remove('hidden');
    dodajEl.dataset.rodzajUrz = rodzajId;
    dodajEl.dataset.obecneZrodlo = obecne ? `${obecne.pole}|${obecne.store}|${obecne.rec.id}` : '';
    odswiezNapiecie(rodzajId, rec, dodajEl.dataset.obecneZrodlo);
    dodajEl.scrollIntoView({ block: 'nearest' });
  }

  async function zapiszZasilanie() {
    const f = new FormData(dodajEl);
    const [store, id] = String(dodajEl.dataset.cel || '').split(':');
    const rec = (await nadzorGetAll(store)).find((r) => r.id === Number(id));
    if (!rec) return;
    let nowy = { ...rec };
    if (f.get('u_rodzaj')) nowy.u_rodzaj = f.get('u_rodzaj');
    if (store === 'urzadzenia' && f.get('napiecie')) nowy.nap_zas = f.get('napiecie');
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
    } else if (e.target.name === 'zrodlo') {
      if (dodajEl.dataset.tryb === 'dodaj') odswiezNapiecie(dodajEl.querySelector('[name="rodzaj"]').value);
      else {
        const [store, id] = String(dodajEl.dataset.cel).split(':');
        odswiezNapiecie(dodajEl.dataset.rodzajUrz, (dane[store] || []).find((r) => r.id === Number(id)), dodajEl.dataset.obecneZrodlo);
      }
    }
  });
  dodajEl.addEventListener('input', (e) => {
    if (dodajEl.dataset.tryb === 'dodaj' && e.target.name === 'nazwa') odswiezNapiecie(dodajEl.querySelector('[name="rodzaj"]').value);
  });
  dodajEl.addEventListener('submit', (e) => {
    e.preventDefault();
    if (dodajEl.dataset.tryb === 'zasilanie') zapiszZasilanie();
    else if (dodajEl.dataset.tryb === 'umiejscowienie') zapiszUmiejscowienie();
    else zapiszDodawanie();
  });

  // ---------- przykładowy rejon (wzór AM-1) ----------

  async function wczytajPrzyklad() {
    const P = { _przyklad: MARKER_PRZYKLADU, zrodlo_danych: 'ręcznie' };
    const dodaj = (store, rec) => nadzorAdd(store, { ...P, ...rec });
    const ch1 = await dodaj('chodniki', { ch_nazwa: 'Chodnik 1', ch_nr: '1', ch_rodzaj: 'transportowy', ch_azymut: 90, ch_dlugosc: 320, ch_w_drazeniu: 'nie' });
    const ch2 = await dodaj('chodniki', { ch_nazwa: 'Przecinka 2', ch_nr: '2', ch_rodzaj: 'przecinka', ch_od_chodnika: ch1, ch_od_metraz: 320, ch_azymut: 180, ch_dlugosc: 150, ch_w_drazeniu: 'nie' });
    const ch3 = await dodaj('chodniki', { ch_nazwa: 'Chodnik 3', ch_nr: '3', ch_rodzaj: 'odstawczy', ch_od_chodnika: ch2, ch_od_metraz: 150, ch_azymut: 90, ch_dlugosc: 190, ch_w_drazeniu: 'nie' });
    const ch4 = await dodaj('chodniki', { ch_nazwa: 'Chodnik 4', ch_nr: '4', ch_rodzaj: 'odstawczy', ch_od_chodnika: ch3, ch_od_metraz: 190, ch_azymut: 180, ch_dlugosc: 140, ch_w_drazeniu: 'nie' });
    const ch5 = await dodaj('chodniki', { ch_nazwa: 'Chodnik 5 (przodek)', ch_nr: '5', ch_rodzaj: 'dowierzchnia', ch_od_chodnika: ch4, ch_od_metraz: 140, ch_azymut: 148, ch_dlugosc: 320, ch_w_drazeniu: 'tak' });
    const r = await dodaj('rozdzielnie', { nazwa_r: 'R-650', r_napiecie: '6 kV', lok_chodnik: ch1, lok_metraz: 0, lok_strona: 'lewa' });
    const p1 = await dodaj('poleRozdzielcze', { p_nazwa: 'R-650 pole 1', miejsce_zabudowy: r });
    const p2 = await dodaj('poleRozdzielcze', { p_nazwa: 'R-650 pole 2', miejsce_zabudowy: r });
    const k = (nr, przekroj, dl) => ({ kabel_nr: nr, kabel_przekroj: przekroj, kabel_dlugosc: dl });
    const t1 = await dodaj('transformatory', { t_nr: 'It3sb 340', t_napiecie: '6/0,5/1 kV', zasilany_z_pola: p1, lok_chodnik: ch1, lok_metraz: 190, lok_strona: 'lewa', ...k('K1', '3x50', 200) });
    const t2 = await dodaj('transformatory', { t_nr: 'Mar 439', t_napiecie: '6/0,5/1 kV', zasilany_z_pola: p2, lok_chodnik: ch4, lok_metraz: 80, lok_strona: 'lewa', ...k('K2', '3x50', 690) });
    const u = async (nazwa, zT, zU, ch, m, strona, kab, nap = '1 kV') =>
      dodaj('urzadzenia', { nazwa, u_rodzaj: nazwa.startsWith('HMC') ? U_RODZAJE[1] : U_RODZAJE[0], nap_zas: nap, zasilane_z_transformatora: zT ?? '', zasilane_z_urzadzenia: zU ?? '', lok_chodnik: ch, lok_metraz: m, lok_strona: strona, ...(kab || {}) });
    const u1 = await u('WSN-40P/1', t1, null, ch2, 150, 'prawa', k('K3', '3x95', 290), '0,5 kV'); // WSN-40P/1 tylko 500 V (Piotr, 05.11)
    const u2 = await u('BTH-125', t1, null, ch2, 150, 'prawa', k('K4', '3x70', 290));
    const u3 = await u('RE-22 (1.4)', t2, null, ch3, 190, 'lewa', k('K5', '3x35', 80), '0,5 kV'); // przykład: trafo dwunapięciowe, 0,5 kV
    const u4 = await u('RE-22 (1.5)', t2, null, ch4, 140, 'lewa', k('K6', '3x35', 60), '0,5 kV');
    await u('ZT-145', t2, null, ch4, 140, 'lewa', null, '0,5 kV');
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
    for (const store of ['chodniki', 'przenosniki', 'rozdzielnie', 'poleRozdzielcze', 'transformatory', 'urzadzenia', 'kb', 'maszyny']) {
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
    if (t.dataset.katalogUsun !== undefined) {
      const i = Number(t.dataset.katalogUsun);
      if (confirm(`Usunąć typ ${katalog[i]?.typ} z katalogu?`)) await zmienKatalog((k) => k.splice(i, 1));
    }
    if (t.dataset.katalogDodaj) {
      const typ = String(brakiEl.querySelector('[data-katalog-typ]')?.value || '').trim();
      const nap = [...brakiEl.querySelectorAll('[data-katalog-nap]:checked')].map((x) => x.value);
      const zrodlo = String(brakiEl.querySelector('[data-katalog-zrodlo]')?.value || '').trim();
      if (!typ || !nap.length || !zrodlo) { alert('Podaj typ, zaznacz napięcie i wpisz źródło z dokumentacji (DTR, tabliczka, karta producenta).'); return; }
      await zmienKatalog((k) => {
        const i = k.findIndex((x) => x.typ.toUpperCase().replace(/[\s_-]/g, '') === typ.toUpperCase().replace(/[\s_-]/g, ''));
        if (i >= 0) Object.assign(k[i], { nap, zrodlo }); else k.push({ typ, nap, zrodlo });
      });
    }
    if (t.dataset.edytuj && onEditRecord) {
      const [store, id] = t.dataset.edytuj.split(':');
      onEditRecord(store, Number(id));
    }
    if (t.dataset.umiejscowienie) {
      const [store, id] = t.dataset.umiejscowienie.split(':');
      pokazUmiejscowienie(store, Number(id));
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
    if (t.dataset.innyWidok && onPokazWInnymWidoku) {
      const [store, id] = t.dataset.innyWidok.split(':');
      zamknijKarte();
      onPokazWInnymWidoku(store, Number(id));
    }
    if (t.dataset.mapa && onShowInMap) {
      const [store, id] = t.dataset.mapa.split(':');
      zamknijKarte();
      onShowInMap(store, Number(id));
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

  container.querySelector('[data-akcja-rejon]').addEventListener('change', (e) => {
    mojRejon = e.target.value;
    try { localStorage.setItem('protektor-plan-rejon', mojRejon); } catch {}
    render();
  });
  container.querySelector('[data-akcja-oddzial]').addEventListener('change', (e) => {
    mojOddzial = e.target.value;
    try { localStorage.setItem('protektor-plan-oddzial', mojOddzial); } catch {}
    render();
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
    if (przeciaganie.obiekt && !stawianie && !SCHEMAT) {
      const [store, id] = przeciaganie.obiekt.split(':');
      const rec = (dane[store] || []).find((r) => r.id === Number(id));
      if (rec && store !== 'poleRozdzielcze') {
        rec.plan_dx = (num(rec.plan_dx) || 0) + dx / skalaPowiekszenia();
        rec.plan_dy = (num(rec.plan_dy) || 0) + dy / skalaPowiekszenia();
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
      if (s.obiekt && !stawianie && !SCHEMAT) {
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
    onShowInMap = opts.onShowInMap || null;
    onPokazWInnymWidoku = opts.onPokazWInnymWidoku || null;
    // plan i graf to jedna zakładka Rejon — wybór rejonu, oddziału i warstw wspólny dla obu widoków
    try {
      mojRejon = localStorage.getItem('protektor-plan-rejon') || 'wszystkie';
      mojOddzial = localStorage.getItem('protektor-plan-oddzial') || 'wszystkie';
      warstwy = { ...WARSTWY_DOMYSLNE, ...JSON.parse(localStorage.getItem('protektor-plan-warstwy') || '{}') };
      const sel = container.querySelector('[data-akcja-oddzial]');
      if (sel) sel.value = mojOddzial;
      container.querySelectorAll('[data-warstwa]').forEach((c) => { c.checked = !!warstwy[c.dataset.warstwa]; });
    } catch {}
    await wczytajDane();
    render();
  }

  // Przejście z Mapy rejonu: wycentruj plan na elemencie, zaznacz go i otwórz kartę.
  // Bez położenia: od razu tryb stawiania (klik przy chodniku); pole — gdy jego rozdzielnia nie stoi na planie.
  async function pokaz(store, id) {
    await wczytajDane();
    render();
    const rec = (dane[store] || []).find((r) => r.id === id);
    if (!rec) return false;
    const p = pozycje[`${store}:${id}`];
    if (!p && SCHEMAT) return false;
    if (!p) {
      if (store === 'poleRozdzielcze') {
        stawianieEl.innerHTML = `<b>${esc(rec.p_nazwa)}</b> pojawi się na planie, gdy jego rozdzielnia stanie przy chodniku. <button type="button" class="btn-small" data-akcja="anuluj-stawianie">OK</button>`;
        stawianieEl.classList.remove('hidden');
      } else if ((dane.chodniki || []).length) {
        zacznijStawianie(store, id);
      }
      return false;
    }
    const szer = wrapEl.clientWidth || 800;
    const wys = widok.wys || 500;
    recznie = true;
    widok.tx += szer / 2 - p.x;
    widok.ty += wys / 2 - p.y;
    render();
    const q = pozycje[`${store}:${id}`];
    if (q) {
      svgEl.insertAdjacentHTML('beforeend', `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${(24 * sk() + 10).toFixed(1)}" fill="none" stroke="#e65100" stroke-width="3" class="plan-wskaz"/>`);
      pokazKarte(store, id, q.x, q.y);
    }
    wrapEl.scrollIntoView({ block: 'nearest' });
    return true;
  }

  return { init, pokaz, _test: { problemySilnikow, problemNapiecia, ukladSchematu, tryb, rejony, obcyRejon, ustawRejon: (r, pokazInne = true) => { mojRejon = r; warstwy.inneOddzialy = pokazInne; }, oddzialRek, ustawOddzial: (o, pokazInne = true) => { mojOddzial = o; warstwy.inneOddzialy = pokazInne; }, opisChodnika, opcjePrzy, pozycje: () => rysuj(widok, { szer: 1000, wys: 700 }).poz, problemTypu, napieciaDoWyboru, katalog: () => katalog, zrodlaDla, odplywyDla, zgodnePolaczenie, problemyPolaczenia, rodzajPolaczenia, opcjeNapieciaFormularza, napiecieEfektywne, kilkaOdplywow, polaczenia: () => polaczenia().wynik, wczytajPrzyklad, usunPrzyklad, rysuj: () => rysuj(widok, { szer: 1000, wys: 700 }), dane: () => dane } };
}
