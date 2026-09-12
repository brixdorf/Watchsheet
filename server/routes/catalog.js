import express from 'express';
import { all, get, run, tx } from '../db/index.js';
import { requireAuth } from '../lib/session.js';
import { liveSince, playingWindow } from '../lib/activity.js';

export const catalogRouter = express.Router();
catalogRouter.use(requireAuth);

/**
 * The Following catalog.
 *
 * Everything the provider resolved is offered to everyone: the seeded list was one person's
 * starting point, not a shared assumption, so any user can follow any team or competition we
 * hold, at any time, without a server-side change. Competitions are ordered by whether they
 * are actually being played, then by rough worldwide popularity, so the names most people
 * are looking for lead and finished tournaments fall away on their own. Teams are ordered
 * the same way, on whether they have a fixture in the next few days, which is what keeps
 * club sides ahead of national ones outside an international window.
 *
 * Following is a filter on the feed, nothing more. It never implies a match was watched.
 */

const MAX_BULK_FOLLOWS = 200;

/* A seeded row keeps the requested spelling; a provider-created one has only its own name. */
const TEAM_NAME = 'COALESCE(t.seed_name, t.name)';
const COMP_NAME = 'COALESCE(c.seed_name, c.name)';

/**
 * Every figure here is gathered in one pass and joined on, rather than asked per team.
 *
 * The per-team form ran the watched count as a correlated subquery over the user's whole log
 * for each of 1,300-odd teams, and SQLite cannot use an index for `home = ? OR away = ?` in
 * that position. It was 5ms on today's data and 8.8 seconds at 40,000 fixtures with 3,000
 * logs, and node:sqlite is synchronous, so for those seconds the whole server stopped
 * answering everyone. Same rows, same order; 22ms at that size.
 *
 * A match counts once towards a team even in the odd row that names it on both sides, which
 * is what the UNION (rather than UNION ALL) of match and team preserves. Team ids are filtered
 * for NULL because custom matches carry none, and a NULL in an IN list turns "not playing"
 * into NULL rather than false.
 */
const teamRows = (uid) => {
  const [from, to] = playingWindow();
  return all(
    `WITH playing AS (
            SELECT home_team_id AS team_id FROM matches
             WHERE kickoff_utc BETWEEN ? AND ? AND home_team_id IS NOT NULL
            UNION
            SELECT away_team_id FROM matches
             WHERE kickoff_utc BETWEEN ? AND ? AND away_team_id IS NOT NULL
          ),
          watched AS (
            SELECT team_id, COUNT(*) AS n FROM (
              SELECT m.id, m.home_team_id AS team_id
                FROM watch_logs wl JOIN matches m ON m.id = wl.match_id
               WHERE wl.user_id = ? AND wl.watched = 1
              UNION
              SELECT m.id, m.away_team_id
                FROM watch_logs wl JOIN matches m ON m.id = wl.match_id
               WHERE wl.user_id = ? AND wl.watched = 1
            )
            WHERE team_id IS NOT NULL
            GROUP BY team_id
          )
     SELECT t.id, ${TEAM_NAME} AS name, t.short, t.color, t.logo_url AS crest,
            t.is_national AS isNational, t.popularity, t.is_seed AS suggested,
            t.id IN (SELECT entity_id FROM follows WHERE user_id = ? AND kind = 'team') AS following,
            t.id IN (SELECT team_id FROM playing) AS playing,
            COALESCE(w.n, 0) AS watched
       FROM teams t
       LEFT JOIN watched w ON w.team_id = t.id
      WHERE t.resolved = 1
      ORDER BY playing DESC, t.popularity DESC, ${TEAM_NAME} COLLATE NOCASE ASC`,
    from,
    to,
    from,
    to,
    uid,
    uid,
    uid,
  ).map((r) => ({
    ...r,
    following: !!r.following,
    isNational: !!r.isNational,
    suggested: !!r.suggested,
    playing: !!r.playing,
  }));
};

/** The watched counts come from one grouped pass, for the reason given on teamRows. */
const competitionRows = (uid) =>
  all(
    `WITH watched AS (
            SELECT m.competition_id, COUNT(*) AS n
              FROM watch_logs wl JOIN matches m ON m.id = wl.match_id
             WHERE wl.user_id = ? AND wl.watched = 1 AND m.competition_id IS NOT NULL
             GROUP BY m.competition_id
          )
     SELECT c.id, ${COMP_NAME} AS name, c.short, c.logo_url AS crest,
            c.country_name AS country, c.popularity, c.is_seed AS suggested,
            c.id IN (SELECT entity_id FROM follows WHERE user_id = ? AND kind = 'competition') AS following,
            (SELECT MAX(m.kickoff_utc) FROM matches m WHERE m.competition_id = c.id) >= ? AS live,
            COALESCE(w.n, 0) AS watched
       FROM competitions c
       LEFT JOIN watched w ON w.competition_id = c.id
      WHERE c.resolved = 1
      ORDER BY live DESC, c.popularity DESC, ${COMP_NAME} COLLATE NOCASE ASC`,
    uid,
    uid,
    liveSince(),
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
 * Every competition holding matches, the ones being played first.
 *
 * Ordering and filtering are not the same job, and this strip previously did both: it hid
 * anything without a fixture in the live window, and scoped what was left to your follows.
 * That is right for a catalog and wrong for search, which is where you go to find a match
 * you have already watched. A tournament is at its most searchable just after it finishes,
 * and the World Cup dropped off this strip eight days after the final.
 *
 * The join keeps out competitions holding nothing, so no pill can lead to an empty result.
 */
const filterPills = () =>
  all(
    `SELECT c.id, ${COMP_NAME} AS name, c.short, COUNT(m.id) AS matches,
            MAX(m.kickoff_utc) >= ? AS live
       FROM competitions c
       JOIN matches m ON m.competition_id = c.id
      WHERE c.resolved = 1
      GROUP BY c.id
      ORDER BY live DESC, c.popularity DESC, ${COMP_NAME} COLLATE NOCASE ASC`,
    liveSince(),
  ).map((r) => ({ ...r, live: !!r.live }));

catalogRouter.get('/filters', (req, res) => {
  const customCount = get(
    'SELECT COUNT(*) AS n FROM matches WHERE is_custom = 1 AND owner_user_id = ?',
    req.user.id,
  ).n;
  res.json({ competitions: filterPills(), customCount });
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
