const DB_NAME = 'dozor-baza-wiedzy';
const DB_VERSION = 6;
const STORE = 'wiedza';
const STORE_META = 'meta';
const SEED_VERSION_KEY = 'seedVersion';

// Magazyny "Nadzoru rejonu" — dane operacyjne zakładowe (przodki, kombajny,
// urządzenia rejonowe, katalog zabezpieczeń, transformatory, pola
// rozdzielcze, chodniki+trasy kablowe), magazyn "Przeglądu" (log obchodów,
// bieżący + OUG/WUG) i magazyn "Diagnostyki" (baza przypadków + analiza).
// W odróżnieniu od STORE ("wiedza") te rekordy user tworzy/edytuje sam
// w appce — id nadawane automatycznie (autoIncrement), nie z góry ustalone
// jak w seed-data.js.
export const NADZOR_STORES = [
  'przodki',
  'kombajny',
  'urzadzeniaRejonowe',
  'zabezpieczeniaKatalog',
  'transformatory',
  'poleRozdzielcze',
  'chodnikiTrasy',
  'przegladyBiezace',
  'przegladyOugWug',
  'diagnostykaBaza',
  'diagnostykaAnaliza',
];

// WAŻNE (naprawione po realnym zawieszeniu appki w teście 2026-08-02):
// IndexedDB blokuje otwarcie nowej, wyższej wersji bazy, dopóki WSZYSTKIE
// inne otwarte karty/okna z tą samą appką nie zamkną swojego połączenia —
// bez obsługi tego appka po prostu wisi w nieskończoność (wygląda jak
// zawieszenie systemu), jeśli user ma appkę otwartą w więcej niż jednej
// karcie naraz (bardzo prawdopodobne przy intensywnym testowaniu).
// Rozwiązanie: każde połączenie samo się zamyka, gdy inna karta chce
// otworzyć nowszą wersję (onversionchange) — odblokowuje tamtą kartę
// zamiast czekać w nieskończoność.
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
      for (const name of NADZOR_STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        }
      }
    };

    request.onblocked = () => {
      console.warn(
        'PROTEKTOR: otwarcie bazy zablokowane przez inną otwartą kartę/okno tej appki. ' +
          'Zamknij pozostałe karty/instancje i odśwież.'
      );
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getAllRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addRecord(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const request = tx.objectStore(STORE_META).get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

async function setMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Odświeża lokalną bazę, gdy treść źródłowa (seed-data.js) się zmieniła.
// WAŻNE: to NIE czyści całego magazynu (jak dawniej) — appka jest teraz
// edytowalna, więc kasowanie wszystkiego przy każdej aktualizacji treści
// niszczyłoby edycje/dopiski usera. Zamiast tego: rekordy, których user
// nigdy nie edytował (brak flagi _userEdited), są nadpisywane świeżą
// treścią z seed-data.js (żeby poprawki dotarły); rekordy, które user
// już edytował, zostają nietknięte — jego wersja ma pierwszeństwo.
// Własne rekordy usera (spoza seed-data.js) nigdy nie są ruszane.
export async function reseedIfNeeded(seedData, seedVersion) {
  const storedVersion = await getMeta(SEED_VERSION_KEY);
  if (storedVersion === seedVersion) return;

  const existing = await getAllRecords();
  const existingById = new Map(existing.map((r) => [r.id, r]));

  for (const record of seedData) {
    const current = existingById.get(record.id);
    if (!current || !current._userEdited) {
      await addRecord({ ...record, _userEdited: false });
    }
  }

  await setMeta(SEED_VERSION_KEY, seedVersion);
}

// --- Baza wiedzy: dodawanie/edycja przez usera (poza automatycznym seedem) ---

export async function wiedzaAddNew(record) {
  const id = record.id || `wiedza-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await addRecord({ ...record, id, _userEdited: true, updatedAt: new Date().toISOString().slice(0, 10) });
  return id;
}

export async function wiedzaUpdate(record) {
  await addRecord({ ...record, _userEdited: true, updatedAt: new Date().toISOString().slice(0, 10) });
}

export async function wiedzaDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Nadzór rejonu: generyczne CRUD na dowolnym magazynie z NADZOR_STORES ---

export async function nadzorGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function nadzorAdd(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const request = tx.objectStore(storeName).add({
      ...record,
      updatedAt: new Date().toISOString(),
    });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function nadzorUpdate(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put({
      ...record,
      updatedAt: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function nadzorDelete(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Wpisuje przykładowe (fikcyjne) rekordy tylko gdy magazyn jest całkiem pusty
// i nigdy nie był jeszcze używany — nie nadpisuje realnych danych usera.
export async function nadzorSeedExampleIfNeeded(storeName, exampleRecord) {
  const seededKey = `nadzorSeeded:${storeName}`;
  const already = await getMeta(seededKey);
  if (already) return;

  const existing = await nadzorGetAll(storeName);
  if (existing.length === 0) {
    await nadzorAdd(storeName, exampleRecord);
  }
  await setMeta(seededKey, true);
}

// --- Synchronizacja między userami: eksport/import (bez serwera) ---
//
// Każdy telefon ma własną, osobną bazę (IndexedDB) — appka nigdzie
// automatycznie nie wysyła danych. Eksport zapisuje wszystko do jednego
// pliku JSON, który user może przesłać koledze (mail, komunikator, karta
// pamięci); import scala ten plik z lokalną bazą:
//   - Nadzór rejonu / Przegląd / Diagnostyka: rekordy z importu są zawsze
//     DODAWANE jako nowe (świeże id nadane lokalnie) — brak naturalnego
//     klucza do wykrywania duplikatów między urządzeniami w prototypie,
//     więc import tego samego pliku dwa razy utworzy duplikaty (świadome
//     uproszczenie, do poprawy później jeśli będzie potrzebne).
//   - Baza wiedzy: rekordy mają stałe id (np. 'przepisy-kp-207') — import
//     DODAJE tylko te, których jeszcze nie ma lokalnie; istniejące (także
//     te z seed-data.js) zostają nietknięte, żeby nie nadpisać niczyjej
//     pracy w żadną stronę.

export async function exportAllData(label) {
  const nadzor = {};
  for (const storeName of NADZOR_STORES) {
    nadzor[storeName] = await nadzorGetAll(storeName);
  }
  const wiedza = await getAllRecords();

  return {
    meta: {
      app: 'PROTEKTOR',
      formatVersion: 1,
      label: label || '',
      exportedAt: new Date().toISOString(),
    },
    nadzor,
    wiedza,
  };
}

export async function importAllData(data) {
  const summary = { dodaneNadzor: 0, dodaneWiedza: 0, pominieteWiedza: 0 };

  if (data.nadzor) {
    for (const storeName of NADZOR_STORES) {
      const records = data.nadzor[storeName];
      if (!Array.isArray(records)) continue;
      for (const record of records) {
        const { id, ...rest } = record; // odrzucamy obce id, lokalna baza nada własne
        await nadzorAdd(storeName, rest);
        summary.dodaneNadzor += 1;
      }
    }
  }

  if (Array.isArray(data.wiedza)) {
    const existing = await getAllRecords();
    const existingIds = new Set(existing.map((r) => r.id));
    for (const record of data.wiedza) {
      if (existingIds.has(record.id)) {
        summary.pominieteWiedza += 1;
        continue;
      }
      await addRecord(record);
      summary.dodaneWiedza += 1;
    }
  }

  return summary;
}

export function filterRecords(records, { category, query }) {
  let result = records;

  if (category && category !== 'all') {
    result = result.filter((r) => r.category === category);
  }

  if (query && query.trim() !== '') {
    const q = query.trim().toLowerCase();
    result = result.filter((r) => {
      const haystack = [r.title, r.body, r.source, ...(r.tags || [])]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  return result;
}
