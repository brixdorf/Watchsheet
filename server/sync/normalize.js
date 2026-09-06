import { seasonIdFor } from '../lib/season.js';

/**
 * Turns Highlightly payloads into rows shaped like our tables.
 *
 * Provider quirks handled here so nothing downstream has to know about them:
 *   - scores arrive as a single "2 - 4" string, or null before kick-off
 *   - `round` is a label ("Group Stage", "Regular Season - 23"), not a number
 *   - status is free text in `state.description`
 */

/** "2 - 4" -> [2, 4]; anything unparseable -> [null, null]. */
export function parseScore(current) {
  if (typeof current !== 'string') return [null, null];
  const m = current.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (!m) return [null, null];
  return [Number(m[1]), Number(m[2])];
}

/**
 * Collapses the provider's free-text state into the four values the UI cares about.
 * Penalty and extra-time finishes count as finished; anything mid-flight is live.
 */
export function parseStatus(state) {
  const desc = String(state?.description ?? '').toLowerCase();
  if (!desc) return state?.clock != null ? 'live' : 'scheduled';
  if (/finish|ended|after pen|after extra|full ?time/.test(desc)) return 'finished';
  if (/postpon|delay/.test(desc)) return 'postponed';
  if (/cancel|abandon|awarded|walkover/.test(desc)) return 'cancelled';
  if (/not started|scheduled|to be defined|tbd|time to be/.test(desc)) return 'scheduled';
  if (/half|extra|penalt|break|interrupt|suspend|live|\d/.test(desc)) return 'live';
  return state?.clock != null ? 'live' : 'scheduled';
}

/** Provider match -> the fields matches rows need. Returns null if unusable. */
export function normalizeMatch(row) {
  const kickoff = Date.parse(row?.date ?? '');
  if (!Number.isFinite(kickoff)) return null;
  if (!row?.homeTeam?.name || !row?.awayTeam?.name) return null;

  const [homeScore, awayScore] = parseScore(row?.state?.score?.current);

  return {
    providerId: String(row.id),
    competitionProviderId: row.league?.id != null ? String(row.league.id) : null,
    competitionName: row.league?.name || 'Unknown competition',
    competitionLogo: row.league?.logo || null,
    homeProviderId: row.homeTeam.id != null ? String(row.homeTeam.id) : null,
    homeName: row.homeTeam.name,
    homeLogo: row.homeTeam.logo || null,
    awayProviderId: row.awayTeam.id != null ? String(row.awayTeam.id) : null,
    awayName: row.awayTeam.name,
    awayLogo: row.awayTeam.logo || null,
    kickoffUtc: kickoff,
    homeScore,
    awayScore,
    status: parseStatus(row.state),
    round: row.round ? String(row.round) : null,
    season: seasonIdFor(new Date(kickoff)),
  };
}

/** Provider league -> competition columns. */
export function normalizeLeague(row) {
  return {
    providerId: String(row.id),
    name: row.name,
    logoUrl: row.logo || null,
    countryCode: row.country?.code || null,
    countryName: row.country?.name || null,
    // `seasons` comes back newest-first; the largest value is the safest "current".
    seasons: Array.isArray(row.seasons)
      ? row.seasons.map((s) => s?.season).filter((s) => Number.isFinite(s))
      : [],
  };
}

/** Provider team -> team columns. */
export function normalizeTeam(row) {
  return {
    providerId: String(row.id),
    name: row.name,
    logoUrl: row.logo || null,
    isNational: String(row.type ?? '').toLowerCase() === 'national',
  };
}
