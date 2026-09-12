import express from 'express';
import { config } from '../config.js';
import { all, get, run } from '../db/index.js';
import { runMaintenance } from '../db/migrate.js';
import { requireAdmin, isAdmin } from '../lib/admin.js';
import { pruneCodes } from '../lib/otp.js';
import { pruneSessions, requireAuth } from '../lib/session.js';
import { budgetStatus, remaining } from '../sync/budget.js';
import { isRunning, lastRun, nextRun, tick } from '../sync/cron.js';
import { fixtureStatus, rotationQueue } from '../sync/fixtures.js';
import { matchCompetitions, seedStatus } from '../sync/seed.js';

export const adminRouter = express.Router();
adminRouter.use(requireAuth, requireAdmin);

const MAX_MANUAL_REQUESTS = 25;
const JOBS = ['auto', 'sync', 'scores', 'rotation', 'seed'];

/**
 * A season to pull instead of the one the clock says. The rotation normally derives the
 * season being played, which is what stops a dozen competitions advertising a stale newest
 * season from re-importing a back catalogue out of the daily budget. Overriding it is for
 * fetching a specific year on purpose, so anything that is not a plausible year is ignored
 * rather than refused: a stray value should not cost a run.
 */
function seasonOverride(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
}

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
  const job = JOBS.includes(req.body?.job) ? req.body.job : 'auto';
  const season = seasonOverride(req.body?.season);
  const asked = Number(req.body?.max);
  const max = Number.isFinite(asked)
    ? Math.max(1, Math.min(MAX_MANUAL_REQUESTS, Math.floor(asked)))
    : config.sync.slice;

  if (!config.highlightly.apiKey) {
    return res.status(409).json({ error: 'No provider API key is configured.' });
  }
  if (isRunning()) {
    return res.status(409).json({ error: 'A sync is already running. Give it a moment.' });
  }
  if (remaining() < 1) {
    return res.status(409).json({ error: "Today's request budget is spent. It resets at midnight UTC." });
  }

  const result = await tick({ slice: max, job, season });
  res.json({ result, budget: budgetStatus(), lastRun: lastRun() });
});

/**
 * The seed rows the provider never gave us.
 *
 * seedStatus counts these and the screen showed only the resolved total, so the names were
 * invisible outside a SQL client. They are the only thing you can act on: a competition that
 * came back "no match" is either genuinely not carried, or is carried under a name the
 * matcher did not recognise, and telling those apart needs the name in front of you. Pair
 * this with the free re-match and an alias edit is a loop you can close on one screen.
 *
 * Pending and missing are kept apart. Pending means seeding has not reached it yet and will;
 * missing means it has been looked for and finalised, and only an alias will change it.
 */
adminRouter.get('/catalog', (_req, res) => {
  const rows = (table, extra) =>
    all(
      `SELECT id, seed_name, name, resolved, ${extra} FROM ${table}
        WHERE is_seed = 1 AND resolved <> 1
        ORDER BY resolved, seed_name`,
    ).map((r) => ({
      id: r.id,
      name: r.seed_name || r.name,
      where: r.country_name || r.country_hint || r.country_code || '',
      status: r.resolved === -1 ? 'missing' : 'pending',
    }));

  res.json({
    competitions: rows('competitions', 'country_hint, country_name'),
    teams: rows('teams', 'country_code'),
  });
});

/**
 * Who the rotation reaches next, and a way to change that.
 *
 * The queue is least-recently-synced first, so a competition just added, or one whose
 * fixtures look wrong, can be waiting two days for its turn. Clearing its cursor puts it at
 * the head of the queue. It spends nothing by itself: the next run pays for it as it would
 * have paid anyway, only sooner.
 */
adminRouter.get('/rotation', (_req, res) => {
  // rotationQueue selects whole competition rows for the sync to work with. The screen
  // needs a name and a date, so only those cross the wire.
  const queue = rotationQueue()
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      name: c.display_name || c.name,
      country: c.country_name || c.country_code || '',
      lastSyncedAt: c.last_full_sync_at,
      season: c.provider_season,
      partial: c.sync_cursor > 0,
    }));
  res.json({ queue });
});

adminRouter.post('/rotation/:id/next', (req, res) => {
  const id = Number(req.params.id);
  const comp = get('SELECT id, display_name, name FROM competitions WHERE id = ?', id);
  if (!comp) return res.status(404).json({ error: 'No such competition' });

  run('UPDATE competitions SET last_full_sync_at = NULL, sync_cursor = 0 WHERE id = ?', id);
  res.json({ ok: true, competition: comp.display_name || comp.name });
});

/**
 * The jobs that cost nothing.
 *
 * None of these touch the provider, so none of them are guarded by the budget and none can
 * fail halfway and leave a bill. They already run on their own - the data jobs on every
 * boot, the prune on an hourly timer - and what was missing was a way to run one when you
 * have just changed something and want to see it take effect.
 *
 * The counts come back because "it worked" and "it changed nothing" look identical
 * otherwise, and with idempotent jobs the second is the normal answer.
 */
const MAINTENANCE = {
  // Re-applies popularity ranks, drops pre-floor fixtures, re-stamps seasons, reunites
  // teams the provider split. What every boot does.
  data: () => runMaintenance(),
  // Re-matches unresolved seed rows against the cached provider catalog. No network: the
  // catalog is already mirrored locally, which is what makes an alias edit free to retry.
  catalog: () => matchCompetitions({ finalize: false }),
  // Expired sessions and spent codes.
  prune: () => ({ sessions: pruneSessions(), codes: pruneCodes() }),
};

adminRouter.post('/maintenance', (req, res) => {
  const job = req.body?.job;
  if (!Object.hasOwn(MAINTENANCE, job)) {
    return res.status(400).json({ error: 'No such maintenance job.' });
  }
  res.json({ ok: true, job, result: MAINTENANCE[job]() });
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
