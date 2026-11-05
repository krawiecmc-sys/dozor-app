// Katalog typów aparatów z napięciem (05.11.2026, Piotr): niektóre typy pracują tylko na jednym napięciu
// (WSN-40P/1 — tylko 500 V), inne na obu (OSWCA — 0,5 i 1 kV). Typ rozpoznawany po początku nazwy urządzenia
// (bez różnicy wielkości liter, spacji i myślników; wygrywa najdłuższy pasujący typ). Typy bez wpisu nie są sprawdzane.
// Każdy wpis ma źródło (DTR, tabliczka znamionowa, karta producenta) — dane tylko z dokumentacji urządzenia, nie z domysłu.
// Katalog trzyma magazyn meta (jak inne ustawienia appki) i jedzie w eksporcie / imporcie Synchronizacji.
import { getMeta, setMeta } from './db.js';

const KLUCZ = 'katalog_aparatow';
export const KATALOG_POCZATKOWY = [
  { typ: 'WSN-40P/1', nap: ['0,5 kV'], zrodlo: 'Piotr 05.11.2026 — potwierdzić w DTR' },
  { typ: 'OSWCA', nap: ['0,5 kV', '1 kV'], zrodlo: 'Piotr 05.11.2026 — potwierdzić w DTR' },
];
export const NAPIECIA_KATALOGU = ['0,5 kV', '1 kV', '6 kV'];

export async function wczytajKatalog() {
  const k = await getMeta(KLUCZ);
  return Array.isArray(k) ? k : KATALOG_POCZATKOWY.map((w) => ({ ...w, nap: [...w.nap] }));
}

export const zapiszKatalog = (katalog) => setMeta(KLUCZ, katalog);

const norm = (t) => String(t || '').toUpperCase().replace(/[\s_-]/g, '');

export function typAparatu(nazwa, katalog) {
  const n = norm(nazwa);
  let najlepszy = null;
  for (const w of katalog || []) {
    const t = norm(w.typ);
    if (t && n.startsWith(t) && (!najlepszy || t.length > norm(najlepszy.typ).length)) najlepszy = w;
  }
  return najlepszy;
}

// Import kopii: typy z kopii dopisywane, lokalne wpisy mają pierwszeństwo.
export async function polaczKatalog(obcy) {
  if (!Array.isArray(obcy) || !obcy.length) return 0;
  const k = await wczytajKatalog();
  let dodane = 0;
  for (const w of obcy) {
    if (!w?.typ || !Array.isArray(w.nap) || k.some((x) => norm(x.typ) === norm(w.typ))) continue;
    k.push({ typ: String(w.typ), nap: w.nap.map(String), zrodlo: String(w.zrodlo || '') });
    dodane += 1;
  }
  if (dodane) await zapiszKatalog(k);
  return dodane;
}
