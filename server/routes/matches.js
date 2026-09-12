import express from 'express';
import { all, get, run, tx } from '../db/index.js';
import {
  followedCompOnlyClause,
  followedTeamClause,
  findMatch,
  queryMatches,
} from '../lib/present.js';
import { seasonIdFor, DATA_FLOOR_MS } from '../lib/season.js';
import { requireAuth } from '../lib/session.js';

export const matchesRouter = express.Router();
matchesRouter.use(requireAuth);

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The text a search query is matched against, assembled in SQL so filtering happens in the
 * database rather than by loading every match into memory. Month names are spelled out so
 * "sep 2026" works the way the design's client-side search did.
 */
const HAYSTACK = `LOWER(
  COALESCE(ht.name, m.home_name) || ' ' || COALESCE(at.name, m.away_name) || ' ' ||
  COALESCE(ht.short, '') || ' ' || COALESCE(at.short, '') || ' ' ||
  COALESCE(c.seed_name, m.competition_name) || ' ' || m.season || ' ' ||
  COALESCE(m.round, '') || ' ' ||
  DATE(m.kickoff_utc / 1000, 'unixepoch') || ' ' ||
  CASE STRFTIME('%m', m.kickoff_utc / 1000, 'unixepoch')
    WHEN '01' THEN 'jan january' WHEN '02' THEN 'feb february' WHEN '03' THEN 'mar march'
    WHEN '04' THEN 'apr april'   WHEN '05' THEN 'may'          WHEN '06' THEN 'jun june'
    WHEN '07' THEN 'jul july'    WHEN '08' THEN 'aug august'   WHEN '09' THEN 'sep september'
    WHEN '10' THEN 'oct october' WHEN '11' THEN 'nov november' ELSE 'dec december' END
)`;

/**
 * Home feed: what the user follows, split into what is coming and what just happened, and
 * within each, the sides they follow ahead of everything else.
 *
 * Each half is two queries rather than one. Sorting a single result set would not do it:
 * the cut to a card's worth happens in SQL, so a match the user actually cares about is not
 * ranked low, it is never fetched. With one list of twelve by kick-off time, a Saturday of
 * league football fills every slot before a followed side takes the pitch.
 *
 * Teams are asked for first and the rest of the card goes to their competitions, so an
 * account following two clubs still gets a full feed instead of a short one.
 */
const TEAM_SLOTS = 8;
const TOTAL_SLOTS = 14;

matchesRouter.get('/feed', (req, res) => {
  const uid = req.user.id;
  const now = Date.now();
  const teamOnly = followedTeamClause();
  const compOnly = followedCompOnlyClause();

  // followedTeamClause takes two user ids, followedCompOnlyClause three: one for the
  // competition test and two for the team test it negates.
  const section = (window, windowParams, order) => {
    const teams = queryMatches(
      uid,
      `${teamOnly} AND ${window}`,
      [uid, uid, ...windowParams],
      `${order} LIMIT ${TEAM_SLOTS}`,
      { followedTeam: true },
    );
    const room = TOTAL_SLOTS - teams.length;
    const others = room > 0
      ? queryMatches(
        uid,
        `${compOnly} AND ${window}`,
        [uid, uid, uid, ...windowParams],
        `${order} LIMIT ${room}`,
        { followedTeam: false },
      )
      : [];
    return teams.concat(others);
  };

  const upcoming = section(
    `m.kickoff_utc >= ? AND m.status NOT IN ('cancelled')`,
    [now - 3 * 3_600_000],
    'ORDER BY m.kickoff_utc ASC',
  );

  const recent = section('m.kickoff_utc < ?', [now], 'ORDER BY m.kickoff_utc DESC');

  const followCount = get(
    'SELECT COUNT(*) AS n FROM follows WHERE user_id = ?',
    uid,
  ).n;

  res.json({
    upcoming,
    recent,
    followCount,
    untagged: recent.filter((m) => !m.log && m.kickoff < now).length,
  });
});

/* Search runs entirely against local SQLite. It never touches the provider. */
matchesRouter.get('/search', (req, res) => {
  const uid = req.user.id;
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const competitionId = req.query.competition ? Number(req.query.competition) : null;
  const season = req.query.season && req.query.season !== 'all' ? String(req.query.season) : null;
  const includeUpcoming = req.query.upcoming !== 'false';

  const clauses = [];
  const params = [];

  if (competitionId === -1) {
    clauses.push('m.is_custom = 1');
  } else if (competitionId) {
    clauses.push('m.competition_id = ?');
    params.push(competitionId);
  }
  if (season) {
    clauses.push('m.season = ?');
    params.push(season);
  }
  if (!includeUpcoming) {
    clauses.push('m.kickoff_utc < ?');
    params.push(Date.now());
  }
  // Every word must appear somewhere, which is how the design's search behaved. The words are
  // literal text, so LIKE's own wildcards are escaped: searching "_" used to match everything.
  for (const word of q.split(/\s+/).filter(Boolean).slice(0, 6)) {
    clauses.push(`${HAYSTACK} LIKE ? ESCAPE '!'`);
    params.push(`%${word.replace(/[!%_]/g, '!$&')}%`);
  }

  const limit = q || competitionId || season ? 60 : 24;
  // Played matches first, most recent leading, then upcoming fixtures soonest-first.
  // Searching is mostly "what did I watch", so a fixture four months out should not be
  // the first thing you see, but it should still be findable.
  const now = Date.now();
  const matches = queryMatches(
    uid,
    clauses.join(' AND '),
    params,
    `ORDER BY (m.kickoff_utc > ${now}) ASC,
              CASE WHEN m.kickoff_utc <= ${now} THEN m.kickoff_utc END DESC,
              CASE WHEN m.kickoff_utc >  ${now} THEN m.kickoff_utc END ASC
     LIMIT ${limit}`,
  );

  res.json({ matches, filtered: Boolean(q || competitionId || season) });
});

/* Watched history, grouped by month the way the design lays it out. */
matchesRouter.get('/history', (req, res) => {
  const uid = req.user.id;
  const season = req.query.season && req.query.season !== 'all' ? String(req.query.season) : null;
  const filter = String(req.query.filter ?? 'All');

  const clauses = ['wl.watched = 1'];
  const params = [];
  if (season) {
    clauses.push('m.season = ?');
    params.push(season);
  }
  if (filter === 'Rated') clauses.push('wl.rating > 0');
  if (filter === 'With notes') clauses.push("COALESCE(wl.note, '') <> ''");
  if (filter === 'Custom') clauses.push('m.is_custom = 1');

  const matches = queryMatches(
    uid,
    clauses.join(' AND '),
    params,
    'ORDER BY m.kickoff_utc DESC LIMIT 600',
  );

  const groups = [];
  for (const m of matches) {
    const d = new Date(m.kickoff);
    const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    let group = groups.at(-1);
    if (!group || group.label !== label) {
      group = { label, matches: [] };
      groups.push(group);
    }
    group.matches.push(m);
  }

  res.json({
    groups: groups.map((g) => ({ ...g, count: g.matches.length })),
    total: matches.length,
    withNotes: matches.filter((m) => m.log?.note).length,
  });
});

/* Seasons that actually have data, for the header picker. */
matchesRouter.get('/seasons', (req, res) => {
  const uid = req.user.id;
  const rows = all(
    `SELECT m.season AS season,
            SUM(CASE WHEN wl.watched = 1 THEN 1 ELSE 0 END) AS logged
       FROM matches m
       LEFT JOIN watch_logs wl ON wl.match_id = m.id AND wl.user_id = ?
      WHERE (m.is_custom = 0 OR m.owner_user_id = ?)
        AND (m.is_custom = 1 OR m.kickoff_utc >= ?)
      GROUP BY m.season
      ORDER BY m.season DESC`,
    uid,
    uid,
    DATA_FLOOR_MS,
  );
  const current = seasonIdFor(new Date());
  if (!rows.some((r) => r.season === current)) rows.unshift({ season: current, logged: 0 });
  res.json({
    seasons: rows.map((r) => ({ id: r.season, logged: r.logged || 0, current: r.season === current })),
    current,
  });
});

matchesRouter.post('/custom', (req, res) => {
  const uid = req.user.id;
  const body = req.body ?? {};
  const home = String(body.home ?? '').trim();
  const away = String(body.away ?? '').trim();
  const competition = String(body.competition ?? '').trim() || 'Custom match';
  const date = String(body.date ?? '').trim();
  const time = /^\d{2}:\d{2}$/.test(String(body.time ?? '')) ? String(body.time) : '15:00';

  if (!home || !away) return res.status(400).json({ error: 'Both sides need a name.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Pick a date.' });

  // Parsed in local time, matching what the user typed into the date and time fields.
  const kickoff = new Date(`${date}T${time}:00`).getTime();
  if (!Number.isFinite(kickoff)) return res.status(400).json({ error: 'Pick a date.' });

  const score = (v) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };
  const rating = Math.max(0, Math.min(5, Number(body.rating) || 0));
  const note = String(body.note ?? '').trim().slice(0, 2000);

  const matchId = tx(() => {
    const inserted = run(
      `INSERT INTO matches
         (competition_name, home_name, away_name, kickoff_utc, home_score, away_score,
          status, season, is_custom, owner_user_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'finished', ?, 1, ?, ?)`,
      competition,
      home,
      away,
      kickoff,
      score(body.homeScore),
      score(body.awayScore),
      seasonIdFor(new Date(kickoff)),
      uid,
      Date.now(),
    );
    const id = Number(inserted.lastInsertRowid);
    // A custom match only exists because the user watched it, so it is logged on creation.
    run(
      `INSERT INTO watch_logs (user_id, match_id, watched, rating, note, watched_at, updated_at)
       VALUES (?, ?, 1, ?, ?, ?, ?)`,
      uid,
      id,
      rating,
      note,
      Date.now(),
      Date.now(),
    );
    return id;
  });

  res.status(201).json({ match: findMatch(uid, matchId) });
});

matchesRouter.get('/:id', (req, res) => {
  const match = findMatch(req.user.id, Number(req.params.id));
  if (!match) return res.status(404).json({ error: 'No such match' });
  res.json({ match });
});

matchesRouter.delete('/:id', (req, res) => {
  const uid = req.user.id;
  const id = Number(req.params.id);
  const owned = get('SELECT id FROM matches WHERE id = ? AND is_custom = 1 AND owner_user_id = ?', id, uid);
  if (!owned) return res.status(404).json({ error: 'No such custom match' });
  run('DELETE FROM matches WHERE id = ?', id);
  res.json({ ok: true });
});

export { DAY_MS };
