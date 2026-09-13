import express from 'express';
import { config } from '../config.js';
import { all, get, run } from '../db/index.js';
import { requireAdmin, isAdmin } from '../lib/admin.js';
import { requireAuth } from '../lib/session.js';
import { budgetStatus, remaining } from '../sync/budget.js';
import { isRunning, keyRejection, lastRun, nextRun, tick } from '../sync/cron.js';
import { fixtureStatus } from '../sync/fixtures.js';
import { seedStatus } from '../sync/seed.js';

export const adminRouter = express.Router();
adminRouter.use(requireAuth, requireAdmin);

const MAX_MANUAL_REQUESTS = 25;

/**
 * The admin screen.
 *
 * Everything here is owner-only: the request budget is an account-wide resource, and who
 * else has signed up is nobody else's business. Only /sync used to be readable by any
 * signed-in user, which put the provider spend in front of people who cannot act on it.
 */

/** Today's spend, how far seeding got, what the rotation holds, and the schedule. */
adminRouter.get('/sync', (_req, res) => {
  res.json({
    budget: budgetStatus(),
    seed: seedStatus(),
    fixtures: fixtureStatus(),
    lastRun: lastRun(),
    schedule: {
      enabled: config.sync.enabled && Boolean(config.highlightly.apiKey),
      slicePerTick: config.sync.slice,
      nextRun: nextRun(),
      running: isRunning(),
      keyRejected: keyRejection(),
    },
  });
});

/** Totals across the whole install, for the top of the admin screen. */
adminRouter.get('/overview', (_req, res) => {
  const now = Date.now();
  const one = (sql, ...params) => get(sql, ...params).n;
  res.json({
    users: one('SELECT COUNT(*) AS n FROM users'),
    activeSessions: one('SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?', now),
    watched: one('SELECT COUNT(*) AS n FROM watch_logs WHERE watched = 1'),
    notes: one("SELECT COUNT(*) AS n FROM watch_logs WHERE note <> ''"),
    customMatches: one('SELECT COUNT(*) AS n FROM matches WHERE is_custom = 1'),
    matches: one('SELECT COUNT(*) AS n FROM matches WHERE is_custom = 0'),
    teams: one('SELECT COUNT(*) AS n FROM teams WHERE resolved = 1'),
    competitions: one('SELECT COUNT(*) AS n FROM competitions WHERE resolved = 1'),
    codesLastDay: one('SELECT COUNT(*) AS n FROM otp_codes WHERE created_at > ?', now - 86_400_000),
  });
});

/** Everyone who has signed up, newest first, with what they have actually done. */
adminRouter.get('/users', (_req, res) => {
  const now = Date.now();
  const rows = all(
    `SELECT u.id, u.email, u.name, u.created_at AS createdAt, u.last_login_at AS lastLoginAt,
            (SELECT COUNT(*) FROM watch_logs wl WHERE wl.user_id = u.id AND wl.watched = 1) AS watched,
            (SELECT COUNT(*) FROM watch_logs wl WHERE wl.user_id = u.id AND wl.note <> '') AS notes,
            (SELECT COUNT(*) FROM follows f WHERE f.user_id = u.id) AS follows,
            (SELECT COUNT(*) FROM matches m WHERE m.is_custom = 1 AND m.owner_user_id = u.id) AS customMatches,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions,
            (SELECT MAX(s.expires_at) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessionExpiresAt
       FROM users u
      ORDER BY u.created_at DESC`,
    now,
    now,
  );
  res.json({
    users: rows.map((r) => ({ ...r, admin: isAdmin(r) })),
    sessionTtlDays: 30,
  });
});

/**
 * Runs a sync now instead of waiting for the schedule.
 *
 * The budget guard applies exactly as it does to the cron, and the per-run ceiling is a
 * second belt: a mis-click cannot spend the whole day's allowance in one go.
 */
adminRouter.post('/sync/run', async (req, res) => {
  const job = ['auto', 'sync', 'seed'].includes(req.body?.job) ? req.body.job : 'auto';
  const asked = Number(req.body?.max);
  const max = Number.isFinite(asked)
    ? Math.max(1, Math.min(MAX_MANUAL_REQUESTS, Math.floor(asked)))
    : config.sync.slice;

  if (!config.highlightly.apiKey) {
    return res.status(409).json({ error: 'No provider API key is configured.' });
  }
  if (keyRejection()) {
    return res.status(409).json({ error: keyRejection() });
  }
  if (isRunning()) {
    return res.status(409).json({ error: 'A sync is already running. Give it a moment.' });
  }
  if (remaining() < 1) {
    return res.status(409).json({ error: "Today's request budget is spent. It resets at midnight UTC." });
  }

  const result = await tick({ slice: max, job });
  res.json({ result, budget: budgetStatus(), lastRun: lastRun() });
});

/** Signs a user out everywhere. Their next visit needs a fresh code. */
adminRouter.post('/users/:id/revoke', (req, res) => {
  const id = Number(req.params.id);
  const user = get('SELECT id FROM users WHERE id = ?', id);
  if (!user) return res.status(404).json({ error: 'No such user' });
  const before = get('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', id).n;
  run('DELETE FROM sessions WHERE user_id = ?', id);
  res.json({ ok: true, revoked: before });
});

/**
 * Deletes an account and everything attached to it: logs, follows, custom matches and
 * sessions all cascade. Admin accounts are refused, which also stops you locking yourself
 * out with one click.
 */
adminRouter.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = get('SELECT id, email FROM users WHERE id = ?', id);
  if (!user) return res.status(404).json({ error: 'No such user' });
  if (isAdmin(user)) return res.status(409).json({ error: 'Admin accounts cannot be deleted here.' });

  run('DELETE FROM users WHERE id = ?', id);
  run('DELETE FROM otp_codes WHERE email = ?', user.email);
  res.json({ ok: true, deleted: id });
});
