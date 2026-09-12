import express from 'express';
import { all } from '../db/index.js';
import { followSets } from '../lib/present.js';
import { requireAuth } from '../lib/session.js';
import { toViewerClock, viewerOffset } from '../lib/tz.js';

export const statsRouter = express.Router();
statsRouter.use(requireAuth);

/**
 * The numbers behind the Stats tab, including the "stats nobody asked for" block.
 *
 * A server-side port of the design's stats() method. It runs over the user's whole watched
 * set rather than a page of it, which is why it lives here and not on the client.
 *
 * Anything time-of-day or calendar shaped (late kick-offs, matches per day, month buckets)
 * is computed in the viewer's timezone, passed in as `tzOffset`, the value of
 * Date.getTimezoneOffset(). Without it the same kick-off would count as late or not
 * depending on where the server happens to run, which for a late-night window is the
 * difference between an evening game and one that runs past midnight.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// A football season read left to right: August through May.
const SEASON_MONTHS = [7, 8, 9, 10, 11, 0, 1, 2, 3, 4];
const AVG_MATCH_MINUTES = 115;

/**
 * What counts as a late kick-off, in the viewer's own clock.
 *
 * Both ends are named because the window wraps. It used to be a lone `>= 21`, which reads
 * as "9pm onwards" but silently means "9, 10 or 11pm", since an hour rolls over to 0 at
 * midnight. Every 00:30 and 01:00 kick-off, which is the most unambiguously late slot there
 * is, failed the test. Stating the far end makes the wrap impossible to miss.
 */
const LATE_FROM = 21;
const LATE_UNTIL = 5;
const isLateHour = (hour) => hour >= LATE_FROM || hour < LATE_UNTIL;

/** Weeks starting Monday, matching the design's streak definition. */
const weekIndex = (ts) => Math.floor((ts - Date.UTC(1970, 0, 5)) / 604_800_000);

const rank = (counts) =>
  [...counts.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);

statsRouter.get('/', (req, res) => {
  const uid = req.user.id;
  const season = req.query.season && req.query.season !== 'all' ? String(req.query.season) : null;
  const tzOffsetMin = viewerOffset(req.query.tzOffset);

  // Shift into the viewer's wall clock, then read the UTC parts of the shifted instant.
  const local = (ts) => toViewerClock(ts, tzOffsetMin);

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
    if (isLateHour(d.getUTCHours())) night++;

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

  const played = rows.filter((r) => r.home_score != null && r.away_score != null);

  /**
   * The widest margin sat through. Ties go to the higher-scoring game, then the earlier
   * one, so there is always exactly one answer: the old "harshest verdict" picked the
   * lowest rating and had nothing to separate a dozen matches rated 1.
   */
  const rout = played.reduce((best, r) => {
    if (!best) return r;
    const d = Math.abs(r.home_score - r.away_score);
    const bd = Math.abs(best.home_score - best.away_score);
    if (d !== bd) return d > bd ? r : best;
    return r.home_score + r.away_score > best.home_score + best.away_score ? r : best;
  }, null);

  /** The scoreline seen most often, counted with the higher half first so 3-1 and 1-3 are one line. */
  const lines = new Map();
  for (const r of played) {
    const hi = Math.max(r.home_score, r.away_score);
    const lo = Math.min(r.home_score, r.away_score);
    const key = `${hi}-${lo}`;
    const seen = lines.get(key);
    if (seen) seen.n++;
    else lines.set(key, { key, n: 1, at: r.kickoff_utc });
  }
  const common = [...lines.values()].sort(
    (a, b) => b.n - a.n || Number(b.key.split('-')[0]) - Number(a.key.split('-')[0]) || b.at - a.at,
  )[0] ?? null;

  const topTeams = rank(teamCounts);
  const topComps = rank(compCounts);

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
    rout: rout
      ? {
          score: `${rout.home_score}-${rout.away_score}`,
          margin: Math.abs(rout.home_score - rout.away_score),
          label: `${rout.home_label} v ${rout.away_label}`,
        }
      : null,
    commonScore: common ? { score: common.key, n: common.n } : null,
    monthly: SEASON_MONTHS.map((m) => ({ month: m, label: MONTHS[m], n: monthly.get(m) ?? 0 })),
  });
});
