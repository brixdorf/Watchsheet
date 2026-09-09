import express from 'express';
import { all, get, run, tx } from '../db/index.js';
import { requireAuth } from '../lib/session.js';
import { liveSince } from '../lib/activity.js';

export const catalogRouter = express.Router();
catalogRouter.use(requireAuth);

/**
 * The Following catalog.
 *
 * Everything the provider resolved is offered to everyone: the seeded list was one person's
 * starting point, not a shared assumption, so any user can follow any team or competition we
 * hold, at any time, without a server-side change. Competitions are ordered by whether they
 * are actually being played, then by rough worldwide popularity, so the names most people
 * are looking for lead and finished tournaments fall away on their own.
 *
 * Following is a filter on the feed, nothing more. It never implies a match was watched.
 */

const MAX_BULK_FOLLOWS = 200;

/* A seeded row keeps the requested spelling; a provider-created one has only its own name. */
const TEAM_NAME = 'COALESCE(t.seed_name, t.name)';
const COMP_NAME = 'COALESCE(c.seed_name, c.name)';

const teamRows = (uid) =>
  all(
    `SELECT t.id, ${TEAM_NAME} AS name, t.short, t.color, t.logo_url AS crest,
            t.is_national AS isNational, t.popularity, t.is_seed AS suggested,
            EXISTS(SELECT 1 FROM follows f
                    WHERE f.user_id = ? AND f.kind = 'team' AND f.entity_id = t.id) AS following,
            (SELECT COUNT(*) FROM watch_logs wl
               JOIN matches m ON m.id = wl.match_id
              WHERE wl.user_id = ? AND wl.watched = 1
                AND (m.home_team_id = t.id OR m.away_team_id = t.id)) AS watched
       FROM teams t
      WHERE t.resolved = 1
      ORDER BY t.popularity DESC, ${TEAM_NAME} COLLATE NOCASE ASC`,
    uid,
    uid,
  ).map((r) => ({
    ...r,
    following: !!r.following,
    isNational: !!r.isNational,
    suggested: !!r.suggested,
  }));

const competitionRows = (uid) =>
  all(
    `SELECT c.id, ${COMP_NAME} AS name, c.short, c.logo_url AS crest,
            c.country_name AS country, c.popularity, c.is_seed AS suggested,
            EXISTS(SELECT 1 FROM follows f
                    WHERE f.user_id = ? AND f.kind = 'competition' AND f.entity_id = c.id) AS following,
            (SELECT MAX(m.kickoff_utc) FROM matches m WHERE m.competition_id = c.id) >= ? AS live,
            (SELECT COUNT(*) FROM watch_logs wl
               JOIN matches m ON m.id = wl.match_id
              WHERE wl.user_id = ? AND wl.watched = 1 AND m.competition_id = c.id) AS watched
       FROM competitions c
      WHERE c.resolved = 1
      ORDER BY live DESC, c.popularity DESC, ${COMP_NAME} COLLATE NOCASE ASC`,
    uid,
    liveSince(),
    uid,
  ).map((r) => ({ ...r, following: !!r.following, suggested: !!r.suggested, live: !!r.live }));

catalogRouter.get('/teams', (req, res) => res.json({ teams: teamRows(req.user.id) }));

catalogRouter.get('/competitions', (req, res) =>
  res.json({ competitions: competitionRows(req.user.id) }),
);

/**
 * What a new account is offered during sign-up: the ranked names only, biggest first, so the
 * picker is a short recognisable menu rather than every side the provider has ever returned.
 */
catalogRouter.get('/suggestions', (req, res) => {
  const uid = req.user.id;
  res.json({
    teams: teamRows(uid).filter((t) => t.popularity > 0),
    competitions: competitionRows(uid).filter((c) => c.popularity > 0),
    following: get('SELECT COUNT(*) AS n FROM follows WHERE user_id = ?', uid).n,
  });
});

/**
 * Competition pills for the search filter.
 *
 * Yours, and only the ones being played: a strip of forty leagues is not a filter, and half
 * of them finished months ago. An account that followed nothing, or follows nothing with a
 * fixture in the window, falls back to whatever is live so the strip is never just "All".
 */
const filterPills = (uid, minePlayed) =>
  all(
    `SELECT c.id, ${COMP_NAME} AS name, c.short, COUNT(m.id) AS matches
       FROM competitions c
       JOIN matches m ON m.competition_id = c.id
      WHERE c.resolved = 1
        ${minePlayed ? `AND EXISTS(SELECT 1 FROM follows f
                    WHERE f.user_id = ? AND f.kind = 'competition' AND f.entity_id = c.id)` : ''}
      GROUP BY c.id
     HAVING MAX(m.kickoff_utc) >= ?
      ORDER BY c.popularity DESC, ${COMP_NAME} COLLATE NOCASE ASC`,
    ...(minePlayed ? [uid, liveSince()] : [liveSince()]),
  );

catalogRouter.get('/filters', (req, res) => {
  const uid = req.user.id;
  const mine = filterPills(uid, true);
  const competitions = mine.length ? mine : filterPills(uid, false);
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

const tableFor = (kind) => (kind === 'competition' ? 'competitions' : 'teams');
const followable = (kind, id) =>
  Boolean(get(`SELECT id FROM ${tableFor(kind)} WHERE id = ? AND resolved = 1`, id));

catalogRouter.put('/follows', (req, res) => {
  const uid = req.user.id;
  const kind = req.body?.kind === 'competition' ? 'competition' : 'team';
  const entityId = Number(req.body?.id);
  const following = Boolean(req.body?.following);

  if (!Number.isInteger(entityId)) return res.status(400).json({ error: 'Bad entity id' });
  if (following && !followable(kind, entityId)) {
    return res.status(404).json({ error: 'Not something you can follow' });
  }

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

/** One call for the sign-up picker, so choosing twenty sides is not twenty requests. */
catalogRouter.post('/follows/bulk', (req, res) => {
  const uid = req.user.id;
  const ids = (value) =>
    [...new Set((Array.isArray(value) ? value : []).map(Number).filter(Number.isInteger))].slice(
      0,
      MAX_BULK_FOLLOWS,
    );

  const teams = ids(req.body?.teams);
  const competitions = ids(req.body?.competitions);
  const now = Date.now();

  const added = tx(() => {
    let n = 0;
    for (const [kind, list] of [['team', teams], ['competition', competitions]]) {
      for (const id of list) {
        if (!followable(kind, id)) continue;
        n += run(
          'INSERT OR IGNORE INTO follows (user_id, kind, entity_id, created_at) VALUES (?, ?, ?, ?)',
          uid,
          kind,
          id,
          now,
        ).changes;
      }
    }
    return n;
  });

  res.json({ ok: true, added, following: get('SELECT COUNT(*) AS n FROM follows WHERE user_id = ?', uid).n });
});
