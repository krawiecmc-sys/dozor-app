const DB_NAME = 'dozor-baza-wiedzy';
const DB_VERSION = 2;
const STORE = 'wiedza';
const STORE_META = 'meta';
const SEED_VERSION_KEY = 'seedVersion';

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
    };

    request.onsuccess = () => resolve(request.result);
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

// Odświeża lokalną bazę, gdy treść źródłowa (seed-data.js) się zmieniła —
// porównuje zapisaną wersję z bieżącą i w razie różnicy nadpisuje dane.
// To zalążek mechanizmu aktualizacji z Fazy 2 (docelowo: pobieranie pakietu
// aktualizacji online zamiast lokalnego seed-data.js).
export async function reseedIfNeeded(seedData, seedVersion) {
  const storedVersion = await getMeta(SEED_VERSION_KEY);
  if (storedVersion === seedVersion) return;

  await clearRecords();
  for (const record of seedData) {
    await addRecord(record);
  }
  await setMeta(SEED_VERSION_KEY, seedVersion);
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
