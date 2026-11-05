// Wspólne symbole i kolory schematów (03.11.2026): Plan rejonu i Graf zasilania.
// Symbole wg PN-EN 60617, kolor = poziom napięcia (05.11.2026, Piotr: 6 kV czerwony, 1 kV pomarańczowy, 0,5 kV ciemnożółty).

function rozwiaz(wartosc, rekordy, pole) {
  if (wartosc === undefined || wartosc === null || wartosc === '') return null;
  if (typeof wartosc === 'number') return rekordy.find((r) => r.id === wartosc) || null;
  const w = String(wartosc).trim().toLowerCase();
  return rekordy.find((r) => String(r[pole] || '').trim().toLowerCase() === w) || null;
}

// Kolory jak na schematach elektroenergetycznych (03.11.2026): kolor = poziom napięcia,
// obrys aparatów ciemnografitowy, symbole wg PN-EN 60617 (M = silnik, dwa koła = transformator,
// × = wyłącznik, szyna zbiorcza w rozdzielni).
export const KOLOR = {
  obrys: '#263238',
  aparat: '#eceff1',
  sn: '#c62828', // SN (3–30 kV, w rejonie zwykle 6 kV)
  nn1: '#ef6c00', // nn 1 kV (1000 V) — pomarańczowy
  nn05: '#c49a00', // nn 0,5 kV (do 0,69 kV: 500 V, 400 V) — ciemnożółty
  przenosnik: '#455a64',
  drazenie: '#6a1b9a', // fiolet — nie myli się z kablem 1 kV
  chodnik: '#e3e7ea',
  chodnikBrzeg: '#9aa7b1',
  tekst: '#1b1b1b',
  tekstChodnika: '#546e7a',
  zrodlo: { Excel: '#1565c0', 'ręcznie': '#6d4c41', pomiar: '#2e7d32', '': '#90a4ae' },
};
// Strony wtórne transformatora w kV ("6/0,5/1 kV" -> [0.5, 1]); transformator może być dwunapięciowy.
// Napięcie sieci z napięcia znamionowego/jałowego strony wtórnej: 1,2 kV -> sieć 1 kV, 0,525 / 0,55 kV -> sieć 0,5 kV.
export const napiecieSieci = (v) => (v === null || v === undefined ? v : v >= 3 ? v : v >= 0.9 ? 1 : v >= 0.45 ? 0.5 : v);
export function napieciaWtorne(rec) {
  const cz = String(rec?.t_napiecie || '').split('/').map((x) => kv(x)).filter((x) => x !== null);
  return cz.length > 1 ? [...new Set(cz.slice(1).map(napiecieSieci))].sort((a, b) => a - b) : [1];
}
export const rowneKV = (a, b) => a !== null && b !== null && a !== undefined && b !== undefined && Math.abs(napiecieSieci(a) - napiecieSieci(b)) < 0.01;
export const kolorNapiecia = (kV) => (kV === null || kV === undefined ? KOLOR.obrys : kV >= 3 ? KOLOR.sn : kV >= 0.9 ? KOLOR.nn1 : KOLOR.nn05);


// Napięcie w kV z opisu: "6 kV" -> 6, "1 kV" -> 1, "1000 V" -> 1, "500 V" -> 0,5.
// Do 03.11.2026 "1000 V" dawało 1000 i kabel nn rysował się jak SN.
export function kv(tekst) {
  if (tekst === null || tekst === undefined || tekst === '') return null;
  const m = String(tekst).replace(',', '.').match(/[\d.]+/);
  if (!m) return null;
  const v = Number(m[0]);
  return v >= 100 ? v / 1000 : v;
}


// Napięcie obiektu [strona górna, strona dolna] w kV (do koloru symbolu).
export function napiecieRekordu(store, rec, rozdzielnie = []) {
  if (!rec) return [null, null];
  if (store === 'rozdzielnie') { const v = kv(rec.r_napiecie) ?? 6; return [v, v]; }
  if (store === 'poleRozdzielcze') { const r = rozwiaz(rec.miejsce_zabudowy, rozdzielnie, 'nazwa_r'); const v = kv(r?.r_napiecie) ?? 6; return [v, v]; }
  if (store === 'transformatory') {
    const cz = String(rec.t_napiecie || '').split('/').map((x) => kv(x)).filter((x) => x !== null);
    return [cz[0] ?? 6, cz.length > 1 ? Math.max(...cz.slice(1)) : 1];
  }
  if (store === 'przenosniki' || store === 'czujniki') return [null, null];
  const v = kv(rec.nap_zas ?? rec.napiecie_zas);
  return [v ?? 1, v ?? 1];
}

// Symbole wg PN-EN 60617, uproszczone do planu rejonu. obwodka = obrys (albo kolor źródła danych),
// nap = [kV górne, kV dolne] — kolor szyny/uzwojeń/zacisków.
export function symbolSvg(typ, x, y, obwodka, k = 1, nap = [null, null]) {
  const f = (v) => +(v * k).toFixed(1);
  const sw = Math.max(1.1, f(1.8));
  const st = `stroke="${obwodka}" stroke-width="${sw}"`;
  const [gora, dol] = nap.map(kolorNapiecia);
  if (typ === 'rozdzielnia') {
    // obudowa + szyna zbiorcza w kolorze napięcia + trzy odpływy
    const w = f(46), h = f(28), x0 = x - w / 2, y0 = y - h / 2, ys = y0 + f(8);
    const odp = [-1, 0, 1].map((i) => `<line x1="${x + i * f(13)}" y1="${ys}" x2="${x + i * f(13)}" y2="${y0 + h - f(4)}" stroke="${gora}" stroke-width="${sw}"/><rect x="${x + i * f(13) - f(3)}" y="${ys + f(6)}" width="${f(6)}" height="${f(6)}" fill="#ffffff" stroke="${gora}" stroke-width="${Math.max(0.8, f(1.2))}"/>`).join('');
    return `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${f(2)}" fill="#ffffff" ${st}/><line x1="${x0 + f(5)}" y1="${ys}" x2="${x0 + w - f(5)}" y2="${ys}" stroke="${gora}" stroke-width="${Math.max(2, f(3.2))}" stroke-linecap="round"/>${odp}`;
  }
  if (typ === 'pole') {
    // pole z wyłącznikiem: kwadrat z „×”
    const a = f(6);
    return `<rect x="${x - a}" y="${y - a}" width="${2 * a}" height="${2 * a}" fill="#ffffff" stroke="${gora}" stroke-width="${Math.max(1, f(1.6))}"/><path d="M${x - a * 0.55},${y - a * 0.55} L${x + a * 0.55},${y + a * 0.55} M${x + a * 0.55},${y - a * 0.55} L${x - a * 0.55},${y + a * 0.55}" stroke="${obwodka}" stroke-width="${Math.max(1, f(1.4))}"/>`;
  }
  if (typ === 'transformator') {
    // dwa zachodzące koła: górne = strona SN, dolne = strona nn
    const r = f(10), d = f(6.5), w = Math.max(1.4, f(2.2));
    return `<circle cx="${x}" cy="${y + d}" r="${r}" fill="#ffffff" stroke="${dol}" stroke-width="${w}"/><circle cx="${x}" cy="${y - d}" r="${r}" fill="none" stroke="${gora}" stroke-width="${w}"/>`
      + (obwodka !== KOLOR.obrys ? `<circle cx="${x}" cy="${y}" r="${f(18)}" fill="none" stroke="${obwodka}" stroke-width="${Math.max(1, f(1.4))}" stroke-dasharray="3 2"/>` : '');
  }
  if (typ === 'naped') {
    // silnik napędu przenośnika: koło z „M”
    const r = f(10);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" ${st}/><text x="${x}" y="${y + f(4.3)}" text-anchor="middle" font-size="${f(12.5)}" font-weight="bold" font-family="Arial, sans-serif" fill="${obwodka}">M</text>`;
  }
  if (typ === 'kombajn') {
    // kombajn chodnikowy: korpus + organ urabiający
    const w = f(26), h = f(14);
    const zeby = Array.from({ length: 8 }, (_, i) => {
      const a = (Math.PI / 4) * i;
      return `${(x + w / 2 + f(3) + f(9.5) * Math.cos(a)).toFixed(1)},${(y + f(9.5) * Math.sin(a)).toFixed(1)}`;
    });
    return `<rect x="${x - w / 2 - f(4)}" y="${y - h / 2}" width="${w}" height="${h}" rx="${f(2)}" fill="#37474f" ${st}/>`
      + `<polygon points="${zeby.join(' ')}" fill="#ffb300" ${st}/><circle cx="${x + w / 2 + f(3)}" cy="${y}" r="${f(3)}" fill="#37474f"/>`;
  }
  if (typ === 'pompa') {
    // pompa (wg PN-EN 60617: koło z trójkątem kierunku przepływu), wypełnienie w kolorze wody
    const r = f(10);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" ${st}/><path d="M${x - r * 0.5},${y + r * 0.62} L${x},${y - r * 0.78} L${x + r * 0.5},${y + r * 0.62} z" fill="#0277bd" stroke="#0277bd" stroke-width="${Math.max(0.6, f(0.8))}"/>`;
  }
  if (typ === 'maszyna') {
    // maszyna (wiertnica, ładowarka, kolejka…): korpus na kołach
    const w = f(24), h = f(12);
    return `<rect x="${x - w / 2}" y="${y - h / 2 - f(2)}" width="${w}" height="${h}" rx="${f(2)}" fill="#5d4037" ${st}/>`
      + `<circle cx="${x - f(7)}" cy="${y + h / 2}" r="${f(3.2)}" fill="#ffffff" ${st}/><circle cx="${x + f(7)}" cy="${y + h / 2}" r="${f(3.2)}" fill="#ffffff" ${st}/>`;
  }
  if (typ === 'czujnik') {
    // czujnik / zabezpieczenie pomiarowe: romb z kropką
    const a = f(8);
    return `<polygon points="${x},${y - a} ${x + a},${y} ${x},${y + a} ${x - a},${y}" fill="#ffffff" ${st}/><circle cx="${x}" cy="${y}" r="${f(2.2)}" fill="${obwodka}"/>`;
  }
  // urządzenie (aparat: wyłącznik, stycznik, zespół): prostokąt z łącznikiem
  const w = f(24), h = f(16), c = dol;
  return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${f(1.5)}" fill="${KOLOR.aparat}" ${st}/>`
    + `<circle cx="${x - f(6)}" cy="${y + f(3)}" r="${f(1.6)}" fill="${c}"/><circle cx="${x + f(6)}" cy="${y + f(3)}" r="${f(1.6)}" fill="${c}"/>`
    + `<line x1="${x - f(6)}" y1="${y + f(3)}" x2="${x + f(5)}" y2="${y - f(4)}" stroke="${c}" stroke-width="${Math.max(1, f(1.6))}" stroke-linecap="round"/>`;
}
