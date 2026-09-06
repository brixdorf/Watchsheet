import express from 'express';
import { all, get, run } from '../db/index.js';
import { requireAuth } from '../lib/session.js';

export const catalogRouter = express.Router();
catalogRouter.use(requireAuth);

/**
 * The Following tab.
 *
 * Only resolved seed entities appear. A seed that the provider does not carry stays out of
 * the catalog entirely rather than showing as an entry with no fixtures behind it.
 */

catalogRouter.get('/teams', (req, res) => {
  const uid = req.user.id;
  res.json({
    teams: all(
      `SELECT t.id, t.seed_name AS name, t.short, t.color, t.logo_url AS crest,
              t.is_national AS isNational,
              EXISTS(SELECT 1 FROM follows f
                      WHERE f.user_id = ? AND f.kind = 'team' AND f.entity_id = t.id) AS following,
              (SELECT COUNT(*) FROM watch_logs wl
                 JOIN matches m ON m.id = wl.match_id
                WHERE wl.user_id = ? AND wl.watched = 1
                  AND (m.home_team_id = t.id OR m.away_team_id = t.id)) AS watched
         FROM teams t
        WHERE t.is_seed = 1 AND t.resolved = 1
        ORDER BY t.is_national ASC, t.seed_name COLLATE NOCASE ASC`,
      uid,
      uid,
    ).map((r) => ({ ...r, following: !!r.following, isNational: !!r.isNational })),
  });
});

catalogRouter.get('/competitions', (req, res) => {
  const uid = req.user.id;
  res.json({
    competitions: all(
      `SELECT c.id, c.seed_name AS name, c.short, c.logo_url AS crest,
              c.country_name AS country,
              EXISTS(SELECT 1 FROM follows f
                      WHERE f.user_id = ? AND f.kind = 'competition' AND f.entity_id = c.id) AS following,
              (SELECT COUNT(*) FROM watch_logs wl
                 JOIN matches m ON m.id = wl.match_id
                WHERE wl.user_id = ? AND wl.watched = 1 AND m.competition_id = c.id) AS watched
         FROM competitions c
        WHERE c.is_seed = 1 AND c.resolved = 1
        ORDER BY c.seed_name COLLATE NOCASE ASC`,
      uid,
      uid,
    ).map((r) => ({ ...r, following: !!r.following })),
  });
});

/** Competition pills for the search filter — only ones we actually hold matches for. */
catalogRouter.get('/filters', (req, res) => {
  const uid = req.user.id;
  const competitions = all(
    `SELECT c.id, c.seed_name AS name, c.short, COUNT(m.id) AS matches
       FROM competitions c
       JOIN matches m ON m.competition_id = c.id
      WHERE c.resolved = 1
      GROUP BY c.id
      ORDER BY c.seed_name COLLATE NOCASE ASC`,
  );
  const customCount = get(
    'SELECT COUNT(*) AS n FROM matches WHERE is_custom = 1 AND owner_user_id = ?',
    uid,
  ).n;
  res.json({ competitions, customCount });
});

catalogRouter.get('/follows', (req, res) => {
  const rows = all('SELECT kind, entity_id FROM follows WHERE user_id = ?', req.user.id);
  res.json({
    teams: rows.filter((r) => r.kind === 'team').map((r) => r.entity_id),
    competitions: rows.filter((r) => r.kind === 'competition').map((r) => r.entity_id),
  });
});

catalogRouter.put('/follows', (req, res) => {
  const uid = req.user.id;
  const kind = req.body?.kind === 'competition' ? 'competition' : 'team';
  const entityId = Number(req.body?.id);
  const following = Boolean(req.body?.following);

  if (!Number.isInteger(entityId)) return res.status(400).json({ error: 'Bad entity id' });

  const table = kind === 'competition' ? 'competitions' : 'teams';
  const exists = get(`SELECT id FROM ${table} WHERE id = ? AND is_seed = 1 AND resolved = 1`, entityId);
  if (!exists) return res.status(404).json({ error: 'Not something you can follow' });

  if (following) {
    run(
      'INSERT OR IGNORE INTO follows (user_id, kind, entity_id, created_at) VALUES (?, ?, ?, ?)',
      uid,
      kind,
      entityId,
      Date.now(),
    );
  } else {
    run('DELETE FROM follows WHERE user_id = ? AND kind = ? AND entity_id = ?', uid, kind, entityId);
  }

  res.json({ ok: true, kind, id: entityId, following });
});
