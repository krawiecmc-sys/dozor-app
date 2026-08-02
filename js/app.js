import { getAllRecords, reseedIfNeeded, filterRecords } from './db.js';
import { seedData, SEED_VERSION } from '../data/seed-data.js';

const CATEGORY_LABELS = {
  przepisy: 'Przepisy prawne',
  normy: 'Normy techniczne',
  wzory: 'Wzory dokumentów',
  schematy: 'Schematy uniwersalne',
};

const listEl = document.getElementById('record-list');
const detailEl = document.getElementById('record-detail');
const searchEl = document.getElementById('search');
const filterEl = document.getElementById('category-filter');
const offlineIndicator = document.getElementById('offline-indicator');

let allRecords = [];
let state = { category: 'all', query: '' };

function renderList() {
  const filtered = filterRecords(allRecords, state);

  detailEl.classList.add('hidden');
  listEl.classList.remove('hidden');

  if (filtered.length === 0) {
    listEl.innerHTML = '<li class="empty-state">Brak wyników. Zmień filtr lub zapytanie.</li>';
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (r) => `
      <li class="record-card" data-id="${r.id}">
        <h3>${escapeHtml(r.title)}</h3>
        <div class="meta">${CATEGORY_LABELS[r.category] || r.category} · aktualizacja: ${r.updatedAt}</div>
        <div class="tags">${(r.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
      </li>
    `
    )
    .join('');

  listEl.querySelectorAll('.record-card').forEach((card) => {
    card.addEventListener('click', () => showDetail(card.dataset.id));
  });
}

function showDetail(id) {
  const record = allRecords.find((r) => r.id === id);
  if (!record) return;

  listEl.classList.add('hidden');
  detailEl.classList.remove('hidden');

  detailEl.innerHTML = `
    <button class="back-button">&larr; Wróć do listy</button>
    <h2>${escapeHtml(record.title)}</h2>
    <div class="meta">${CATEGORY_LABELS[record.category] || record.category} · aktualizacja: ${record.updatedAt}</div>
    <p class="source">Źródło: ${escapeHtml(record.source || 'brak')}</p>
    <div class="body">${escapeHtml(record.body)}</div>
  `;

  detailEl.querySelector('.back-button').addEventListener('click', renderList);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

filterEl.addEventListener('click', (event) => {
  const btn = event.target.closest('.chip');
  if (!btn) return;
  filterEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  state.category = btn.dataset.category;
  renderList();
});

searchEl.addEventListener('input', (event) => {
  state.query = event.target.value;
  renderList();
});

window.addEventListener('online', updateOfflineIndicator);
window.addEventListener('offline', updateOfflineIndicator);

function updateOfflineIndicator() {
  offlineIndicator.classList.toggle('hidden', navigator.onLine);
}

async function init() {
  await reseedIfNeeded(seedData, SEED_VERSION);
  allRecords = await getAllRecords();
  renderList();
  updateOfflineIndicator();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => {
      console.error('Rejestracja Service Workera nie powiodła się:', err);
    });
  }
}

init();
