// Import transformatorów z pliku Excel (03.11.2026).
//
// Biblioteka SheetJS (js/vendor/xlsx.full.min.js, wersja 0.20.3 — bez
// znanych podatności 0.18.x) leży w appce i jest w cache Service Workera,
// więc import działa offline. Ładowana dopiero przy pierwszym użyciu
// (~950 KB), żeby nie spowalniać startu appki.
//
// Przebieg: plik -> wybór arkusza i wiersza nagłówka (zgadywany sam) ->
// przypisanie kolumn do pól transformatora (zgadywane po nazwach, potem
// zapamiętane) -> podgląd: ile nowych, ile do aktualizacji -> import.
// Dopasowanie do istniejących rekordów po numerze transformatora (t_nr,
// bez różnicy wielkości liter i spacji) — ponowny import tego samego pliku
// AKTUALIZUJE rekordy zamiast tworzyć duplikaty.

import { nadzorGetAll, nadzorAdd, nadzorUpdate, getMeta, setMeta } from './db.js';

const POLA = [
  { key: 't_nr', label: 'Nr transformatora *', wzorce: ['nr transf', 'numer transf', 'nr ewid', 'numer ewid', 'nr inw', 'oznacz', 'nr'] },
  { key: 't_typ', label: 'Typ', wzorce: ['typ', 'model', 'rodzaj'] },
  { key: 't_moc', label: 'Moc (kVA)', wzorce: ['moc', 'kva'] },
  { key: 't_napiecie', label: 'Napięcie', wzorce: ['napi', 'kv', 'przekł'] },
  { key: 't_nr_fabryczny', label: 'Nr fabryczny', wzorce: ['fabr', 'seryj'] },
  { key: 't_rok', label: 'Rok produkcji', wzorce: ['rok', 'produk'] },
  { key: 't_data_badania', label: 'Data ostatniego badania', wzorce: ['bada', 'przegl', 'pomiar', 'data'] },
  { key: 't_nastawa_zabezpieczen', label: 'Nastawa zabezpieczeń', wzorce: ['nastaw', 'zabezp'] },
  { key: 't_obciazenie', label: 'Wartość obciążeniowa', wzorce: ['obciąż', 'obciaz'] },
  { key: 't_miejsce_opis', label: 'Miejsce zabudowy (opis)', wzorce: ['miejsce', 'lokaliz', 'chodnik'] },
  { key: 't_rejon', label: 'Rejon / grupa', wzorce: ['rejon', 'oddział', 'grupa'] },
  { key: 'uwagi', label: 'Uwagi', wzorce: ['uwag', 'opis'] },
];
const META_MAPOWANIE = 'importExcelTransformatory:mapowanie';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

let ladowanie = null;
function zaladujSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!ladowanie) {
    ladowanie = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = './js/vendor/xlsx.full.min.js';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => {
        ladowanie = null;
        reject(new Error('Nie udało się wczytać biblioteki Excela (js/vendor/xlsx.full.min.js).'));
      };
      document.head.appendChild(s);
    });
  }
  return ladowanie;
}

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const normNr = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '');

function wartoscKomorki(v) {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }
  return v === null || v === undefined ? '' : String(v).trim();
}

// Wiersz nagłówka = ten spośród pierwszych 15, który ma najwięcej
// niepustych komórek tekstowych (typowo tabela ma nad sobą tytuł i datę).
export function zgadnijWierszNaglowka(wiersze) {
  let najlepszy = 0;
  let wynik = -1;
  wiersze.slice(0, 15).forEach((w, i) => {
    const tekstowe = w.filter((c) => typeof c === 'string' && c.trim() !== '').length;
    if (tekstowe > wynik) {
      wynik = tekstowe;
      najlepszy = i;
    }
  });
  return najlepszy;
}

export function zgadnijMapowanie(naglowki, zapamietane = {}) {
  const mapa = {};
  const zajete = new Set();
  // 1) zapamiętane z poprzedniego importu (po nazwie kolumny)
  for (const p of POLA) {
    const nazwa = zapamietane[p.key];
    if (!nazwa) continue;
    const idx = naglowki.findIndex((h) => norm(h) === norm(nazwa));
    if (idx >= 0 && !zajete.has(idx)) {
      mapa[p.key] = idx;
      zajete.add(idx);
    }
  }
  // 2) zgadywanie po fragmentach nazw — najpierw pola o charakterystycznych
  // nazwach, żeby ogólne "nr"/"data"/"typ" nie zabrały np. kolumny
  // "Nr fabryczny" albo "Data produkcji".
  const KOLEJNOSC = ['t_nr_fabryczny', 't_moc', 't_rok', 't_data_badania', 't_nastawa_zabezpieczen', 't_obciazenie', 't_miejsce_opis', 't_rejon', 't_napiecie', 't_typ', 't_nr', 'uwagi'];
  for (const p of KOLEJNOSC.map((k) => POLA.find((x) => x.key === k))) {
    if (mapa[p.key] !== undefined) continue;
    for (const wz of p.wzorce) {
      const idx = naglowki.findIndex((h, i) => !zajete.has(i) && norm(h).includes(wz));
      if (idx >= 0) {
        mapa[p.key] = idx;
        zajete.add(idx);
        break;
      }
    }
  }
  return mapa;
}

// --- Wykaz blokowy "Zabezpieczenia trafo" (03.11.2026) ---
// Układ pliku (nie tabela!):
//   AM-1/3                      <- grupa (rejon / oddział), wiersz z samą kolumną A
//   MAR-572                     <- transformator, wiersz z samą kolumną A
//   PM-2 | nr 28/2018 | data | 220/800A |  | PM-2 | nr 12/2019 | data | 220/1320A
//         ^ zabezpieczenie 1 (kol. A–D)       ^ zabezpieczenie 2 (kol. F–I)
// Wiersz "nazwy" po którym następuje wiersz zabezpieczeń = transformator;
// wiersz "nazwy", po którym od razu jest kolejna nazwa = grupa.
const tylkoA = (w) => w && wartoscKomorki(w[0]) !== '' && w.slice(1).every((c) => wartoscKomorki(c) === '');
const pusty = (w) => !w || w.every((c) => wartoscKomorki(c) === '');

function zabezpieczenieZ(w, od) {
  const [nazwa, nr, data, nastawa] = [0, 1, 2, 3].map((i) => w[od + i]);
  const z = {
    nazwa: wartoscKomorki(nazwa),
    nr: wartoscKomorki(nr).replace(/^nr\.?\s*/i, ''),
    legalizacja: data instanceof Date ? wartoscKomorki(data) : /^\d{4}-\d{2}-\d{2}$/.test(wartoscKomorki(data)) ? wartoscKomorki(data) : '',
    nastawa: wartoscKomorki(nastawa),
  };
  const inneData = !(data instanceof Date) && wartoscKomorki(data) && !z.legalizacja ? wartoscKomorki(data) : '';
  if (inneData) z.nastawa = [z.nastawa, inneData].filter(Boolean).join(' ');
  return z.nazwa || z.nr || z.legalizacja || z.nastawa ? z : null;
}

export function wygladaNaWykazBlokowy(wiersze) {
  let bloki = 0;
  const typy = typyZabezpieczen(wiersze);
  for (let i = 0; i < wiersze.length - 1; i += 1) {
    if (!tylkoA(wiersze[i]) || typy.has(norm(wiersze[i][0]))) continue;
    const nast = wiersze.slice(i + 1).find((w) => !pusty(w));
    if (nast && (!tylkoA(nast) || typy.has(norm(nast[0])))) bloki += 1;
  }
  return bloki >= 3;
}

// Typy zabezpieczeń znane z pliku (kol. A wierszy z danymi + kol. F) — wiersz
// z samym "PM-2" (bez nr/daty/nastawy) to zabezpieczenie, nie grupa.
function typyZabezpieczen(wiersze) {
  const typy = new Set();
  for (const w of wiersze) {
    if (pusty(w)) continue;
    if (!tylkoA(w) && wartoscKomorki(w[0])) typy.add(norm(w[0]));
    if (wartoscKomorki(w[5])) typy.add(norm(w[5]));
  }
  return typy;
}

export function parsujWykazBlokowy(wiersze) {
  const wynik = [];
  const uwagi = [];
  let grupa = '';
  let biezacy = null;
  const typy = typyZabezpieczen(wiersze);
  const nazwaWiersza = (w) => tylkoA(w) && !typy.has(norm(w[0]));
  const niepuste = wiersze.map((w, i) => ({ w, nr: i + 1 })).filter((x) => !pusty(x.w));
  for (let k = 0; k < niepuste.length; k += 1) {
    const { w, nr } = niepuste[k];
    if (nazwaWiersza(w)) {
      const nast = niepuste[k + 1];
      const nazwa = wartoscKomorki(w[0]);
      if (!nast || nazwaWiersza(nast.w)) {
        grupa = nazwa; // nagłówek grupy
        biezacy = null;
      } else {
        biezacy = { t_nr: nazwa.replace(/\s+/g, ' ').trim(), t_rejon: grupa, nastawy_zabezpieczen: [], _wiersz: nr };
        wynik.push(biezacy);
      }
      continue;
    }
    if (!biezacy) {
      uwagi.push(`wiersz ${nr}: dane bez transformatora — pominięte`);
      continue;
    }
    const z1 = zabezpieczenieZ(w, 0);
    const z2 = zabezpieczenieZ(w, 5);
    if (z1 && z1.nazwa) biezacy.nastawy_zabezpieczen.push(z1);
    if (z2 && z2.nazwa) biezacy.nastawy_zabezpieczen.push(z2);
    const bezTypu = [z1, z2].filter((z) => z && !z.nazwa).map((z) => [z.nr, z.legalizacja, z.nastawa].filter(Boolean).join(' '));
    if (bezTypu.length) {
      biezacy.uwagi = [biezacy.uwagi, `z wykazu (wiersz ${nr}): ${bezTypu.join('; ')}`].filter(Boolean).join('\n');
    }
  }
  return { rekordy: wynik, uwagi };
}

// Scala zabezpieczenia z pliku z istniejącą listą: ten sam typ + nr (albo ten
// sam typ na tej samej pozycji, gdy nr brak) = aktualizacja, reszta dopisana.
// Wpisy dodane ręcznie w appce, których nie ma w pliku, zostają.
export function scalZabezpieczenia(stare = [], nowe = []) {
  const wynik = stare.map((z) => ({ ...z }));
  const klucz = (z) => `${norm(z.nazwa)}|${norm(z.nr)}`;
  for (const z of nowe) {
    let idx = wynik.findIndex((s) => klucz(s) === klucz(z));
    if (idx < 0 && !z.nr) idx = wynik.findIndex((s) => norm(s.nazwa) === norm(z.nazwa) && !s._uzyty);
    if (idx >= 0) {
      wynik[idx] = { ...wynik[idx], ...Object.fromEntries(Object.entries(z).filter(([, v]) => v !== '')), _uzyty: true };
    } else {
      wynik.push({ ...z, _uzyty: true });
    }
  }
  return wynik.map(({ _uzyty, ...z }) => z);
}

// Zamienia wiersze danych na rekordy transformatorów wg mapowania.
export function zbudujRekordy(wiersze, mapa) {
  const rekordy = [];
  let bezNumeru = 0;
  for (const w of wiersze) {
    if (!w || w.every((c) => wartoscKomorki(c) === '')) continue;
    const r = {};
    for (const p of POLA) {
      const idx = mapa[p.key];
      if (idx === undefined || idx === '' || idx === null) continue;
      let v = wartoscKomorki(w[idx]);
      if (v === '') continue;
      if (p.key === 't_moc') {
        const n = Number(String(v).replace(',', '.').replace(/[^0-9.]/g, ''));
        v = Number.isFinite(n) && n > 0 ? n : v;
      }
      r[p.key] = v;
    }
    if (!r.t_nr) {
      bezNumeru += 1;
      continue;
    }
    rekordy.push(r);
  }
  return { rekordy, bezNumeru };
}

export function createImportExcel(containerId, { onImported } = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  let skoroszyt = null;
  let arkusz = '';
  let wiersze = [];
  let wierszNagl = 0;
  let mapa = {};
  let tryb = 'tabela'; // 'tabela' | 'wykaz' (bloki: transformator + zabezpieczenia)

  el.innerHTML = `
    <h3>Import transformatorów z Excela</h3>
    <p class="field-hint">Wczytuje plik .xlsx / .xls / .csv z wykazem transformatorów. Wskazujesz, która kolumna to numer, typ, moc itd. — appka zapamięta to na następny raz. Rozpoznaje też wykaz „Zabezpieczenia trafo” (grupa → transformator → wiersz z dwoma zabezpieczeniami). Transformator o tym samym numerze zostanie zaktualizowany, nie zdublowany. Plik nigdzie nie jest wysyłany — czytany tylko na tym urządzeniu.</p>
    <label class="btn-small">
      Wybierz plik Excel
      <input type="file" id="xls-input" accept=".xlsx,.xls,.xlsm,.csv" class="hidden-file-input">
    </label>
    <div id="xls-krok" class="xls-krok"></div>
    <p id="xls-status" class="field-hint"></p>
  `;
  const input = el.querySelector('#xls-input');
  const krokEl = el.querySelector('#xls-krok');
  const statusEl = el.querySelector('#xls-status');

  function wczytajArkusz() {
    const ws = skoroszyt.Sheets[arkusz];
    wiersze = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    wierszNagl = zgadnijWierszNaglowka(wiersze);
  }

  const przelacznikTrybu = () => `
      <div class="form-field-inline-row">
        <label class="form-field">Układ pliku
          <select id="xls-tryb">
            <option value="wykaz" ${tryb === 'wykaz' ? 'selected' : ''}>Wykaz zabezpieczeń (bloki: grupa → transformator → zabezpieczenia)</option>
            <option value="tabela" ${tryb === 'tabela' ? 'selected' : ''}>Zwykła tabela (wiersz = transformator)</option>
          </select>
        </label>
      </div>`;

  function podepnijTryb() {
    krokEl.querySelector('#xls-tryb')?.addEventListener('change', (e) => {
      tryb = e.target.value;
      mapa = {};
      renderKrok();
    });
  }

  const renderKrok = () => (tryb === 'wykaz' ? renderWykaz() : renderMapowanie());

  async function renderWykaz() {
    const { rekordy, uwagi } = parsujWykazBlokowy(wiersze);
    const istniejace = await nadzorGetAll('transformatory');
    const poNr = new Map(istniejace.map((t) => [normNr(t.t_nr), t]));
    const doAktualizacji = rekordy.filter((r) => poNr.has(normNr(r.t_nr))).length;
    const zabezp = rekordy.reduce((a, r) => a + r.nastawy_zabezpieczen.length, 0);
    const grupy = [...new Set(rekordy.map((r) => r.t_rejon).filter(Boolean))];
    const opisZ = (z) => [z.nazwa, z.nr ? `nr ${z.nr}` : '', z.nastawa, z.legalizacja].filter(Boolean).join(' · ');
    krokEl.innerHTML = `
      ${przelacznikTrybu()}
      <p class="field-hint">Rozpoznano <b>${rekordy.length}</b> transformatorów w <b>${grupy.length}</b> grupach (${escapeHtml(grupy.join(', '))}), razem <b>${zabezp}</b> zabezpieczeń.
        Nowe: <b>${rekordy.length - doAktualizacji}</b> · do aktualizacji: <b>${doAktualizacji}</b>.
        Data z wykazu trafia do pola „Data legalizacji” zabezpieczenia (po roku podświetla się na czerwono).</p>
      <div class="xls-podglad-wrap">
        <table class="xls-podglad">
          <thead><tr><th>Grupa</th><th>Transformator</th><th>Zabezpieczenie 1</th><th>Zabezpieczenie 2</th><th></th></tr></thead>
          <tbody>${rekordy.map((r) => `<tr><td>${escapeHtml(r.t_rejon)}</td><td><b>${escapeHtml(r.t_nr)}</b></td><td>${escapeHtml(r.nastawy_zabezpieczen[0] ? opisZ(r.nastawy_zabezpieczen[0]) : '—')}</td><td>${escapeHtml(r.nastawy_zabezpieczen[1] ? opisZ(r.nastawy_zabezpieczen[1]) : '—')}</td><td>${poNr.has(normNr(r.t_nr)) ? 'aktualizacja' : 'nowy'}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      ${uwagi.length ? `<p class="field-hint">⚠ ${escapeHtml(uwagi.join('; '))}</p>` : ''}
      <div class="form-actions">
        <button type="button" id="xls-import-btn" class="btn-primary" ${rekordy.length ? '' : 'disabled'}>Importuj ${rekordy.length} transformatorów z zabezpieczeniami</button>
        <button type="button" id="xls-anuluj" class="btn-small">Anuluj</button>
      </div>`;
    podepnijTryb();
    krokEl.querySelector('#xls-anuluj').addEventListener('click', () => {
      krokEl.innerHTML = '';
      statusEl.textContent = '';
      input.value = '';
    });
    krokEl.querySelector('#xls-import-btn').addEventListener('click', async () => {
      if (!confirm(`Zaimportować ${rekordy.length} transformatorów (${rekordy.length - doAktualizacji} nowych, ${doAktualizacji} do aktualizacji) i ${zabezp} zabezpieczeń?`)) return;
      const wynik = await importuj(rekordy);
      krokEl.innerHTML = '';
      input.value = '';
      statusEl.textContent = `Gotowe: dodano ${wynik.dodane}, zaktualizowano ${wynik.zaktualizowane} transformatorów (z zabezpieczeniami). Są w zakładce Rejon → Transformatory.`;
      if (onImported) await onImported();
    });
  }

  async function renderMapowanie() {
    const naglowki = (wiersze[wierszNagl] || []).map((h, i) => wartoscKomorki(h) || `(kolumna ${i + 1})`);
    const zapamietane = (await getMeta(META_MAPOWANIE)) || {};
    if (!Object.keys(mapa).length) mapa = zgadnijMapowanie(naglowki, zapamietane);
    const opcjeKolumn = (wybrana) =>
      `<option value="">— pomiń —</option>` +
      naglowki.map((h, i) => `<option value="${i}" ${wybrana === i ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('');

    const dane = wiersze.slice(wierszNagl + 1);
    const { rekordy, bezNumeru } = zbudujRekordy(dane, mapa);
    const istniejace = await nadzorGetAll('transformatory');
    const poNr = new Map(istniejace.map((t) => [normNr(t.t_nr), t]));
    const doAktualizacji = rekordy.filter((r) => poNr.has(normNr(r.t_nr))).length;
    const zdublowane = rekordy.length - new Set(rekordy.map((r) => normNr(r.t_nr))).size;

    const podglad = rekordy.slice(0, 5);
    const kolumnyPodgladu = POLA.filter((p) => mapa[p.key] !== undefined && mapa[p.key] !== '');

    krokEl.innerHTML = `
      ${przelacznikTrybu()}
      <div class="form-field-inline-row">
        ${skoroszyt.SheetNames.length > 1 ? `<label class="form-field">Arkusz <select id="xls-arkusz">${skoroszyt.SheetNames.map((n) => `<option ${n === arkusz ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select></label>` : ''}
        <label class="form-field">Wiersz nagłówka (nr w Excelu) <input type="number" id="xls-nagl" min="1" value="${wierszNagl + 1}"></label>
      </div>
      <h4 class="form-heading">Która kolumna to które pole?</h4>
      <div class="xls-mapa">
        ${POLA.map((p) => `<label class="form-field">${escapeHtml(p.label)}<select data-pole="${p.key}">${opcjeKolumn(mapa[p.key])}</select></label>`).join('')}
      </div>
      <h4 class="form-heading">Podgląd (pierwsze ${podglad.length} z ${rekordy.length})</h4>
      <div class="xls-podglad-wrap">
        <table class="xls-podglad">
          <thead><tr>${kolumnyPodgladu.map((p) => `<th>${escapeHtml(p.label.replace(' *', ''))}</th>`).join('')}</tr></thead>
          <tbody>${podglad.map((r) => `<tr>${kolumnyPodgladu.map((p) => `<td>${escapeHtml(r[p.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="field-hint">
        Nowe: <b>${rekordy.length - doAktualizacji}</b> · do aktualizacji (ten sam nr): <b>${doAktualizacji}</b>
        ${bezNumeru ? ` · pominięte bez numeru: <b>${bezNumeru}</b>` : ''}
        ${zdublowane ? ` · ⚠ ten sam numer kilka razy w pliku: <b>${zdublowane}</b> (zostanie ostatni)` : ''}
      </p>
      <div class="form-actions">
        <button type="button" id="xls-import-btn" class="btn-primary" ${rekordy.length ? '' : 'disabled'}>Importuj ${rekordy.length} transformatorów</button>
        <button type="button" id="xls-anuluj" class="btn-small">Anuluj</button>
      </div>
    `;

    podepnijTryb();
    krokEl.querySelector('#xls-arkusz')?.addEventListener('change', (e) => {
      arkusz = e.target.value;
      wczytajArkusz();
      mapa = {};
      renderMapowanie();
    });
    krokEl.querySelector('#xls-nagl').addEventListener('change', (e) => {
      wierszNagl = Math.max(0, Number(e.target.value) - 1);
      mapa = {};
      renderMapowanie();
    });
    krokEl.querySelectorAll('[data-pole]').forEach((sel) => {
      sel.addEventListener('change', () => {
        mapa[sel.dataset.pole] = sel.value === '' ? undefined : Number(sel.value);
        renderMapowanie();
      });
    });
    krokEl.querySelector('#xls-anuluj').addEventListener('click', () => {
      krokEl.innerHTML = '';
      statusEl.textContent = '';
      input.value = '';
    });
    krokEl.querySelector('#xls-import-btn').addEventListener('click', async () => {
      if (!confirm(`Zaimportować ${rekordy.length} transformatorów (${rekordy.length - doAktualizacji} nowych, ${doAktualizacji} do aktualizacji)?`)) return;
      const wynik = await importuj(rekordy);
      const doZapamietania = {};
      for (const p of POLA) if (mapa[p.key] !== undefined) doZapamietania[p.key] = naglowki[mapa[p.key]];
      await setMeta(META_MAPOWANIE, doZapamietania);
      krokEl.innerHTML = '';
      input.value = '';
      statusEl.textContent = `Gotowe: dodano ${wynik.dodane}, zaktualizowano ${wynik.zaktualizowane}. Transformatory są w zakładce Rejon → Transformatory; położenie w chodniku ustawisz w formularzu albo kliknięciem na Planie rejonu.`;
      if (onImported) await onImported();
    });
  }

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    statusEl.textContent = 'Wczytywanie…';
    try {
      const XLSX = await zaladujSheetJS();
      const buf = await file.arrayBuffer();
      skoroszyt = XLSX.read(buf, { type: 'array', cellDates: true });
      arkusz = skoroszyt.SheetNames[0];
      wczytajArkusz();
      mapa = {};
      tryb = wygladaNaWykazBlokowy(wiersze) ? 'wykaz' : 'tabela';
      statusEl.textContent = `Plik: ${file.name}`;
      await renderKrok();
    } catch (err) {
      console.error(err);
      statusEl.textContent = `Błąd odczytu pliku: ${err.message}`;
    }
  });
}

export async function importuj(rekordy) {
  const istniejace = await nadzorGetAll('transformatory');
  const poNr = new Map(istniejace.map((t) => [normNr(t.t_nr), t]));
  const wynik = { dodane: 0, zaktualizowane: 0 };
  const teraz = new Date().toISOString().slice(0, 10);
  for (const r of rekordy) {
    const stary = poNr.get(normNr(r.t_nr));
    if (stary) {
      // Nadpisujemy tylko pola, które w pliku mają wartość — puste komórki
      // nie kasują tego, co user wpisał w appce (np. położenie, kabel).
      const { _wiersz, ...bez } = r;
      const nowy = { ...stary, ...bez, t_nr: stary.t_nr, zrodlo_danych: 'Excel', import_data: teraz };
      if (Array.isArray(r.nastawy_zabezpieczen)) nowy.nastawy_zabezpieczen = scalZabezpieczenia(stary.nastawy_zabezpieczen, r.nastawy_zabezpieczen);
      if (r.uwagi && stary.uwagi && !String(stary.uwagi).includes(r.uwagi)) nowy.uwagi = `${stary.uwagi}
${r.uwagi}`;
      await nadzorUpdate('transformatory', nowy);
      poNr.set(normNr(r.t_nr), nowy);
      wynik.zaktualizowane += 1;
    } else {
      const { _wiersz, ...bez } = r;
      const id = await nadzorAdd('transformatory', { ...bez, zrodlo_danych: 'Excel', import_data: teraz });
      poNr.set(normNr(r.t_nr), { ...r, id });
      wynik.dodane += 1;
    }
  }
  return wynik;
}
