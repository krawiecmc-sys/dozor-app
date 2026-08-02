import {
  verifyAccessCode,
  isUnlockedToday,
  isMasterUnlocked,
  markUnlockedToday,
  markMasterUnlocked,
} from './totp.js';

const gateEl = document.getElementById('access-gate');
const appRootEl = document.getElementById('app-root');
const formEl = document.getElementById('gate-form');
const inputEl = document.getElementById('gate-code-input');
const errorEl = document.getElementById('gate-error');

let appStarted = false;

async function unlock() {
  gateEl.classList.add('hidden');
  appRootEl.classList.remove('hidden');
  if (!appStarted) {
    appStarted = true;
    await import('./app.js');
  }
}

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = inputEl.value;
  const result = await verifyAccessCode(code);

  if (result === 'today') {
    markUnlockedToday();
    await unlock();
  } else if (result === 'master') {
    markMasterUnlocked();
    await unlock();
  } else {
    errorEl.classList.remove('hidden');
    inputEl.value = '';
    inputEl.focus();
  }
});

if (isMasterUnlocked() || isUnlockedToday()) {
  unlock();
}
