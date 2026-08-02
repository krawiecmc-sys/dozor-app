// Weryfikacja kodu dostępu: TOTP (kod zmienia się raz na dobę, liczony
// z sekretu + daty UTC) albo klucz nadrzędny (stały, dla właściciela appki).
// Działa w pełni offline (Web Crypto API, bez zapytań sieciowych) — ważne,
// bo appka ma odblokowywać się też pod ziemią bez zasięgu.

import { TOTP_SECRET_BASE32, MASTER_KEY_HASH_HEX } from './totp-secret.js';

const PERIOD_SECONDS = 86400; // 1 doba — kod zmienia się raz dziennie (nie co 30s jak w typowym TOTP)
const DIGITS = 6;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input) {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

function counterToBytes(counter) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // JS number bezpieczny do 2^53 — wystarczające na miliony lat licząc dniami
  view.setUint32(4, counter & 0xffffffff, false);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  return new Uint8Array(buf);
}

async function hmacSha1(keyBytes, messageBytes) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageBytes);
  return new Uint8Array(signature);
}

async function computeTotpForCounter(counter) {
  const keyBytes = base32Decode(TOTP_SECRET_BASE32);
  const msgBytes = counterToBytes(counter);
  const digest = await hmacSha1(keyBytes, msgBytes);

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const code = (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
  return code;
}

function currentDayCounter() {
  return Math.floor(Date.now() / 1000 / PERIOD_SECONDS);
}

async function todaysCode() {
  return computeTotpForCounter(currentDayCounter());
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Zwraca 'today' | 'master' | null
export async function verifyAccessCode(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  if (trimmed === (await todaysCode())) return 'today';

  const hash = await sha256Hex(trimmed);
  if (hash === MASTER_KEY_HASH_HEX) return 'master';

  return null;
}

const STORAGE_KEY_DAY = 'dozorAccessUnlockedDay';
const STORAGE_KEY_MASTER = 'dozorAccessMasterUnlocked';

export function isUnlockedToday() {
  return localStorage.getItem(STORAGE_KEY_DAY) === String(currentDayCounter());
}

export function isMasterUnlocked() {
  return localStorage.getItem(STORAGE_KEY_MASTER) === 'true';
}

export function markUnlockedToday() {
  localStorage.setItem(STORAGE_KEY_DAY, String(currentDayCounter()));
}

export function markMasterUnlocked() {
  localStorage.setItem(STORAGE_KEY_MASTER, 'true');
}
