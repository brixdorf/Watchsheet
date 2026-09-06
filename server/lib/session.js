import crypto from 'node:crypto';
import { config } from '../config.js';
import { get, run } from '../db/index.js';

/**
 * Cookie-backed sessions kept in SQLite.
 *
 * The id is 32 random bytes, and the cookie is signed on top of that — signing is what
 * stops a tampered id from even reaching a database lookup.
 */

export const COOKIE_NAME = 'ws_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createSession(userId, userAgent) {
  const id = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  run(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)',
    id,
    userId,
    now,
    now + SESSION_TTL_MS,
    userAgent ? String(userAgent).slice(0, 300) : null,
  );
  return id;
}

export function destroySession(id) {
  if (id) run('DELETE FROM sessions WHERE id = ?', id);
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    signed: true,
    maxAge: SESSION_TTL_MS,
    path: '/',
  };
}

export function setSessionCookie(res, id) {
  res.cookie(COOKIE_NAME, id, cookieOptions());
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
}

/**
 * Resolves the session cookie to `req.user` when it is valid. Never rejects — routes that
 * need a user say so with requireAuth, so public routes stay simple.
 */
export function attachUser(req, _res, next) {
  req.user = null;
  req.sessionId = null;

  const id = req.signedCookies?.[COOKIE_NAME];
  if (!id) return next();

  const row = get(
    `SELECT s.id AS sid, s.expires_at, u.id, u.email, u.name, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
    id,
  );
  if (!row) return next();
  if (row.expires_at < Date.now()) {
    destroySession(id);
    return next();
  }

  req.sessionId = row.sid;
  req.user = { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  next();
}

export function pruneSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
}
