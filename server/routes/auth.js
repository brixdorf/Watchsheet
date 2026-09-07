import express from 'express';
import { config } from '../config.js';
import { get, run, tx } from '../db/index.js';
import { isLocalDelivery, mailProvider } from '../lib/email/index.js';
import {
  CooldownError,
  isValidEmail,
  issueCode,
  normalizeEmail,
  verifyCode,
} from '../lib/otp.js';
import { clearSessionCookie, createSession, destroySession, setSessionCookie } from '../lib/session.js';

export const authRouter = express.Router();

const VERIFY_MESSAGES = {
  no_code: 'That code has expired — request a new one.',
  expired: 'That code has expired — request a new one.',
  too_many_attempts: 'Too many tries. Request a fresh code.',
  incomplete: 'All six digits, please.',
  mismatch: 'That code is not right.',
};

/**
 * Every new account starts out following everything from the seed list that resolved
 * against the provider. Seeds that never resolved are simply absent — custom match entry
 * covers those.
 */
function followSeedEntities(userId) {
  const now = Date.now();
  run(
    `INSERT OR IGNORE INTO follows (user_id, kind, entity_id, created_at)
     SELECT ?, 'competition', id, ? FROM competitions WHERE is_seed = 1 AND resolved = 1`,
    userId,
    now,
  );
  run(
    `INSERT OR IGNORE INTO follows (user_id, kind, entity_id, created_at)
     SELECT ?, 'team', id, ? FROM teams WHERE is_seed = 1 AND resolved = 1`,
    userId,
    now,
  );
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null, localDelivery: isLocalDelivery() });
});

authRouter.post('/request-code', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const name = String(req.body?.name ?? '').trim();

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'That email does not look right.' });
  }
  // An existing account already has a name, so only new sign-ups need to supply one.
  const existing = get('SELECT id, name FROM users WHERE email = ?', email);
  if (!existing && name.length < 2) {
    return res.status(400).json({ error: 'Pop your name in first.' });
  }

  let issued;
  try {
    issued = issueCode(email, name || existing?.name);
  } catch (err) {
    if (err instanceof CooldownError) {
      return res
        .status(429)
        .json({ error: err.message, retryAfterMs: err.retryAfterMs });
    }
    throw err;
  }

  try {
    await mailProvider().sendOtp({
      to: email,
      name: name || existing?.name,
      code: issued.code,
      expiresAt: issued.expiresAt,
      codeId: issued.codeId,
    });
  } catch (err) {
    console.error('Failed to send OTP:', err.message);
    return res.status(502).json({ error: 'Could not send the code. Try again in a moment.' });
  }

  res.json({
    ok: true,
    expiresAt: issued.expiresAt,
    isReturning: !!existing,
    // Local delivery means the code never left this machine, so echoing it back is not a
    // disclosure — it is what makes the flow usable before a real provider is wired.
    devCode: isLocalDelivery() && config.mail.devEcho ? issued.code : undefined,
  });
});

authRouter.post('/verify', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: 'That email does not look right.' });

  const result = verifyCode(email, req.body?.code);
  if (!result.ok) {
    return res.status(400).json({
      error: VERIFY_MESSAGES[result.reason] ?? 'That code is not right.',
      attemptsLeft: result.attemptsLeft,
    });
  }

  const user = tx(() => {
    const existing = get('SELECT * FROM users WHERE email = ?', email);
    if (existing) {
      run('UPDATE users SET last_login_at = ? WHERE id = ?', Date.now(), existing.id);
      // Catches follows for seeds that resolved after this account was created.
      followSeedEntities(existing.id);
      return existing;
    }
    const name = (result.name || email.split('@')[0]).slice(0, 80);
    const now = Date.now();
    const created = run(
      'INSERT INTO users (email, name, created_at, last_login_at) VALUES (?, ?, ?, ?)',
      email,
      name,
      now,
      now,
    );
    const id = Number(created.lastInsertRowid);
    followSeedEntities(id);
    return { id, email, name };
  });

  setSessionCookie(res, createSession(user.id, req.get('user-agent')));
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (req, res) => {
  destroySession(req.sessionId);
  clearSessionCookie(res);
  res.json({ ok: true });
});
