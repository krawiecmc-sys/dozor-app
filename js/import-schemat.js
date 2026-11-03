// Import schematu sieci 6 kV z arkusza typu „Całość rozdzielni” (03.11.2026).
//
// Układ pliku (nie tabela!) — bloki, kilka na arkusz, także obok siebie:
//   Rozdzielnia: | R-10
//   Pole:        | 1          | 2      | 14
//   Odpływy:     | R-20 p.1   | wolne  | IT3Sb-400/6/0,5   <- pierwszy element odpływu
//                |            |        | nr 901            <- nr kopalniany
//                |            |        | 440 / 2500 A      <- nastawa zabezpieczenia
//                |            |        | 4SOR6/185         <- kabel do następnego
//                |            |        | STGCA 400/6/0,5   <- kolejny transformator (przelot 6 kV)
// Pod polem: łańcuch zasilania z góry na dół (pole -> [aparat 6 kV] -> transformator -> transformator …),
// przelot do pola innej rozdzielni („R-20 p.1”, „ZR-30 OKR-1”, „ZR-30”), pompy 6 kV, przeznaczenie
// pola (wolne, pomiarowe, sprzęgło, bateria).
// Reguły od Piotra: pole zasila transformatory (rzadko aparat 6 kV: SK, APST, APSPa); z przelotu
// transformatora może być zasilany kolejny (strona 6 kV); połączenie pole–pole między rozdzielniami to
// pola zasilające danej jednostki — zawsze dwa. Kierunek przelotów: od rozdzielni spoza pliku (np. R-9)
// w głąb, poziom po poziomie; wątpliwe przypadki idą na listę „do sprawdzenia”.
// Kilka arkuszy = jedna wspólna suma (decyzja Piotra); to samo pole z różną treścią w dwóch
// arkuszach: zostaje pierwszy wpis, drugi trafia do uwag pola.
// Dopasowanie przy ponownym imporcie: rozdzielnia po nazwie, pole po nazwie w rozdzielni,
// transformator po nr kopalnianym — nic się nie dubluje, ręczne poprawki w appce zostają.

import { nadzorGetAll, nadzorAdd, nadzorUpdate } from './db.js';
import { nrKop, skrotTypu, napiecieZTypu, mocZTypu } from './import-excel.js';

const tekst = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '')).replace(/\s+/g, ' ').trim();
// "R 10A", "r-10a" -> "R-10A"
export const normRozdz = (v) => tekst(v).toUpperCase().replace(/\s+/g, '').replace(/^(R|ZR|SK|T)(\d)/, '$1-$2');
const normPole = (v) => tekst(v).toUpperCase().replace(/\s+/g, '').replace(/^P\.?/, '');

const RE = {
  rozdzielnia: /^Rozdzielnia:?$/i,
  pole: /^Pole( rozdzielcze)?:?$/i,
  etykieta: /^(Rozdzielnia|Pole( rozdzielcze)?|Odpływy):?$/i,
  trafo: /^(IT\s?\d?\s?S|ITp|MAR|EH-?d|STGCA|TR-?\d)/i,
  aparat: /^(APST|APSPA|SK-?\d|RBKD|IK-?\d|PR-?\d|SP-?E)/i,
  pompa: /^pompa/i,
  nr: /^nr\.?\s*(\S+)$/i,
  nastawa: /^[\dx\s(]*[\d?]+\s*\/\s*[\d?]+\s*A?\)?$/i,
  odplyw: /^(odpł|dopł)\.?\s*\(\d+\)/i,
  kabel: /SOR|YHKG|kabel/i,
  przelot: /^(z\s+|zasilanie\s+)?((?:R|ZR|SK)\s?-\s?\d+\s?[A-Za-z]?)(?:\s*(?:p\.\s*(\S+)|(OKR(?:-\d+)?)))?$/i,
  zasilanie: /^zasilanie$/i,
  wylaczone: /^wyłączone$/i,
  przeznaczenie: /^(wolne|pomiarowe|sprz[eę]g\S*|bateria|kondensator\.?|transf\.?\s*potrzeb|własnych|przelot)$/i,
};

export function wygladaNaSchematRozdzielni(wiersze) {
  for (let r = 0; r < Math.min(wiersze.length, 400); r += 1) {
    const w = wiersze[r] || [];
    for (let c = 0; c < w.length; c += 1) {
      if (RE.rozdzielnia.test(tekst(w[c])) && RE.pole.test(tekst((wiersze[r + 1] || [])[c]))) return true;
    }
  }
  return false;
}

// Łańcuch komórek pod polem -> { elementy, przelot, przeznaczenie, zasilajace, wylaczone, uwagi }
export function parsujLancuch(komorki) {
  const pole = { elementy: [], przelot: null, przeznaczenie: [], zasilajace: false, wylaczone: false, uwagi: [] };
  let kabel = '';
  let odplyw = '';
  for (const t of komorki) {
    const ost = pole.elementy[pole.elementy.length - 1];
    let m;
    if (RE.trafo.test(t) || RE.aparat.test(t) || RE.pompa.test(t)) {
      const typ = RE.trafo.test(t) ? 'trafo' : RE.pompa.test(t) ? 'pompa' : 'aparat';
      pole.elementy.push({ typ, nazwa: t, nr: '', nastawa: '', kabel_typ: kabel, kabel_odplyw: odplyw });
      kabel = '';
      odplyw = '';
    } else if ((m = t.match(RE.nr))) {
      if (ost && !ost.nr) ost.nr = m[1];
      else pole.uwagi.push(t);
    } else if (RE.nastawa.test(t) && ost && ost.typ !== 'pompa') {
      ost.nastawa = ost.nastawa ? `${ost.nastawa}; ${t}` : t;
    } else if (RE.odplyw.test(t)) {
      odplyw = t;
    } else if (RE.kabel.test(t) && !RE.przelot.test(t)) {
      kabel = t;
      if (/R-?\d/.test(t)) pole.uwagi.push(t);
    } else if ((m = t.match(RE.przelot)) && !pole.elementy.length && !pole.przelot) {
      pole.przelot = { rozdz: normRozdz(m[2]), pole: normPole(m[3] || m[4] || ''), tekst: t, przychodzi: /^(z|zasilanie)\s/i.test(t) };
    } else if (RE.zasilanie.test(t)) {
      pole.zasilajace = true;
    } else if (RE.wylaczone.test(t)) {
      pole.wylaczone = true;
    } else if (RE.przeznaczenie.test(t)) {
      pole.przeznaczenie.push(t);
    } else {
      pole.uwagi.push(t);
    }
  }
  return pole;
}

// Jeden albo kilka arkuszy (lista tablic wierszy) -> model { rozdzielnie: Map, uwagi }
export function parsujSchemat(arkusze) {
  const rozdzielnie = new Map();
  const uwagi = [];
  arkusze.forEach((wiersze, nrArk) => {
    const w = wiersze.map((r) => (r || []).map(tekst));
    const kom = (r, c) => (w[r] && w[r][c]) || '';
    const naglowki = [];
    for (let r = 0; r < w.length; r += 1) {
      for (let c = 0; c < w[r].length; c += 1) {
        if (!RE.rozdzielnia.test(kom(r, c)) || !kom(r + 1, c)) continue;
        // zwykły blok: pod "Rozdzielnia:" jest "Pole:", numery od następnej kolumny;
        // kontynuacja (np. R-10 pola 5–6): pod "Rozdzielnia:" od razu numery pól, od tej samej kolumny
        const zEtykieta = RE.pole.test(kom(r + 1, c));
        const k0 = zEtykieta ? c + 1 : c;
        let k1 = k0;
        while (kom(r + 1, k1 + 1) !== '' && !RE.pole.test(kom(r + 1, k1 + 1))) k1 += 1;
        naglowki.push({ r, c, k0, k1, nazwa: kom(r, c + 1) });
      }
    }
    for (const h of naglowki) {
      if (!h.nazwa) continue;
      const klucz = normRozdz(h.nazwa);
      if (!rozdzielnie.has(klucz)) rozdzielnie.set(klucz, { klucz, nazwa: h.nazwa, pola: new Map() });
      const R = rozdzielnie.get(klucz);
      for (let k = h.k0; k <= h.k1; k += 1) {
        const nr = kom(h.r + 1, k);
        if (!nr) continue;
        // łańcuch kończy się na nagłówku kolejnego bloku, który obejmuje tę kolumnę
        let koniec = w.length;
        for (const h2 of naglowki) if (h2.r > h.r + 1 && h2.r < koniec && h2.c <= k && k <= h2.k1) koniec = h2.r;
        const komorki = [];
        for (let rr = h.r + 2; rr < koniec; rr += 1) {
          const v = kom(rr, k);
          if (v && !RE.etykieta.test(v)) komorki.push(v);
        }
        const pole = { nr, ...parsujLancuch(komorki), zrodla: [`arkusz ${nrArk + 1}, wiersz ${h.r + 2}`] };
        if (/zasil/i.test(nr)) pole.zasilajace = true; // pole nazwane „zasilanie”
        const kp = normPole(nr);
        const stare = R.pola.get(kp);
        const pustePole = (p) => !p.elementy.length && !p.przelot && p.przeznaczenie.every((x) => /^wolne$/i.test(x));
        if (!stare) R.pola.set(kp, pole);
        else if (pustePole(stare) && !pustePole(pole)) {
          pole.uwagi.push(`inny arkusz: ${komorkiOpis(stare)}`);
          R.pola.set(kp, pole);
        } else if (komorkiOpis(stare) !== komorkiOpis(pole) && !pustePole(pole)) {
          stare.uwagi.push(`inny arkusz: ${komorkiOpis(pole)}`);
        }
      }
    }
  });
  ustalKierunki(rozdzielnie, uwagi);
  return { rozdzielnie, uwagi };
}

function komorkiOpis(p) {
  const el = p.elementy.map((e) => [e.nazwa, e.nr && `nr ${e.nr}`, e.nastawa].filter(Boolean).join(' '));
  return [p.przelot?.tekst, ...p.przeznaczenie, ...el, p.wylaczone ? 'wyłączone' : ''].filter(Boolean).join(' → ') || 'puste';
}

// Kierunek przelotów pole–pole: od rozdzielni spoza pliku w głąb, poziom po poziomie.
// Każde pole z przelotem dostaje p.zrodlo = { rozdz, poleKlucz|null, zewnetrzne } albo p.odplywDo.
export function ustalKierunki(rozdzielnie, uwagi = []) {
  const linki = [];
  for (const R of rozdzielnie.values()) {
    for (const [kp, p] of R.pola) if (p.przelot) linki.push({ R, kp, p, cel: p.przelot.rozdz, celPole: p.przelot.pole });
  }
  // pole po drugiej stronie przelotu
  for (const l of linki) {
    const C = rozdzielnie.get(l.cel);
    if (!C) continue;
    if (l.celPole && C.pola.has(l.celPole)) l.drugie = l.celPole;
    else {
      const kand = [...C.pola].filter(([kp2, p2]) => p2.przelot && p2.przelot.rozdz === l.R.klucz && (!p2.przelot.pole || p2.przelot.pole === l.kp)).map(([kp2]) => kp2);
      const pocz = l.celPole ? [...C.pola.keys()].filter((kp2) => kp2.startsWith(l.celPole)) : [];
      l.drugie = kand.length === 1 ? kand[0] : pocz.length === 1 ? pocz[0] : null;
    }
  }
  const poziom = new Map(); // klucz rozdzielni -> poziom (zewnętrzne = 0)
  for (const l of linki) if (!rozdzielnie.has(l.cel)) poziom.set(l.cel, 0);
  const zasilajace = new Map(); // klucz R -> lista linków przychodzących
  // jawne: „z R-20 p.3”, „zasilanie R-9”, pole z dopiskiem „zasilanie”
  for (const l of linki) if (l.p.przelot.przychodzi || l.p.zasilajace) (zasilajace.get(l.R.klucz) || zasilajace.set(l.R.klucz, []).get(l.R.klucz)).push(l);
  const doZrobienia = new Set(rozdzielnie.keys());
  for (let lv = 1; doZrobienia.size && lv < 60; lv += 1) {
    const teraz = [];
    for (const k of doZrobienia) {
      const jawne = zasilajace.get(k) || [];
      const doZnanych = linki.filter((l) => l.R.klucz === k && poziom.has(l.cel) && poziom.get(l.cel) < lv);
      if (!jawne.length && !doZnanych.length) continue;
      teraz.push(k);
      // najpierw jawne, potem do rozdzielni najbliżej źródła; zawsze dwa pola zasilające
      const wybrane = [...jawne, ...doZnanych.filter((l) => !jawne.includes(l)).sort((a, b) => poziom.get(a.cel) - poziom.get(b.cel))].slice(0, 2);
      zasilajace.set(k, wybrane);
    }
    if (!teraz.length) break;
    for (const k of teraz) {
      poziom.set(k, lv);
      doZrobienia.delete(k);
    }
  }
  for (const [k, lista] of zasilajace) {
    lista.forEach((l, i) => {
      l.p.zrodlo = { rozdz: l.cel, poleKlucz: l.drugie, zewnetrzne: !rozdzielnie.has(l.cel), tekst: l.p.przelot.tekst, ktore: i === 0 ? 'główne' : 'rezerwowe' };
    });
    const R = rozdzielnie.get(k);
    if (lista.length !== 2) uwagi.push(`${R.nazwa}: ${lista.length} pole zasilające (zwykle 2) — sprawdź`);
  }
  for (const k of doZrobienia) uwagi.push(`${rozdzielnie.get(k).nazwa}: nie ustalono, skąd jest zasilana — przeloty do sprawdzenia`);
  // reszta linków: odpływ do innej rozdzielni (druga strona ma zrodlo) albo nieustalone
  for (const l of linki) {
    if (l.p.zrodlo) continue;
    const C = rozdzielnie.get(l.cel);
    const drugie = C && l.drugie ? C.pola.get(l.drugie) : null;
    if (drugie && drugie.zrodlo && drugie.zrodlo.rozdz === l.R.klucz) l.p.odplywDo = l.p.przelot.tekst;
    else if (C) {
      l.p.odplywDo = l.p.przelot.tekst;
      uwagi.push(`${l.R.nazwa} pole ${l.p.nr} ↔ ${l.p.przelot.tekst}: kierunek nieustalony (zapisane jako odpływ)`);
    } else l.p.odplywDo = l.p.przelot.tekst;
  }
  return { poziom };
}

// Liczby do podglądu przed importem
export function podsumujSchemat(model) {
  const s = { rozdzielnie: model.rozdzielnie.size, pola: 0, transformatory: 0, aparaty: 0, pompy: 0, przeloty: 0, zasilajace: 0, bezNumeru: 0 };
  for (const R of model.rozdzielnie.values()) {
    for (const p of R.pola.values()) {
      s.pola += 1;
      if (p.przelot) s.przeloty += 1;
      if (p.zrodlo) s.zasilajace += 1;
      for (const e of p.elementy) {
        if (e.typ === 'trafo') s.transformatory += 1;
        else if (e.typ === 'aparat') s.aparaty += 1;
        else s.pompy += 1;
        if (e.typ === 'trafo' && !e.nr) s.bezNumeru += 1;
      }
    }
  }
  return s;
}

// Zapis do bazy. Zwraca liczby dodanych / zaktualizowanych.
export async function importujSchemat(model) {
  const teraz = new Date().toISOString().slice(0, 10);
  const Z = { zrodlo_danych: 'Excel', import_data: teraz };
  const wynik = { rozdzielnie: [0, 0], pola: [0, 0], transformatory: [0, 0], urzadzenia: [0, 0] };
  const [rozdz, pola, trafo, urz] = await Promise.all(['rozdzielnie', 'poleRozdzielcze', 'transformatory', 'urzadzenia'].map((n) => nadzorGetAll(n)));
  const zapisz = async (store, lista, stary, nowy, licznik) => {
    if (stary) {
      const r = { ...stary, ...nowy, ...Z };
      await nadzorUpdate(store, r);
      Object.assign(stary, r);
      wynik[licznik][1] += 1;
      return stary;
    }
    const r = { ...nowy, ...Z };
    r.id = await nadzorAdd(store, r);
    lista.push(r);
    wynik[licznik][0] += 1;
    return r;
  };
  const dopiszUwagi = (stary, nowe) => {
    const s = String(stary?.uwagi || '');
    const brak = nowe.filter((u) => u && !s.includes(u));
    return brak.length ? [s, ...brak].filter(Boolean).join('\n') : s;
  };

  // 1) rozdzielnie i pola
  const poleRec = new Map(); // `${R.klucz}|${kp}` -> rekord pola
  for (const R of model.rozdzielnie.values()) {
    const staraR = rozdz.find((r) => normRozdz(r.nazwa_r) === R.klucz);
    const rr = await zapisz('rozdzielnie', rozdz, staraR, { nazwa_r: staraR?.nazwa_r || R.nazwa, r_napiecie: staraR?.r_napiecie || '6 kV' }, 'rozdzielnie');
    for (const [kp, p] of R.pola) {
      const nazwa = `${R.nazwa} pole ${p.nr}`;
      const stare = pola.find((x) => String(x.miejsce_zabudowy) === String(rr.id) && normPole(String(x.p_nazwa).replace(/^.*\spole\s/i, '')) === kp)
        || pola.find((x) => tekst(x.p_nazwa).toUpperCase() === nazwa.toUpperCase());
      const przezn = [
        p.zrodlo ? `zasilające (${p.zrodlo.ktore})` : '',
        p.odplywDo ? `odpływ do ${p.odplywDo}` : '',
        ...p.przeznaczenie,
        p.wylaczone ? 'wyłączone' : '',
        p.elementy.length && !p.przeznaczenie.length ? 'odpływ' : '',
      ].filter(Boolean).join(', ');
      const rec = await zapisz('poleRozdzielcze', pola, stare, {
        p_nazwa: stare?.p_nazwa || nazwa,
        miejsce_zabudowy: rr.id,
        p_przeznaczenie: przezn,
        uwagi: dopiszUwagi(stare, p.uwagi),
      }, 'pola');
      poleRec.set(`${R.klucz}|${kp}`, rec);
    }
  }
  // 2) przeloty: pole zasilające <- pole źródłowe (albo tekst, gdy źródło spoza pliku)
  for (const R of model.rozdzielnie.values()) {
    for (const [kp, p] of R.pola) {
      if (!p.zrodlo) continue;
      const rec = poleRec.get(`${R.klucz}|${kp}`);
      const zr = p.zrodlo.poleKlucz ? poleRec.get(`${p.zrodlo.rozdz}|${p.zrodlo.poleKlucz}`) : null;
      const wartosc = zr ? zr.id : p.zrodlo.tekst.replace(/^(z|zasilanie)\s+/i, '');
      if (rec.zasilane_z_pola !== wartosc) {
        rec.zasilane_z_pola = wartosc;
        await nadzorUpdate('poleRozdzielcze', rec);
      }
    }
  }
  // 3) łańcuchy pod polami
  const poKop = new Map(trafo.map((t) => [nrKop(t), t]).filter(([k]) => k));
  const czyscZrodla = (store) => (store === 'transformatory'
    ? { zasilany_z_pola: '', zasilany_z_transformatora: '', zasilany_z_urzadzenia: '' }
    : { zasilane_z_transformatora: '', zasilane_z_urzadzenia: '', zasilane_z_pola: '' });
  for (const R of model.rozdzielnie.values()) {
    for (const [kp, p] of R.pola) {
      let poprz = { store: 'poleRozdzielcze', rec: poleRec.get(`${R.klucz}|${kp}`) };
      let i = 0;
      for (const e of p.elementy) {
        i += 1;
        const kabel = { ...(e.kabel_typ ? { kabel_typ: e.kabel_typ } : {}), ...(e.kabel_odplyw ? { kabel_odplyw: e.kabel_odplyw } : {}) };
        if (e.typ === 'trafo') {
          const pole = { poleRozdzielcze: 'zasilany_z_pola', transformatory: 'zasilany_z_transformatora', urzadzenia: 'zasilany_z_urzadzenia' }[poprz.store];
          const kop = e.nr;
          const nazwa = kop ? `${skrotTypu(e.nazwa)}-${kop}` : `${e.nazwa} (${R.nazwa} p.${p.nr}/${i})`;
          const stary = (kop && poKop.get(kop)) || trafo.find((t) => tekst(t.t_nr).toUpperCase() === nazwa.toUpperCase());
          const nowy = {
            t_nr: stary?.t_nr || nazwa,
            ...(kop ? { t_nr_kop: kop } : {}),
            t_typ: stary?.t_typ || e.nazwa,
            ...(stary?.t_napiecie ? {} : napiecieZTypu(e.nazwa) ? { t_napiecie: napiecieZTypu(e.nazwa) } : {}),
            ...(stary?.t_moc ? {} : mocZTypu(e.nazwa) ? { t_moc: mocZTypu(e.nazwa) } : {}),
            ...(e.nastawa ? { t_nastawa_zabezpieczen: e.nastawa } : {}),
            t_miejsce_opis: `${R.nazwa} pole ${p.nr}${i > 1 ? ` (przelot, ${i}. w łańcuchu)` : ''}`,
            ...czyscZrodla('transformatory'),
            [pole]: poprz.rec.id,
            ...kabel,
          };
          const rec = await zapisz('transformatory', trafo, stary, nowy, 'transformatory');
          if (kop) poKop.set(kop, rec);
          poprz = { store: 'transformatory', rec };
        } else {
          const pole = { poleRozdzielcze: 'zasilane_z_pola', transformatory: 'zasilane_z_transformatora', urzadzenia: 'zasilane_z_urzadzenia' }[poprz.store];
          const nazwa = e.typ === 'pompa'
            ? `Pompa odwadniania${e.nr ? ` nr ${e.nr}` : ''} (${R.nazwa} p.${p.nr})`
            : `${e.nazwa}${e.nr ? ` nr ${e.nr}` : ''}${e.nr ? '' : ` (${R.nazwa} p.${p.nr})`}`;
          const stary = urz.find((u) => tekst(u.nazwa).toUpperCase() === nazwa.toUpperCase());
          const rec = await zapisz('urzadzenia', urz, stary, {
            nazwa,
            u_rodzaj: e.typ === 'pompa' ? 'odbiornik (silnik, pompa, wentylator…)' : 'wyłącznik / aparat',
            nap_zas: '6 kV',
            ...(e.nastawa ? { uwagi: dopiszUwagi(stary, [`nastawa: ${e.nastawa}`]) } : {}),
            ...czyscZrodla('urzadzenia'),
            [pole]: poprz.rec.id,
            ...kabel,
          }, 'urzadzenia');
          poprz = { store: 'urzadzenia', rec };
        }
      }
    }
  }
  return wynik;
}
