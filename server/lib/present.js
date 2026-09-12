import { all, get } from '../db/index.js';

/**
 * Shared match reads.
 *
 * Everything the UI shows comes through here, which keeps two rules in one place:
 *   - a custom match is visible only to the user who created it
 *   - a match always carries that user's own watch log, or null
 *
 * Presentation (monogram colours, "in 3h" tags, win/loss dimming) stays on the client,
 * exactly as in the design. This layer returns facts.
 */

const SELECT = `
  SELECT m.id, m.provider_id, m.competition_id, m.competition_name,
         m.home_team_id, m.home_name, m.away_team_id, m.away_name,
         m.kickoff_utc, m.home_score, m.away_score, m.status, m.season, m.round,
         m.is_custom, m.owner_user_id,
         ht.name AS home_team_name, ht.short AS home_short, ht.color AS home_color,
         ht.logo_url AS home_logo, ht.is_seed AS home_is_seed,
         at.name AS away_team_name, at.short AS away_short, at.color AS away_color,
         at.logo_url AS away_logo, at.is_seed AS away_is_seed,
         c.seed_name AS comp_name, c.short AS comp_short, c.logo_url AS comp_logo,
         wl.watched, wl.rating, wl.note, wl.watched_at
    FROM matches m
    LEFT JOIN teams ht        ON ht.id = m.home_team_id
    LEFT JOIN teams at        ON at.id = m.away_team_id
    LEFT JOIN competitions c  ON c.id  = m.competition_id
    LEFT JOIN watch_logs wl   ON wl.match_id = m.id AND wl.user_id = ?
`;

/** Custom matches belong to one user; provider matches are shared. */
const VISIBLE = '(m.is_custom = 0 OR m.owner_user_id = ?)';

/** A short monogram for teams the provider gave us no code for. */
function fallbackShort(name) {
  const letters = String(name ?? '')
    .replace(/[^A-Za-z ]/g, '')
    .trim();
  if (!letters) return '?';
  const words = letters.split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0] + (words[2]?.[0] ?? '')).toUpperCase();
  return letters.slice(0, 3).toUpperCase();
}

function side(row, which) {
  const name = row[`${which}_team_name`] || row[`${which}_name`];
  return {
    id: row[`${which}_team_id`],
    name,
    short: row[`${which}_short`] || fallbackShort(name),
    color: row[`${which}_color`] || null,
    crest: row[`${which}_logo`] || null,
    score: row[`${which}_score`],
    isFollowable: row[`${which}_is_seed`] === 1,
  };
}

export function shapeMatch(row) {
  return {
    id: row.id,
    competition: {
      id: row.competition_id,
      // Custom matches carry only free text; provider matches prefer the seeded name so
      // the UI shows "LaLiga" rather than the provider's "La Liga".
      name: row.comp_name || row.competition_name,
      short: row.comp_short || (row.is_custom ? 'CUSTOM' : null),
      crest: row.comp_logo || null,
    },
    home: side(row, 'home'),
    away: side(row, 'away'),
    kickoff: row.kickoff_utc,
    homeScore: row.home_score,
    awayScore: row.away_score,
    status: row.status,
    season: row.season,
    round: row.round,
    isCustom: row.is_custom === 1,
    log: row.watched
      ? {
          watched: true,
          rating: row.rating || 0,
          note: row.note || '',
          watchedAt: row.watched_at,
        }
      : null,
  };
}

/**
 * Runs a query built on SELECT, injecting the user id for the log join and visibility.
 *
 * `followedTeam` is stamped here rather than computed in SQL because the caller already
 * knows: the feed asks for one half of the follow rule at a time, so the answer is whichever
 * query the row came out of. Adding a correlated subquery to the SELECT list would mean more
 * placeholders in a parameter order that is already positional and easy to get wrong.
 */
export function queryMatches(userId, where, params = [], tail = '', { followedTeam } = {}) {
  const sql = `${SELECT} WHERE ${VISIBLE}${where ? ` AND ${where}` : ''} ${tail}`;
  return all(sql, userId, userId, ...params).map((row) => {
    const match = shapeMatch(row);
    if (followedTeam !== undefined) match.followedTeam = followedTeam;
    return match;
  });
}

export function findMatch(userId, matchId) {
  const row = get(`${SELECT} WHERE m.id = ? AND ${VISIBLE}`, userId, matchId, userId);
  return row ? shapeMatch(row) : null;
}

/** Ids of everything the user follows, as sets for cheap membership tests. */
export function followSets(userId) {
  const rows = all('SELECT kind, entity_id FROM follows WHERE user_id = ?', userId);
  return {
    teams: new Set(rows.filter((r) => r.kind === 'team').map((r) => r.entity_id)),
    competitions: new Set(rows.filter((r) => r.kind === 'competition').map((r) => r.entity_id)),
  };
}

/**
 * What the user follows, as two SQL fragments rather than one.
 *
 * A follow is not one thing. Following Arsenal means you want their matches; following the
 * Premier League means you will take the rest of it too. Treating both the same is how a
 * feed of twelve, sorted only by kick-off time, fills with whatever happens to start next
 * and leaves the sides you actually follow off the bottom of the card.
 *
 * The two are mutually exclusive and their union is every match the user follows, so a feed
 * built from both in turn holds exactly what one combined clause would have held.
 *
 * Returned as fragments rather than applied in JS so the database does the filtering.
 */
export function followedTeamClause() {
  return `(
    m.home_team_id IN (SELECT entity_id FROM follows WHERE user_id = ? AND kind = 'team')
    OR m.away_team_id IN (SELECT entity_id FROM follows WHERE user_id = ? AND kind = 'team')
  )`;
}

export function followedCompOnlyClause() {
  return `(
    m.competition_id IN (SELECT entity_id FROM follows WHERE user_id = ? AND kind = 'competition')
    AND NOT ${followedTeamClause()}
  )`;
}

