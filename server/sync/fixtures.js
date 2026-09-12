import { all, get, run, tx } from '../db/index.js';
import { DATA_FLOOR_MS, currentProviderSeason } from '../lib/season.js';
import { BudgetExhaustedError, remaining } from './budget.js';
import { listMatches, rowsOf, totalOf } from './client.js';
import { normalizeMatch } from './normalize.js';

/**
 * Fixture sync, in two lanes.
 *
 * The provider's /matches endpoint accepts either a single calendar date (which returns
 * every league on earth, ~900 rows over ten pages) or leagueId + season (which returns one
 * competition's whole season). The second form is dramatically cheaper for us, so it does
 * the bulk work:
 *
 *   Lane A, rotation: each resolved competition is re-pulled in full, oldest first,
 *            a page at a time, with the cursor stored on the row so a budget stop resumes.
 *   Lane B, refresh: matches we already hold that have kicked off and are not yet final.
 *            Queried as leagueId + date, which is driven entirely by local data, so it only
 *            spends requests where fixtures actually exist.
 *
 * Lane B runs first: it is small, time-sensitive, and it is what makes "Just played" on
 * the Home tab show real scores.
 */

const PAGE = 100;
const DAY_MS = 86_400_000;

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

/* -------------------------------------------------------------------------- */
/* Writing matches                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Teams that appear in a synced competition but are not on the seed list still get a row,
 * so crests and names render and search finds them. They are not followable (is_seed = 0)
 * and cost nothing extra, since the data is already in the payload.
 */
function ensureTeam(providerId, name, logoUrl) {
  if (!providerId) return null;
  const existing = get('SELECT id, logo_url FROM teams WHERE provider_id = ?', providerId);
  if (existing) {
    if (!existing.logo_url && logoUrl) {
      run('UPDATE teams SET logo_url = ? WHERE id = ?', logoUrl, existing.id);
    }
    return existing.id;
  }
  const short = String(name || '?')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase();
  const res = run(
    `INSERT INTO teams (provider_id, name, short, logo_url, is_seed, resolved, created_at)
     VALUES (?, ?, ?, ?, 0, 1, ?)`,
    providerId,
    name,
    short || '?',
    logoUrl,
    Date.now(),
  );
  return Number(res.lastInsertRowid);
}

/**
 * Upserts on provider_id so scores and status update in place. watch_logs key off the
 * local matches.id, which never changes, so a re-sync can never orphan a user's log.
 */
function upsertMatch(m, competitionId) {
  const homeId = ensureTeam(m.homeProviderId, m.homeName, m.homeLogo);
  const awayId = ensureTeam(m.awayProviderId, m.awayName, m.awayLogo);
  run(
    `INSERT INTO matches
       (provider_id, competition_id, competition_name, home_team_id, home_name,
        away_team_id, away_name, kickoff_utc, home_score, away_score, status,
        season, round, is_custom, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(provider_id) DO UPDATE SET
       competition_id = excluded.competition_id,
       competition_name = excluded.competition_name,
       home_team_id = excluded.home_team_id, home_name = excluded.home_name,
       away_team_id = excluded.away_team_id, away_name = excluded.away_name,
       kickoff_utc = excluded.kickoff_utc,
       home_score = excluded.home_score, away_score = excluded.away_score,
       status = excluded.status, season = excluded.season, round = excluded.round,
       updated_at = excluded.updated_at`,
    m.providerId,
    competitionId,
    m.competitionName,
    homeId,
    m.homeName,
    awayId,
    m.awayName,
    m.kickoffUtc,
    m.homeScore,
    m.awayScore,
    m.status,
    m.season,
    m.round,
    Date.now(),
  );
}

/** Writes a page of provider rows, skipping anything unusable. Returns rows written. */
function writePage(rows, competitionId) {
  return tx(() => {
    let written = 0;
    for (const raw of rows) {
      const m = normalizeMatch(raw);
      if (!m) continue;
      // Both lanes write through here, so the floor only needs stating once.
      if (m.kickoffUtc < DATA_FLOOR_MS) continue;
      upsertMatch(m, competitionId);
      written++;
    }
    return written;
  });
}

/* -------------------------------------------------------------------------- */
/* Lane B: refresh recent, non-final matches                                  */
/* -------------------------------------------------------------------------- */

/**
 * How long a (competition, date) pair is left alone after being fetched, scaled by how old
 * the match is.
 *
 * A game that kicked off an hour ago is worth re-checking often. One from last week that
 * still has no score almost certainly never will: the provider has stopped returning it,
 * and asking every half hour would spend the whole day's allowance finding that out again.
 */
function backoffMs(ageMs) {
  if (ageMs < 6 * 3_600_000) return 20 * 60 * 1000;
  if (ageMs < 2 * DAY_MS) return 3 * 3_600_000;
  return DAY_MS;
}

/**
 * (competition, date) pairs holding matches that have kicked off but are not marked final.
 * One request per pair updates every match in it.
 *
 * There is no lower bound beyond the data floor, on purpose. The old four-day window meant
 * a fixture the provider was slow to settle simply aged out of view and kept its null score
 * for good, which the UI then reported as "no result" on a match that had plainly finished.
 * Newest first, so a backlog never delays today's scores.
 */
export function staleRefreshTargets({ now = Date.now() } = {}) {
  const rows = all(
    `SELECT m.competition_id AS competitionId,
            c.provider_id    AS leagueProviderId,
            c.seed_name      AS competitionName,
            DATE(m.kickoff_utc / 1000, 'unixepoch') AS day,
            COUNT(*) AS n,
            MAX(m.kickoff_utc) AS latestKickoff,
            MAX(m.updated_at)  AS lastFetched
       FROM matches m
       JOIN competitions c ON c.id = m.competition_id
      WHERE m.is_custom = 0
        AND c.provider_id IS NOT NULL
        AND m.kickoff_utc BETWEEN ? AND ?
        AND m.status NOT IN ('finished', 'cancelled')
      GROUP BY m.competition_id, day
      ORDER BY day DESC`,
    DATA_FLOOR_MS,
    now + 6 * 3_600_000,
  );
  // Fetching a pair rewrites every row in it, so the newest updated_at is when we last
  // asked. Filtered here rather than in SQL because the backoff reads as a rule, not a join.
  return rows.filter((t) => now - t.lastFetched >= backoffMs(now - t.latestKickoff));
}

export async function refreshRecent({ maxRequests = Infinity, log = () => {} } = {}) {
  const targets = staleRefreshTargets();
  let spent = 0;
  let updated = 0;

  for (const t of targets) {
    if (spent >= maxRequests) break;
    if (remaining() < 1) throw new BudgetExhaustedError();

    const payload = await listMatches({
      leagueId: t.leagueProviderId,
      date: t.day,
      timezone: 'UTC',
      limit: PAGE,
    });
    spent++;
    const written = writePage(rowsOf(payload), t.competitionId);
    updated += written;
    log(`refresh ${t.competitionName} ${t.day} -> ${written} rows`);
  }
  return { spent, updated, targets: targets.length };
}

/* -------------------------------------------------------------------------- */
/* Lane A: full-season rotation                                               */
/* -------------------------------------------------------------------------- */

/** Competitions to re-pull, least recently completed first. Never-synced rows lead. */
export function rotationQueue() {
  return all(
    `SELECT * FROM competitions
      WHERE resolved = 1 AND provider_id IS NOT NULL
      ORDER BY (last_full_sync_at IS NULL) DESC,
               COALESCE(last_full_sync_at, 0) ASC,
               id ASC`,
  );
}

/**
 * Advances the rotation. Each request pulls one page of one competition's season; when a
 * competition runs out of pages its cursor resets and last_full_sync_at is stamped, which
 * sends it to the back of the queue.
 */
export async function syncRotation({ maxRequests = Infinity, season = null, log = () => {} } = {}) {
  let spent = 0;
  let written = 0;
  const completed = [];

  for (const comp of rotationQueue()) {
    if (spent >= maxRequests) break;

    // A competition that advertises a season ahead of this one is taken at its word: the
    // Asian Cup is a 2027 tournament and there is no 2026 edition to ask for.
    const seasonYear =
      season ??
      Math.max(comp.provider_season ?? 0, currentProviderSeason());

    while (spent < maxRequests) {
      if (remaining() < 1) throw new BudgetExhaustedError();
      const offset = comp.sync_cursor || 0;

      const payload = await listMatches({
        leagueId: comp.provider_id,
        season: seasonYear,
        timezone: 'UTC',
        limit: PAGE,
        offset,
      });
      spent++;

      const rows = rowsOf(payload);
      const total = totalOf(payload, offset + rows.length);
      written += writePage(rows, comp.id);

      const nextOffset = offset + rows.length;
      const done = rows.length === 0 || nextOffset >= total;

      if (done) {
        run(
          'UPDATE competitions SET sync_cursor = 0, sync_total = ?, last_full_sync_at = ? WHERE id = ?',
          total,
          Date.now(),
          comp.id,
        );
        completed.push(comp.seed_name);
        log(`season  ${comp.seed_name} ${seasonYear} complete (${total} matches)`);
        break;
      }

      run(
        'UPDATE competitions SET sync_cursor = ?, sync_total = ? WHERE id = ?',
        nextOffset,
        total,
        comp.id,
      );
      comp.sync_cursor = nextOffset;
      log(`season  ${comp.seed_name} ${seasonYear} ${nextOffset}/${total}`);
    }
  }

  return { spent, written, completed };
}

/* -------------------------------------------------------------------------- */
/* Orchestration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Refresh gets at most half of a run, rounded up, and never fewer than one request.
 *
 * Without a share of its own it would take everything whenever a backlog built up, and the
 * rotation that brings in new fixtures would never advance. Half keeps results landing
 * promptly without stalling the other lane.
 */
const refreshShare = (max) => (Number.isFinite(max) ? Math.max(1, Math.ceil(max / 2)) : max);

/** Runs both lanes within `maxRequests`, refresh first. */
export async function runSync({ maxRequests = Infinity, season = null, log = () => {} } = {}) {
  let spent = 0;
  let stoppedForBudget = false;
  const result = { refresh: null, rotation: null };

  try {
    result.refresh = await refreshRecent({ maxRequests: refreshShare(maxRequests), log });
    spent += result.refresh.spent;

    result.rotation = await syncRotation({ maxRequests: maxRequests - spent, season, log });
    spent += result.rotation.spent;
  } catch (err) {
    if (!(err instanceof BudgetExhaustedError)) throw err;
    stoppedForBudget = true;
    log('budget exhausted, progress saved, re-run to continue');
  }

  return { spent, stoppedForBudget, ...result };
}

export function fixtureStatus() {
  const counts = get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN is_custom = 1 THEN 1 ELSE 0 END) AS custom,
            MIN(kickoff_utc) AS earliest,
            MAX(kickoff_utc) AS latest
       FROM matches`,
  );
  const rotation = get(
    `SELECT COUNT(*) AS tracked,
            SUM(CASE WHEN last_full_sync_at IS NULL THEN 1 ELSE 0 END) AS neverSynced,
            MIN(last_full_sync_at) AS oldestPass
       FROM competitions
      WHERE resolved = 1 AND provider_id IS NOT NULL`,
  );
  return {
    matches: counts.total || 0,
    customMatches: counts.custom || 0,
    earliest: counts.earliest ? isoDate(counts.earliest) : null,
    latest: counts.latest ? isoDate(counts.latest) : null,
    rotation: {
      tracked: rotation.tracked || 0,
      neverSynced: rotation.neverSynced || 0,
      oldestPassAt: rotation.oldestPass || null,
    },
    pendingRefreshTargets: staleRefreshTargets().length,
  };
}
