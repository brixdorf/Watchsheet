import express from 'express';
import { get, run } from '../db/index.js';
import { findMatch } from '../lib/present.js';
import { requireAuth } from '../lib/session.js';

export const logsRouter = express.Router();
logsRouter.use(requireAuth);

/**
 * Watch logs.
 *
 * Logs key off the local matches.id, which is stable across re-syncs, so a score update
 * from the provider can never orphan or duplicate what a user recorded.
 */

function visibleMatch(userId, matchId) {
  return get(
    'SELECT id FROM matches WHERE id = ? AND (is_custom = 0 OR owner_user_id = ?)',
    matchId,
    userId,
  );
}

/** Marks watched and/or updates rating and note. Fields left out keep their value. */
logsRouter.put('/:matchId', (req, res) => {
  const uid = req.user.id;
  const matchId = Number(req.params.matchId);
  if (!visibleMatch(uid, matchId)) return res.status(404).json({ error: 'No such match' });

  const existing = get('SELECT * FROM watch_logs WHERE user_id = ? AND match_id = ?', uid, matchId);
  const body = req.body ?? {};

  const rating =
    body.rating === undefined
      ? existing?.rating ?? 0
      : Math.max(0, Math.min(5, Number(body.rating) || 0));
  const note =
    body.note === undefined ? existing?.note ?? '' : String(body.note).slice(0, 2000);

  const now = Date.now();
  run(
    `INSERT INTO watch_logs (user_id, match_id, watched, rating, note, watched_at, updated_at)
     VALUES (?, ?, 1, ?, ?, ?, ?)
     ON CONFLICT(user_id, match_id) DO UPDATE SET
       watched = 1, rating = excluded.rating, note = excluded.note, updated_at = excluded.updated_at`,
    uid,
    matchId,
    rating,
    note,
    existing?.watched_at ?? now,
    now,
  );

  res.json({ match: findMatch(uid, matchId) });
});

/** Removes the match from the user's history entirely. */
logsRouter.delete('/:matchId', (req, res) => {
  const uid = req.user.id;
  const matchId = Number(req.params.matchId);
  if (!visibleMatch(uid, matchId)) return res.status(404).json({ error: 'No such match' });

  run('DELETE FROM watch_logs WHERE user_id = ? AND match_id = ?', uid, matchId);
  res.json({ match: findMatch(uid, matchId) });
});
