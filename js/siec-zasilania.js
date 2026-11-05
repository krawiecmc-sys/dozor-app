// Sieć zasilania (05.11.2026) — jedno źródło prawdy o połączeniach dla Planu rejonu i Grafu zasilania.
// Piotr: "graf zasilania jest tożsamy z planem zasilania od rozdzielni do końcowych urządzeń sieci rejonowej",
// "tak żeby nie dublować danych". Połączenia wynikają tylko z pól "zasilany z" w rekordach; rejon nie jest
// wpisywany przy każdym urządzeniu — wynika z sieci (rejon = KB: rozdzielnia i wszystko na sieci aż do
// odbiorników końcowych).
import { kv } from './symbole.js';

// Skąd brać źródło zasilania dla danego magazynu: [pole FK, magazyn źródła, pole nazwy źródła, prefiks pól kabla]
export const ZASILANIE = {
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
  maszyny: [['zasilany_z_urzadzenia', 'urzadzenia', 'nazwa', 'kabel']],
};

export const TYTUL = { rozdzielnie: 'nazwa_r', poleRozdzielcze: 'p_nazwa', transformatory: 't_nr', urzadzenia: 'nazwa', kb: 'kb_nazwa', maszyny: 'm_nazwa', przenosniki: 'pr_nr', silniki: 'nazwa_silnika', chodniki: 'ch_nazwa' };

export const jestOdbiornik = (rec) => String(rec?.u_rodzaj || '').startsWith('odbiornik');
// urządzenia końcowe układu: nie mają przelotów i nic nie zasilają
export const KONCOWE = new Set(['odbiornik', 'kb', 'maszyny', 'przenosniki']);
export const rodzajRek = (store, rec) => (store === 'urzadzenia' ? (jestOdbiornik(rec) ? 'odbiornik' : 'wylacznik') : store);
export const klucz = (store, rec) => `${store}:${rec.id}`;

// fk-or-free: numeryczne id albo tekst dopasowany po nazwie
export function rozwiaz(wartosc, rekordy, pole) {
  if (wartosc === undefined || wartosc === null || wartosc === '') return null;
  if (typeof wartosc === 'number') return (rekordy || []).find((r) => r.id === wartosc) || null;
  const w = String(wartosc).trim().toLowerCase();
  return (rekordy || []).find((r) => String(r[pole] || '').trim().toLowerCase() === w) || null;
}

export function polaczenia(dane) {
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
        wynik.push({ cel: { store, rec }, zrodlo: { store: zrodloStore, rec: zrodlo }, prefiks, pole });
      }
    }
  }
  return { wynik, spozaBazy };
}

// źródło zasilania głównego (pierwsze rozpoznane pole "zasilany z", bez rezerwowego)
export function zrodloRek(dane, store, rec) {
  for (const [pole, zStore, zPole, prefiks] of ZASILANIE[store] || []) {
    if (prefiks === 'kabel_rez') continue;
    const z = rozwiaz(rec[pole], dane[zStore] || [], zPole);
    if (z && !(zStore === store && z.id === rec.id)) return { store: zStore, rec: z, pole };
  }
  return null;
}

// zasilanie (ciągłe) / odpływ do urządzenia końcowego (przerywany) / przelot / rezerwowe
export function rodzajPolaczenia(p) {
  if (p.prefiks === 'kabel_rez') return 'rezerwowe';
  const zr = rodzajRek(p.zrodlo.store, p.zrodlo.rec);
  const cel = rodzajRek(p.cel.store, p.cel.rec);
  if (KONCOWE.has(cel)) return 'odplyw';
  if (zr === cel || (zr === 'transformatory' && (kv(p.cel.rec.nap_zas) ?? 0) >= 3)) return 'przelot';
  return 'zasilanie';
}
// przelot 6 kV w sieci (pole -> pole, transformator -> transformator / aparat 6 kV): dalej zaczyna się inna gałąź,
// więc rejon nie przechodzi przez taki przelot w dół
const przelotSieci = (p) => rodzajPolaczenia(p) === 'przelot' && (p.zrodlo.store === 'poleRozdzielcze' || p.zrodlo.store === 'transformatory');

// ---------- rejon (KB) ----------
export const MAGAZYNY_REJONU = ['poleRozdzielcze', 'transformatory', 'urzadzenia', 'kb', 'maszyny', 'przenosniki'];

// Rejon wpisany wprost: pole "rejon" (KB z listy albo nazwa rejonu bez kombajnu); kombajn sam wyznacza rejon;
// transformator z importu ma "Rejon / grupa" — liczy się, gdy to nazwa kombajnu.
export function rejonWpisany(dane, store, rec) {
  const nazwa = (v) => {
    if (v === undefined || v === null || v === '') return '';
    return rozwiaz(v, dane.kb, 'kb_nazwa')?.kb_nazwa || (typeof v === 'number' ? '' : String(v).trim());
  };
  const r = nazwa(rec?.rejon);
  if (r) return r;
  if (store === 'kb') return String(rec.kb_nazwa || '').trim();
  if (store === 'transformatory' && rec.t_rejon) return rozwiaz(rec.t_rejon, dane.kb, 'kb_nazwa')?.kb_nazwa || '';
  return '';
}

// Wynik: wlasny — rejon elementu (wpisany, od źródła w dół sieci albo jedyny rejon zasilanych urządzeń);
// wRejonie — zbiór rejonów, w których element jest widoczny (własny + leży na drodze zasilania elementów rejonu,
// aż do rozdzielni); lista — wszystkie rejony.
export function rejonySieci(dane) {
  const { wynik } = polaczenia(dane);
  const pol = wynik.filter((p) => p.prefiks !== 'kabel_rez');
  const dzieci = new Map();
  for (const p of pol) {
    const k = klucz(p.zrodlo.store, p.zrodlo.rec);
    if (!dzieci.has(k)) dzieci.set(k, []);
    dzieci.get(k).push(p);
  }
  const wlasny = new Map();
  const wDol = (store, rec) => {
    // rejony wpisane niżej w tej samej gałęzi (bez przechodzenia przez przelot 6 kV)
    const znalezione = new Set();
    const odwiedzone = new Set([klucz(store, rec)]);
    const kolejka = [klucz(store, rec)];
    while (kolejka.length) {
      for (const p of dzieci.get(kolejka.shift()) || []) {
        if (przelotSieci(p)) continue;
        const k = klucz(p.cel.store, p.cel.rec);
        if (odwiedzone.has(k)) continue;
        odwiedzone.add(k);
        const r = rejonWpisany(dane, p.cel.store, p.cel.rec);
        if (r) znalezione.add(r);
        else kolejka.push(k);
      }
    }
    return znalezione.size === 1 ? [...znalezione][0] : '';
  };
  const policz = (store, rec, d = 0) => {
    const k = klucz(store, rec);
    if (wlasny.has(k)) return wlasny.get(k);
    if (d > 40) return '';
    wlasny.set(k, ''); // ochrona przed pętlą
    let r = rejonWpisany(dane, store, rec);
    if (!r) {
      const z = zrodloRek(dane, store, rec);
      if (z && z.store !== 'rozdzielnie') {
        const p = { zrodlo: z, cel: { store, rec } };
        if (!przelotSieci(p)) r = policz(z.store, z.rec, d + 1);
      }
    }
    if (!r) r = wDol(store, rec);
    wlasny.set(k, r);
    return r;
  };
  for (const s of MAGAZYNY_REJONU) for (const rec of dane[s] || []) policz(s, rec);

  const wRejonie = new Map();
  const dodaj = (k, r) => {
    if (!wRejonie.has(k)) wRejonie.set(k, new Set());
    wRejonie.get(k).add(r);
  };
  for (const s of MAGAZYNY_REJONU) {
    for (const rec of dane[s] || []) {
      const r = wlasny.get(klucz(s, rec));
      if (!r) continue;
      let st = s;
      let re = rec;
      for (let d = 0; re && d < 40; d += 1) {
        dodaj(klucz(st, re), r);
        if (st === 'poleRozdzielcze') {
          const roz = rozwiaz(re.miejsce_zabudowy, dane.rozdzielnie, 'nazwa_r');
          if (roz) dodaj(klucz('rozdzielnie', roz), r);
        }
        const z = zrodloRek(dane, st, re);
        if (!z || z.store === 'rozdzielnie' || (wRejonie.get(klucz(z.store, z.rec))?.has(r) && d > 0)) break;
        st = z.store;
        re = z.rec;
      }
    }
  }
  const lista = [...new Set([...wlasny.values()].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
  return { wlasny, wRejonie, lista };
}
