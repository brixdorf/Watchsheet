import crypto from 'node:crypto';
import { get, run } from '../db/index.js';

/**
 * Six-digit email codes.
 *
 * Codes are stored as salted hashes, never in plain text, so a database copy does not hand
 * over live login codes. The resend cooldown and attempt ceiling are enforced here rather
 * than in the UI: the design's countdown is a hint, this is the rule.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 30 * 1000;
export const MAX_ATTEMPTS = 5;

export class CooldownError extends Error {
  constructor(retryAfterMs) {
    super(`Hold on — you can request another code in ${Math.ceil(retryAfterMs / 1000)}s.`);
    this.name = 'CooldownError';
    this.retryAfterMs = retryAfterMs;
  }
}

export const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

// Deliberately permissive: the code round-trip is the real proof the address works.
export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));

const generateCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/** Salted with the address so the same code for two users hashes differently. */
const hashCode = (email, code) =>
  crypto.createHash('sha256').update(`${normalizeEmail(email)}:${code}`).digest('hex');

/** Issues a code, honouring the cooldown. Returns the plain code for the mail provider. */
export function issueCode(email, name) {
  const addr = normalizeEmail(email);
  const now = Date.now();

  const last = get(
    'SELECT created_at FROM otp_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1',
    addr,
  );
  if (last && now - last.created_at < RESEND_COOLDOWN_MS) {
    throw new CooldownError(RESEND_COOLDOWN_MS - (now - last.created_at));
  }

  // Only the newest code is ever valid; retire the rest so an old one cannot be replayed.
  run('UPDATE otp_codes SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL', now, addr);

  const code = generateCode();
  const inserted = run(
    `INSERT INTO otp_codes (email, name, code_hash, expires_at, attempts, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
    addr,
    name ? String(name).trim() : null,
    hashCode(addr, code),
    now + CODE_TTL_MS,
    now,
  );

  return { code, codeId: Number(inserted.lastInsertRowid), expiresAt: now + CODE_TTL_MS };
}

/**
 * Checks a code against the newest outstanding one for the address.
 *
 * Returns `{ ok: true, name }` or `{ ok: false, reason }`. A wrong code burns an attempt;
 * five wrong attempts retire the code entirely so guessing cannot continue.
 */
export function verifyCode(email, code) {
  const addr = normalizeEmail(email);
  const digits = String(code ?? '').replace(/\D/g, '');
  const now = Date.now();

  const row = get(
    `SELECT * FROM otp_codes
      WHERE email = ? AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    addr,
  );
  if (!row) return { ok: false, reason: 'no_code' };
  if (row.expires_at < now) {
    run('UPDATE otp_codes SET consumed_at = ? WHERE id = ?', now, row.id);
    return { ok: false, reason: 'expired' };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    run('UPDATE otp_codes SET consumed_at = ? WHERE id = ?', now, row.id);
    return { ok: false, reason: 'too_many_attempts' };
  }
  if (digits.length !== 6) {
    run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', row.id);
    return { ok: false, reason: 'incomplete' };
  }

  const expected = Buffer.from(row.code_hash, 'hex');
  const actual = Buffer.from(hashCode(addr, digits), 'hex');
  const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (!matches) {
    run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', row.id);
    const left = MAX_ATTEMPTS - (row.attempts + 1);
    return { ok: false, reason: 'mismatch', attemptsLeft: Math.max(0, left) };
  }

  run('UPDATE otp_codes SET consumed_at = ? WHERE id = ?', now, row.id);
  return { ok: true, name: row.name };
}

/** Drops codes that expired over a day ago. Called on the sweep alongside sessions. */
export function pruneCodes() {
  run('DELETE FROM otp_codes WHERE expires_at < ?', Date.now() - 86_400_000);
}
