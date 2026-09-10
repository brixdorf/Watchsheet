import express from 'express';
import { config } from '../config.js';
import { isAdmin } from '../lib/admin.js';
import { get, run, tx } from '../db/index.js';
import { isLocalDelivery, mailProvider } from '../lib/email/index.js';
import {
  CooldownError,
  isValidEmail,
  issueCode,
  normalizeEmail,
  verifyCode,
  RESEND_COOLDOWN_MS,
} from '../lib/otp.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  requireAuth,
  setSessionCookie,
} from '../lib/session.js';

export const authRouter = express.Router();

const VERIFY_MESSAGES = {
  no_code: 'That code has expired. Request a new one.',
  expired: 'That code has expired. Request a new one.',
  too_many_attempts: 'Too many tries. Request a fresh code.',
  incomplete: 'All six digits, please.',
  mismatch: 'That code is not right.',
};

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, admin: isAdmin(u) });

/** How many things this account follows. Zero means it has not been through the picker. */
const followCount = (userId) =>
  get('SELECT COUNT(*) AS n FROM follows WHERE user_id = ?', userId).n;

authRouter.get('/me', (req, res) => {
  res.json({
    user: req.user ? publicUser(req.user) : null,
    followCount: req.user ? followCount(req.user.id) : 0,
    localDelivery: isLocalDelivery(),
  });
});

/**
 * Rename. Held to the same two-character floor sign-up uses, so the rule lives in one
 * shape even though it is checked in two places.
 */
authRouter.patch('/me', requireAuth, (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 80);
  if (name.length < 2) return res.status(400).json({ error: 'Names need at least two characters.' });

  run('UPDATE users SET name = ? WHERE id = ?', name, req.user.id);
  res.json({ user: publicUser({ ...req.user, name }) });
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
    // The cooldown is enforced here, so the countdown on screen is seeded from here too
    // rather than from a second copy of the number living in the client.
    resendInMs: RESEND_COOLDOWN_MS,
    isReturning: !!existing,
    // Local delivery means the code never left this machine, so echoing it back is not a
    // disclosure. It is what makes the flow usable before a real provider is wired.
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
    return { id, email, name };
  });

  setSessionCookie(res, createSession(user.id, req.get('user-agent')));
  res.json({ user: publicUser(user), followCount: followCount(user.id) });
});

authRouter.post('/logout', (req, res) => {
  destroySession(req.sessionId);
  clearSessionCookie(res);
  res.json({ ok: true });
});
