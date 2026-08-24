import { getLastExportAt, hasAnyNadzorData } from './db.js';

// Dane operacyjne (Nadzór rejonu/Przegląd/Diagnostyka) żyją wyłącznie
// w IndexedDB tego telefonu — appka nigdzie nic automatycznie nie wysyła
// (patrz komentarz w db.js). Jedyna ochrona przed utratą telefonu to ręczny
// eksport JSON z zakładki "Synchronizacja". Ten banner przypomina o tym,
// zamiast liczyć na to, że user sam o tym pamięta.
const REMINDER_DAYS = 14;

export async function checkExportReminder(bannerEl) {
  const hasData = await hasAnyNadzorData();
  if (!hasData) {
    bannerEl.classList.add('hidden');
    return;
  }

  const lastExportAt = await getLastExportAt();
  const daysSince = lastExportAt
    ? (Date.now() - new Date(lastExportAt).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;

  if (daysSince < REMINDER_DAYS) {
    bannerEl.classList.add('hidden');
    return;
  }

  const text = lastExportAt
    ? `Ostatni eksport danych: ${Math.floor(daysSince)} dni temu.`
    : 'Nie zrobiono jeszcze żadnego eksportu danych.';
  bannerEl.querySelector('.export-reminder-text').textContent =
    `${text} Dane operacyjne żyją tylko na tym telefonie — zrób eksport, żeby ich nie stracić przy zgubieniu/awarii.`;
  bannerEl.classList.remove('hidden');
}
