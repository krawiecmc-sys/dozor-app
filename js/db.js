const DB_NAME = 'dozor-baza-wiedzy';
const DB_VERSION = 1;
const STORE = 'wiedza';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
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

export async function seedIfEmpty(seedData) {
  const existing = await getAllRecords();
  if (existing.length > 0) return;
  for (const record of seedData) {
    await addRecord(record);
  }
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
