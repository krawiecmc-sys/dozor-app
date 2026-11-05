// Układ zasilania (dawna Mapa rejonu) — kafelki z danych tabel Bazy urządzeń, ułożone w drzewo zasilania:
// rozdzielnia → pola → transformatory (przeloty) → wyłączniki → urządzenia końcowe (odbiorniki, KB, maszyny,
// napędy) → silniki i czujniki. 06.11.2026 (Piotr): „układ zasilania ma być mapą rejonu z kafelkami z danych tabel
// lub wpisywanych ręcznie, edytowalnymi”, „dane muszą pokrywać się z danymi z tabel” — połączenia liczy ten sam
// moduł co Plan rejonu (siec-zasilania.js), z pól „zasilany z”; Mapa nie ma własnej kopii danych ani reguł.
// Kafelek: klik = edycja rekordu w Bazie urządzeń; „+ dodaj” = nowy rekord zasilany z tego kafelka (formularz
// z wpisanym źródłem); „na planie” = położenie na Planie rejonu.
import { nadzorGetAll } from './db.js';
import { polaczenia, rozwiaz, rodzajRek, rodzajPolaczenia, klucz, usunElementSieci } from './siec-zasilania.js';
import { nadzorDelete } from './db.js';

const ROK_MS = 365 * 24 * 60 * 60 * 1000;
const MAGAZYNY = ['rozdzielnie', 'poleRozdzielcze', 'transformatory', 'urzadzenia', 'kb', 'maszyny', 'przenosniki', 'silniki', 'czujniki'];
const NA_PLANIE = new Set(['rozdzielnie', 'poleRozdzielcze', 'transformatory', 'urzadzenia', 'kb', 'maszyny', 'przenosniki']);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const poLegalizacji = (rec) => Array.isArray(rec?.nastawy_zabezpieczen) && rec.nastawy_zabezpieczen.some((w) => {
  const d = new Date(w?.legalizacja || '');
  return w?.legalizacja && !Number.isNaN(d.getTime()) && Date.now() - d.getTime() > ROK_MS;
});

// co można dodać „+ dodaj” z kafelka danego rodzaju: [zakładka Bazy urządzeń, etykieta, pole źródła, stałe wartości]
const DODAJ = {
  rozdzielnie: [['poleRozdzielcze', 'pole rozdzielcze', 'miejsce_zabudowy']],
  poleRozdzielcze: [['transformatory', 'transformator', 'zasilany_z_pola'], ['wylaczniki', 'aparat 6 kV (SK, APST…)', 'zasilane_z_pola', { nap_zas: '6 kV' }], ['odbiorniki', 'pompa / odbiornik 6 kV', 'zasilane_z_pola', { nap_zas: '6 kV' }]],
  transformatory: [['wylaczniki', 'wyłącznik / szafa / zespół', 'zasilane_z_transformatora'], ['transformatory', 'transformator (przelot 6 kV)', 'zasilany_z_transformatora']],
  wylacznik: [['odbiorniki', 'odbiornik końcowy', 'zasilane_z_urzadzenia'], ['kb', 'kombajn KB', 'zasilany_z_urzadzenia'], ['maszyny', 'maszyna', 'zasilany_z_urzadzenia'], ['przenosniki', 'napęd przenośnika', 'zasilany_z_urzadzenia'], ['wylaczniki', 'wyłącznik (przelot)', 'zasilane_z_urzadzenia']],
};
// kolejność rodzeństwa: przeloty i aparaty, potem urządzenia końcowe, kombajn na końcu
const KOLEJNOSC = { poleRozdzielcze: 0, transformatory: 1, wylacznik: 2, odbiornik: 3, maszyny: 4, przenosniki: 5, kb: 6, silniki: 7, czujniki: 8 };

function opisKafelka(store, rec) {
  const kw = (v, j) => (Number(v) ? `${Number(v)} ${j}` : '');
  const kab = rec.kabel_nr ? `kabel ${[rec.kabel_nr, rec.kabel_typ, rec.kabel_przekroj, rec.kabel_dlugosc ? `${rec.kabel_dlugosc} m` : ''].filter(Boolean).join(' ')}` : '';
  switch (store) {
    case 'rozdzielnie': return ['Rozdzielnia', rec.nazwa_r, [rec.r_napiecie, rec.r_typ].filter(Boolean).join(' · ')];
    case 'poleRozdzielcze': return ['Pole', rec.p_nazwa, [rec.p_przeznaczenie, kab].filter(Boolean).join(' · ')];
    case 'transformatory': return ['Transformator', rec.t_nr, [rec.t_typ, rec.t_napiecie, kw(rec.t_moc, 'kVA'), rec.oddzial ? `odd. ${rec.oddzial}` : '', kab].filter(Boolean).join(' · ')];
    case 'urzadzenia': return [String(rec.u_rodzaj || '').startsWith('odbiornik') ? 'Odbiornik' : 'Wyłącznik / aparat', `${rec.nazwa || ''}${rec.symbol ? ` (${rec.symbol})` : ''}`, [rec.nap_zas, kw(rec.moc, 'kW'), kab].filter(Boolean).join(' · ')];
    case 'kb': return ['Kombajn', rec.kb_nazwa, [rec.typ_kb, rec.nap_zas, kab].filter(Boolean).join(' · ')];
    case 'maszyny': return ['Maszyna', rec.m_nazwa, [rec.m_rodzaj, rec.m_typ, rec.nap_zas, kw(rec.moc, 'kW'), kab].filter(Boolean).join(' · ')];
    case 'przenosniki': return ['Napęd przenośnika', [rec.pr_typ, rec.pr_nr].filter(Boolean).join(' '), [rec.nap_zas, kw(rec.pr_moc, 'kW'), kab].filter(Boolean).join(' · ')];
    case 'silniki': return ['Silnik', rec.nazwa_silnika, [kw(rec.s_moc, 'kW'), rec.napiecie_zas, rec.s_rodzaj].filter(Boolean).join(' · ')];
    case 'czujniki': return ['Czujnik', rec.nazwa_czujnik, rec.opis || ''];
    default: return ['', `#${rec.id}`, ''];
  }
}

// 06.11.2026 (Piotr): lamele rozwijane do wysokości poszczególnych rozdzielni — rozdzielnie i grupy „niepowiązane”
// domyślnie zwinięte (widać liczbę elementów), niższe poziomy domyślnie rozwinięte; stan zapamiętany w przeglądarce
const KLUCZ_ZWIN = 'protektor-mapa-zwiniecie';
let zwiniecie = {};
try { zwiniecie = JSON.parse(localStorage.getItem(KLUCZ_ZWIN) || '{}'); } catch { zwiniecie = {}; }
const zapiszZwiniecie = () => { try { localStorage.setItem(KLUCZ_ZWIN, JSON.stringify(zwiniecie)); } catch {} };
const domyslnieZwiniety = (kz) => kz.startsWith('rozdzielnie:') || kz.startsWith('grupa:');
const czyZwiniety = (kz) => (kz in zwiniecie ? zwiniecie[kz] : domyslnieZwiniety(kz));
const liczElementy = (html) => (html.match(/class="dash-node"/g) || []).length;
const przelacznik = (kz, html) => {
  const zw = czyZwiniety(kz);
  return `<button type="button" class="dash-zwin" data-zwin="${esc(kz)}" aria-expanded="${!zw}" title="${zw ? 'Rozwiń' : 'Zwiń'}">${zw ? '▸' : '▾'}</button>${zw ? `<span class="dash-licznik">${liczElementy(html)} el.</span>` : ''}`;
};

export async function renderDashboard(containerId, { onEditRecord, onShowOnPlan, onDodaj, onZmiana } = {}) {
  const container = document.getElementById(containerId);
  const listy = await Promise.all(MAGAZYNY.map((m) => nadzorGetAll(m)));
  const dane = Object.fromEntries(MAGAZYNY.map((m, i) => [m, listy[i]]));

  // dzieci każdego elementu — z tych samych połączeń co Plan rejonu (bez kabli rezerwowych)
  const dzieci = new Map();
  const dodajDziecko = (kz, wpis) => { if (!dzieci.has(kz)) dzieci.set(kz, []); dzieci.get(kz).push(wpis); };
  for (const p of polaczenia(dane).wynik) {
    if (p.prefiks === 'kabel_rez' || p.cel.store === 'rozdzielnie') continue;
    const odnosnik = p.zrodlo.store === 'poleRozdzielcze' && p.cel.store === 'poleRozdzielcze'; // pole zasilające innej rozdzielni
    dodajDziecko(klucz(p.zrodlo.store, p.zrodlo.rec), { store: p.cel.store, rec: p.cel.rec, przelot: rodzajPolaczenia(p) === 'przelot', odnosnik });
  }
  // pola w swojej rozdzielni; pole zasilające (przelot z innej rozdzielni) też jest pokazane przy swojej rozdzielni
  for (const pole of dane.poleRozdzielcze) {
    const r = rozwiaz(pole.miejsce_zabudowy, dane.rozdzielnie, 'nazwa_r');
    if (r) dodajDziecko(klucz('rozdzielnie', r), { store: 'poleRozdzielcze', rec: pole, zasilajace: !!rozwiaz(pole.zasilane_z_pola, dane.poleRozdzielcze, 'p_nazwa') });
  }
  for (const st of ['kb', 'maszyny', 'przenosniki', 'urzadzenia']) {
    for (const rec of dane[st]) {
      for (const sm of ['silniki', 'czujniki']) {
        for (const id of Array.isArray(rec[sm]) ? rec[sm] : []) {
          const x = dane[sm].find((r) => r.id === id);
          if (x) dodajDziecko(klucz(st, rec), { store: sm, rec: x });
        }
      }
    }
  }

  const uzyte = new Set();
  function kafelek(store, rec, sciezka, { przelot = false, zasilajace = false, odnosnik = false } = {}) {
    const kz = klucz(store, rec);
    const [rodzaj, nazwa, meta] = opisKafelka(store, rec);
    if (odnosnik) {
      const r = rozwiaz(rec.miejsce_zabudowy, dane.rozdzielnie, 'nazwa_r');
      return `<li class="dash-node"><div class="dash-node-row dash-clickable" data-entity="${store}" data-id="${rec.id}" tabindex="0"><span class="dash-node-label">→ przelot 6 kV do: ${esc(nazwa)}${r ? ` (rozdzielnia ${esc(r.nazwa_r)})` : ''}</span></div></li>`;
    }
    const stara = poLegalizacji(rec);
    if (sciezka.has(kz)) {
      return `<li class="dash-node"><div class="dash-node-row expired dash-clickable" data-entity="${store}" data-id="${rec.id}" tabindex="0"><span class="dash-node-label">⚠ ${esc(rodzaj)} ${esc(nazwa)} — pętla zasilania w danych, popraw</span></div></li>`;
    }
    const pierwszy = !uzyte.has(kz);
    uzyte.add(kz);
    const dalej = new Set(sciezka).add(kz);
    const lista = (pierwszy ? dzieci.get(kz) || [] : [])
      .slice()
      .sort((a, b) => (KOLEJNOSC[rodzajRek(a.store, a.rec)] ?? 9) - (KOLEJNOSC[rodzajRek(b.store, b.rec)] ?? 9));
    const dzieciHtml = lista.map((d) => kafelek(d.store, d.rec, dalej, d)).join('');
    const opcje = DODAJ[rodzajRek(store, rec)] || [];
    const plus = opcje.length && onDodaj
      ? `<select class="dash-dodaj" data-dodaj="${store}:${rec.id}" title="Dodaj element zasilany z tego"><option value="">+ dodaj</option>${opcje.map(([, etyk], i) => `<option value="${i}">${esc(etyk)}</option>`).join('')}</select>`
      : '';
    const dopisek = [przelot ? 'przelot 6 kV' : '', zasilajace ? 'pole zasilające' : '', pierwszy ? '' : 'szczegóły wyżej'].filter(Boolean).join(' · ');
    return `
      <li class="dash-node">
        <div class="dash-node-row ${stara ? 'expired' : ''} dash-clickable" data-entity="${store}" data-id="${rec.id}" tabindex="0">
          ${dzieciHtml ? przelacznik(kz, dzieciHtml) : '<span class="dash-zwin-pusty"></span>'}
          <span class="dash-node-label"><span class="dash-rodzaj">${esc(rodzaj)}</span> ${esc(nazwa || '(bez nazwy)')}${dopisek ? ` <i>(${esc(dopisek)})</i>` : ''}</span>
          ${meta ? `<span class="dash-node-meta">${esc(meta)}</span>` : ''}
          ${stara ? '<span class="dash-node-flag">⚠ legalizacja &gt; 1 rok</span>' : ''}
          ${plus}
          ${onEditRecord ? `<button type="button" class="dash-plan-btn dash-edytuj" data-edytuj="${store}:${rec.id}" title="Edytuj rekord">✎ edytuj</button>` : ''}
          <button type="button" class="dash-plan-btn dash-usun" data-usun="${store}:${rec.id}" title="Usuń z bazy">usuń</button>
          ${NA_PLANIE.has(store) && onShowOnPlan ? `<button type="button" class="dash-plan-btn" data-plan="${store}:${rec.id}" title="Pokaż na Planie rejonu">na planie</button>` : ''}
        </div>
        ${dzieciHtml ? `<ul class="dash-children${czyZwiniety(kz) ? ' hidden' : ''}" data-dzieci="${esc(kz)}">${dzieciHtml}</ul>` : ''}
      </li>`;
  }

  const drzewo = dane.rozdzielnie.map((r) => kafelek('rozdzielnie', r, new Set())).join('');
  // elementy, do których nie doszło drzewo — bez zasilania w bazie (albo źródło wpisane tekstem spoza bazy)
  const grupy = [
    ['poleRozdzielcze', 'Pola bez rozdzielni'],
    ['transformatory', 'Transformatory bez zasilania'],
    ['urzadzenia', 'Wyłączniki i odbiorniki bez zasilania'],
    ['kb', 'Kombajny bez zasilania'],
    ['maszyny', 'Maszyny bez zasilania'],
    ['przenosniki', 'Napędy bez zasilania'],
    ['silniki', 'Silniki nieprzypisane do maszyny'],
    ['czujniki', 'Czujniki nieprzypisane'],
  ].map(([st, tytul]) => {
    const recs = dane[st].filter((r) => !uzyte.has(klucz(st, r)));
    if (!recs.length) return '';
    const kz = `grupa:${st}`;
    const html = recs.map((r) => kafelek(st, r, new Set())).join('');
    return `<li class="dash-node"><div class="dash-node-row">${przelacznik(kz, html)}<span class="dash-node-label">${esc(tytul)} (${recs.length})</span></div><ul class="dash-children${czyZwiniety(kz) ? ' hidden' : ''}" data-dzieci="${esc(kz)}">${html}</ul></li>`;
  }).join('');

  container.innerHTML = `
    <div class="dash-pasek">
      ${onDodaj ? '<button type="button" class="btn-small btn-primary" data-dodaj-rozdzielnie="1">+ Dodaj rozdzielnię</button>' : ''}
      <button type="button" class="btn-small" data-zwin-wszystko="rozwin">Rozwiń wszystko</button>
      <button type="button" class="btn-small" data-zwin-wszystko="zwin">Zwiń do rozdzielni</button>
      <span class="field-hint">Kafelki to rekordy z Bazy urządzeń, ułożone wg pól „zasilany z” — te same połączenia co na Planie rejonu. Kliknij kafelek, żeby go edytować; „+ dodaj” — nowy element zasilany z tego kafelka.</span>
    </div>
    ${drzewo ? `<div class="dash-rejon"><ul class="dash-tree">${drzewo}</ul></div>` : ''}
    ${grupy ? `<div class="dash-rejon dash-orphans"><h3>Niepowiązane / do sprawdzenia</h3><p class="field-hint">Te rekordy nie mają zasilania w bazie (albo źródło wpisano tekstem, który nie pasuje do żadnego rekordu). Kliknij, żeby poprawić.</p><ul class="dash-tree">${grupy}</ul></div>` : ''}
    ${!drzewo && !grupy ? '<p class="empty-state">Brak danych — dodaj rozdzielnię przyciskiem wyżej, w Bazie urządzeń albo przez import w Synchronizacji.</p>' : ''}
  `;

  container.querySelector('[data-dodaj-rozdzielnie]')?.addEventListener('click', () => onDodaj('rozdzielnie', {}));
  const ustawZwin = (btn, zw) => {
    const kz = btn.dataset.zwin;
    const ul = [...container.querySelectorAll('[data-dzieci]')].find((u) => u.dataset.dzieci === kz);
    if (!ul) return;
    ul.classList.toggle('hidden', zw);
    btn.textContent = zw ? '▸' : '▾';
    btn.setAttribute('aria-expanded', String(!zw));
    btn.title = zw ? 'Rozwiń' : 'Zwiń';
    const licz = btn.nextElementSibling?.classList.contains('dash-licznik') ? btn.nextElementSibling : null;
    if (zw && !licz) btn.insertAdjacentHTML('afterend', `<span class="dash-licznik">${ul.querySelectorAll('.dash-node').length} el.</span>`);
    if (!zw && licz) licz.remove();
    zwiniecie[kz] = zw;
  };
  container.querySelectorAll('.dash-zwin').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      ustawZwin(btn, btn.getAttribute('aria-expanded') === 'true');
      zapiszZwiniecie();
    });
  });
  container.querySelectorAll('[data-zwin-wszystko]').forEach((b) => b.addEventListener('click', () => {
    const rozwin = b.dataset.zwinWszystko === 'rozwin';
    container.querySelectorAll('.dash-zwin').forEach((btn) => {
      const kz = btn.dataset.zwin;
      ustawZwin(btn, rozwin ? false : domyslnieZwiniety(kz));
    });
    zapiszZwiniecie();
  }));
  container.querySelectorAll('.dash-dodaj').forEach((sel) => {
    sel.addEventListener('click', (e) => e.stopPropagation());
    sel.addEventListener('change', () => {
      const [store, id] = sel.dataset.dodaj.split(':');
      const rec = dane[store].find((r) => r.id === Number(id));
      const [tab, , pole, stale] = (DODAJ[rodzajRek(store, rec)] || [])[Number(sel.value)] || [];
      sel.value = '';
      if (tab) onDodaj(tab, { [pole]: Number(id), ...(stale || {}) });
    });
  });
  const nazwaKafelka = (st, r) => { const [rodz, n] = opisKafelka(st, r); return `${rodz.toLowerCase()} ${n || ''}`.trim(); };
  container.querySelectorAll('[data-usun]').forEach((b) => b.addEventListener('click', async (event) => {
    event.stopPropagation();
    const [store, id] = b.dataset.usun.split(':');
    let usunieto;
    if (store === 'silniki' || store === 'czujniki') {
      const rec = dane[store].find((r) => r.id === Number(id));
      usunieto = rec && confirm(`Usunąć ${nazwaKafelka(store, rec)} z bazy? Tego nie da się cofnąć.`);
      if (usunieto) await nadzorDelete(store, Number(id));
    } else {
      usunieto = await usunElementSieci(dane, store, Number(id), nazwaKafelka);
    }
    if (usunieto) (onZmiana ? onZmiana() : renderDashboard(containerId, { onEditRecord, onShowOnPlan, onDodaj, onZmiana }));
  }));
  container.querySelectorAll('[data-edytuj]').forEach((b) => b.addEventListener('click', (event) => {
    event.stopPropagation();
    const [store, id] = b.dataset.edytuj.split(':');
    onEditRecord(store, Number(id));
  }));
  container.querySelectorAll('.dash-plan-btn[data-plan]').forEach((b) => {
    b.addEventListener('click', (event) => {
      event.stopPropagation();
      const [store, id] = b.dataset.plan.split(':');
      onShowOnPlan(store, Number(id));
    });
  });
  if (onEditRecord) {
    container.querySelectorAll('.dash-clickable').forEach((el) => {
      const otworz = (event) => {
        if (event.target.closest('.dash-plan-btn, .dash-dodaj, .dash-zwin')) return;
        onEditRecord(el.dataset.entity, Number(el.dataset.id));
      };
      el.addEventListener('click', otworz);
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          otworz(event);
        }
      });
    });
  }
}
