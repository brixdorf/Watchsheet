import express from 'express';
import { all } from '../db/index.js';
import { followSets } from '../lib/present.js';
import { requireAuth } from '../lib/session.js';

export const statsRouter = express.Router();
statsRouter.use(requireAuth);

/**
 * The numbers behind the Stats tab, including the "stats nobody asked for" block.
 *
 * A server-side port of the design's stats() method. It runs over the user's whole watched
 * set rather than a page of it, which is why it lives here and not on the client.
 *
 * Anything time-of-day or calendar shaped (late kick-offs, matches per day, month buckets)
 * is computed in the viewer's timezone, passed in as `tzOffset` — the value of
 * Date.getTimezoneOffset(). Without it a 21:00 kick-off would count as late or not
 * depending on where the server happens to run.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// A football season read left to right: August through May.
const SEASON_MONTHS = [7, 8, 9, 10, 11, 0, 1, 2, 3, 4];
const AVG_MATCH_MINUTES = 115;

/** Weeks starting Monday, matching the design's streak definition. */
const weekIndex = (ts) => Math.floor((ts - Date.UTC(1970, 0, 5)) / 604_800_000);

const rank = (counts) =>
  [...counts.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);

statsRouter.get('/', (req, res) => {
  const uid = req.user.id;
  const season = req.query.season && req.query.season !== 'all' ? String(req.query.season) : null;
  const tzOffsetMin = Number.isFinite(Number(req.query.tzOffset))
    ? Number(req.query.tzOffset)
    : new Date().getTimezoneOffset();

  // Shift into the viewer's wall clock, then read the UTC parts of the shifted instant.
  const local = (ts) => new Date(ts - tzOffsetMin * 60_000);

  const rows = all(
    `SELECT m.id, m.kickoff_utc, m.home_score, m.away_score, m.competition_id, m.is_custom,
            m.home_team_id, m.away_team_id, m.home_name, m.away_name,
            COALESCE(ht.seed_name, ht.name, m.home_name) AS home_label,
            COALESCE(at.seed_name, at.name, m.away_name) AS away_label,
            ht.short AS home_short, ht.color AS home_color, ht.logo_url AS home_crest,
            at.short AS away_short, at.color AS away_color, at.logo_url AS away_crest,
            COALESCE(c.seed_name, m.competition_name) AS comp_label,
            c.short AS comp_short, c.logo_url AS comp_crest,
            wl.rating, wl.note
       FROM watch_logs wl
       JOIN matches m ON m.id = wl.match_id
       LEFT JOIN teams ht       ON ht.id = m.home_team_id
       LEFT JOIN teams at       ON at.id = m.away_team_id
       LEFT JOIN competitions c ON c.id  = m.competition_id
      WHERE wl.user_id = ? AND wl.watched = 1
        AND (m.is_custom = 0 OR m.owner_user_id = ?)
        ${season ? 'AND m.season = ?' : ''}
      ORDER BY m.kickoff_utc ASC`,
    ...(season ? [uid, uid, season] : [uid, uid]),
  );

  const follows = followSets(uid);
  const isFollowed = (r) =>
    follows.competitions.has(r.competition_id) ||
    follows.teams.has(r.home_team_id) ||
    follows.teams.has(r.away_team_id);

  const teamCounts = new Map();
  const compCounts = new Map();
  const teamMeta = new Map();
  const compMeta = new Map();
  const dayCounts = new Map();
  const monthly = new Map(SEASON_MONTHS.map((m) => [m, 0]));

  let goals = 0;
  let nils = 0;
  let chaos = 0;
  let night = 0;
  let neutral = 0;
  let notes = 0;

  for (const r of rows) {
    const hs = r.home_score;
    const as = r.away_score;
    if (hs != null && as != null) {
      goals += hs + as;
      if (hs === 0 && as === 0) nils++;
      if (hs + as >= 5) chaos++;
    }

    const d = local(r.kickoff_utc);
    if (d.getUTCHours() >= 21) night++;

    const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    dayCounts.set(dayKey, (dayCounts.get(dayKey) ?? 0) + 1);
    if (monthly.has(d.getUTCMonth())) {
      monthly.set(d.getUTCMonth(), monthly.get(d.getUTCMonth()) + 1);
    }

    for (const which of ['home', 'away']) {
      const id = r[`${which}_team_id`];
      if (id == null) continue;
      teamCounts.set(id, (teamCounts.get(id) ?? 0) + 1);
      if (!teamMeta.has(id)) {
        teamMeta.set(id, {
          id,
          name: r[`${which}_label`],
          short: r[`${which}_short`],
          color: r[`${which}_color`],
          crest: r[`${which}_crest`],
        });
      }
    }

    const compKey = r.is_custom ? 'custom' : r.competition_id;
    if (compKey != null) {
      compCounts.set(compKey, (compCounts.get(compKey) ?? 0) + 1);
      if (!compMeta.has(compKey)) {
        compMeta.set(compKey, {
          id: r.is_custom ? null : r.competition_id,
          name: r.is_custom ? 'Custom matches' : r.comp_label,
          short: r.is_custom ? 'CUSTOM' : r.comp_short,
          crest: r.is_custom ? null : r.comp_crest,
        });
      }
    }

    if (!isFollowed(r)) neutral++;
    if (r.note) notes++;
  }

  /* Longest quiet spell between two watched matches. */
  let gap = 0;
  let gapFrom = null;
  for (let i = 1; i < rows.length; i++) {
    const days = Math.round((rows[i].kickoff_utc - rows[i - 1].kickoff_utc) / 86_400_000);
    if (days > gap) {
      gap = days;
      gapFrom = rows[i - 1].kickoff_utc;
    }
  }

  /* Streaks counted in consecutive weeks, as in the design. */
  const weeks = [...new Set(rows.map((r) => weekIndex(r.kickoff_utc)))].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  weeks.forEach((w, i) => {
    run = i > 0 && w === weeks[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });

  let current = 0;
  if (weeks.length) {
    const nowWeek = weekIndex(Date.now());
    // This week or last week still counts as live, so a streak does not appear to break
    // simply because the new week has not had a match in it yet.
    if (weeks.at(-1) >= nowWeek - 1) {
      current = 1;
      for (let i = weeks.length - 1; i > 0; i--) {
        if (weeks[i] === weeks[i - 1] + 1) current++;
        else break;
      }
    }
  }

  const rated = rows.filter((r) => (r.rating ?? 0) > 0);
  const avg = rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 0;
  const worstRow = rated.length
    ? rated.reduce((lo, r) => (r.rating < lo.rating ? r : lo), rated[0])
    : null;

  const topTeams = rank(teamCounts);
  const topComps = rank(compCounts);

  /* How often the most-watched side lost while the user was watching. */
  const topTeamId = topTeams[0]?.key ?? null;
  let heartbreak = 0;
  if (topTeamId != null) {
    for (const r of rows) {
      if (r.home_score == null || r.away_score == null) continue;
      if (r.home_team_id === topTeamId && r.away_score > r.home_score) heartbreak++;
      else if (r.away_team_id === topTeamId && r.home_score > r.away_score) heartbreak++;
    }
  }

  const withMeta = (list, meta) =>
    list.slice(0, 5).map((e) => ({ ...(meta.get(e.key) ?? { name: 'Unknown' }), n: e.n }));

  res.json({
    season: season ?? 'all',
    count: rows.length,
    rated: rated.length,
    goals,
    goalsPerMatch: rows.length ? goals / rows.length : 0,
    notes,
    nils,
    chaos,
    night,
    neutral,
    minutes: rows.length * AVG_MATCH_MINUTES,
    maxDay: dayCounts.size ? Math.max(...dayCounts.values()) : 0,
    gapDays: gap,
    gapFrom,
    currentStreak: current,
    longestStreak: longest,
    averageRating: avg,
    topTeams: withMeta(topTeams, teamMeta),
    topCompetitions: withMeta(topComps, compMeta),
    topTeamName: topTeamId != null ? teamMeta.get(topTeamId)?.name ?? null : null,
    heartbreak,
    worst: worstRow
      ? {
          rating: worstRow.rating,
          home: worstRow.home_short || worstRow.home_label,
          away: worstRow.away_short || worstRow.away_label,
          label: `${worstRow.home_label} v ${worstRow.away_label}`,
        }
      : null,
    monthly: SEASON_MONTHS.map((m) => ({ month: m, label: MONTHS[m], n: monthly.get(m) ?? 0 })),
  });
});
