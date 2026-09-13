import { all, get, getState, run, setState, tx } from '../db/index.js';
import { SEED_COMPETITIONS, SEED_TEAMS } from '../db/seedData.js';
import { competitionPopularity, teamPopularity } from '../db/popularity.js';
import { countryMatches, pickBest } from '../lib/names.js';
import { BudgetExhaustedError, remaining } from './budget.js';
import { listLeagues, listTeams, rowsOf, totalOf } from './client.js';
import { neverSyncedCount } from './fixtures.js';
import { normalizeLeague, normalizeTeam } from './normalize.js';

/**
 * Resolves the seeded teams and competitions against Highlightly.
 *
 * Every step is resumable. Progress is committed per entity, so hitting the daily budget
 * is a clean stop: re-running tomorrow picks up at the first unresolved row rather than
 * starting over. Anything that cannot be resolved is marked -1 and stays out of the
 * catalog, and custom match entry covers those.
 */

const LEAGUE_PAGE = 100;
const LEAGUE_OFFSET_KEY = 'seed.leagues.offset';
const LEAGUE_TOTAL_KEY = 'seed.leagues.total';

/* -------------------------------------------------------------------------- */
/* Step 1: insert the seed rows. Free, no network.                            */
/* -------------------------------------------------------------------------- */

export function insertSeedRows() {
  const now = Date.now();
  return tx(() => {
    let comps = 0;
    let teams = 0;

    for (const c of SEED_COMPETITIONS) {
      // Two seeds are both called "Super Cup", so identity is name + country hint.
      const existing = get(
        `SELECT id FROM competitions
          WHERE seed_name = ? AND COALESCE(country_hint, '') = COALESCE(?, '')`,
        c.name,
        c.country ?? null,
      );
      if (existing) continue;
      run(
        `INSERT INTO competitions
           (name, short, display_name, seed_name, country_hint, popularity, is_seed, resolved, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)`,
        c.name,
        c.short,
        c.name,
        c.name,
        c.country ?? null,
        competitionPopularity(c.name, c.country),
        now,
      );
      comps++;
    }

    for (const t of SEED_TEAMS) {
      const existing = get('SELECT id FROM teams WHERE seed_name = ?', t.name);
      if (existing) continue;
      run(
        `INSERT INTO teams
           (name, short, color, seed_name, is_national, popularity, is_seed, resolved, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)`,
        t.name,
        t.short,
        t.color,
        t.name,
        t.national ? 1 : 0,
        teamPopularity(t.name),
        now,
      );
      teams++;
    }
    return { comps, teams };
  });
}

/* -------------------------------------------------------------------------- */
/* Step 2: mirror the league catalog, then match locally.                     */
/* -------------------------------------------------------------------------- */

/** True once every page of /leagues has been mirrored into provider_leagues. */
export function leagueCatalogComplete() {
  const total = Number(getState(LEAGUE_TOTAL_KEY, '0'));
  if (!total) return false;
  return Number(getState(LEAGUE_OFFSET_KEY, '0')) >= total;
}

/** Pulls further pages of /leagues, up to `maxRequests`. Safe to call repeatedly. */
export async function fetchLeagueCatalog({ maxRequests = Infinity, log = () => {} } = {}) {
  let spent = 0;
  while (spent < maxRequests && !leagueCatalogComplete()) {
    if (remaining() < 1) throw new BudgetExhaustedError();
    const offset = Number(getState(LEAGUE_OFFSET_KEY, '0'));

    const payload = await listLeagues({ limit: LEAGUE_PAGE, offset });
    spent++;
    const rows = rowsOf(payload);
    const total = totalOf(payload, offset + rows.length);

    tx(() => {
      const now = Date.now();
      for (const raw of rows) {
        const l = normalizeLeague(raw);
        run(
          `INSERT INTO provider_leagues
             (provider_id, name, country_code, country_name, logo_url, seasons_json, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(provider_id) DO UPDATE SET
             name = excluded.name, country_code = excluded.country_code,
             country_name = excluded.country_name, logo_url = excluded.logo_url,
             seasons_json = excluded.seasons_json, fetched_at = excluded.fetched_at`,
          l.providerId,
          l.name,
          l.countryCode,
          l.countryName,
          l.logoUrl,
          JSON.stringify(l.seasons),
          now,
        );
      }
      setState(LEAGUE_TOTAL_KEY, total);
      setState(LEAGUE_OFFSET_KEY, offset + rows.length);
    });

    log(`leagues ${offset + rows.length}/${total}`);
    // A short page means the catalog ended earlier than totalCount claimed.
    if (!rows.length) {
      setState(LEAGUE_OFFSET_KEY, total);
      break;
    }
  }
  return { spent, complete: leagueCatalogComplete() };
}

/**
 * Matches unresolved competitions against the cached catalog. Costs nothing.
 *
 * Country hints are enforced on the first pass, which is what separates the German and
 * Indian "Super Cup". Seeds with no hint, and hinted seeds that found nothing, get a
 * second pass without the country constraint.
 */
export function matchCompetitions({ finalize = false, log = () => {} } = {}) {
  const catalog = all('SELECT * FROM provider_leagues');
  if (!catalog.length) return { resolved: 0, unresolved: 0 };

  const taken = new Set(
    all('SELECT provider_id FROM competitions WHERE provider_id IS NOT NULL').map((r) => r.provider_id),
  );
  const pending = all('SELECT * FROM competitions WHERE is_seed = 1 AND resolved = 0');
  let resolved = 0;

  const attach = (comp, row) => {
    const seasons = JSON.parse(row.seasons_json || '[]');
    run(
      `UPDATE competitions SET
         provider_id = ?, name = ?, display_name = ?, logo_url = ?,
         country_code = ?, country_name = ?, provider_season = ?, resolved = 1
       WHERE id = ?`,
      row.provider_id,
      comp.seed_name,
      row.name,
      row.logo_url,
      row.country_code,
      row.country_name,
      seasons.length ? Math.max(...seasons) : null,
      comp.id,
    );
    taken.add(row.provider_id);
    resolved++;
    log(`comp  ok  ${comp.seed_name} -> ${row.name} (${row.country_name || 'World'})`);
  };

  for (const strictCountry of [true, false]) {
    for (const comp of pending) {
      if (comp.resolved === 1 || taken.has(comp.provider_id)) continue;
      const fresh = get('SELECT resolved FROM competitions WHERE id = ?', comp.id);
      if (fresh.resolved === 1) continue;

      const seed = {
        name: comp.seed_name,
        aliases: SEED_COMPETITIONS.find(
          (c) => c.name === comp.seed_name && (c.country ?? null) === (comp.country_hint ?? null),
        )?.aliases ?? [],
      };

      const best = pickBest(seed, catalog, (row) => {
        if (taken.has(row.provider_id)) return -1;
        const hit = countryMatches(comp.country_hint, row.country_code, row.country_name);
        if (comp.country_hint && strictCountry && !hit) return -1;
        return hit && comp.country_hint ? 5 : 0;
      });
      if (best) attach(comp, best.row);
    }
  }

  const stillPending = all(
    'SELECT id, seed_name FROM competitions WHERE is_seed = 1 AND resolved = 0',
  );
  if (finalize) {
    for (const c of stillPending) {
      run('UPDATE competitions SET resolved = -1 WHERE id = ?', c.id);
      log(`comp  --  ${c.seed_name} not in catalog`);
    }
  }
  return { resolved, unresolved: stillPending.length };
}

/* -------------------------------------------------------------------------- */
/* Step 3: resolve teams, one lookup each.                                    */
/* -------------------------------------------------------------------------- */

/**
 * Points a seed team at a provider id. A fixture may already have given that id a row of its
 * own; if so, its matches and follows move onto the seed row, which keeps its id, and the
 * duplicate goes. Returns false, changing nothing, when another seed team already holds the id.
 */
function attachTeam(team, { providerId, logoUrl = null, isNational = null }) {
  return tx(() => {
    const dupe = get(
      'SELECT id, is_seed, logo_url FROM teams WHERE provider_id = ? AND id <> ?',
      providerId,
      team.id,
    );
    if (dupe?.is_seed) return false;
    if (dupe) {
      run('UPDATE matches SET home_team_id = ? WHERE home_team_id = ?', team.id, dupe.id);
      run('UPDATE matches SET away_team_id = ? WHERE away_team_id = ?', team.id, dupe.id);
      run("UPDATE OR IGNORE follows SET entity_id = ? WHERE kind = 'team' AND entity_id = ?", team.id, dupe.id);
      run("DELETE FROM follows WHERE kind = 'team' AND entity_id = ?", dupe.id);
      run('DELETE FROM teams WHERE id = ?', dupe.id);
    }
    run(
      `UPDATE teams SET provider_id = ?, name = ?, logo_url = COALESCE(?, ?, logo_url),
              is_national = COALESCE(?, is_national), resolved = 1
        WHERE id = ?`,
      providerId,
      team.seed_name,
      logoUrl,
      dupe?.logo_url ?? null,
      isNational,
      team.id,
    );
    return true;
  });
}

/**
 * Resolves seed teams against teams already known from synced fixtures. Costs nothing.
 *
 * Every fixture names both sides with the provider's ids, so once a competition's season is in,
 * its clubs are in the table under the provider's own names and need no search. On the data
 * from before the reset that covered 40 of the 46 seed teams.
 *
 * `strict` accepts only an exact name or alias, for while some seasons are still unpulled: with
 * LaLiga not in yet, "Barcelona" would otherwise settle for Ecuador's Barcelona SC from the
 * Libertadores on the core-name tier. National sides always need an exact match, because a
 * fixture row does not say whether a team is a national one.
 */
export function matchTeamsLocally({ strict = false, log = () => {} } = {}) {
  const pending = all('SELECT * FROM teams WHERE is_seed = 1 AND resolved = 0 ORDER BY id');
  if (!pending.length) return { resolved: 0 };
  let candidates = all(
    'SELECT id, provider_id, name, logo_url FROM teams WHERE is_seed = 0 AND provider_id IS NOT NULL',
  );
  let resolved = 0;

  for (const team of pending) {
    const seedDef = SEED_TEAMS.find((t) => t.name === team.seed_name) || {};
    const seed = { name: team.seed_name, aliases: seedDef.aliases };
    const best = pickBest(seed, candidates);
    if (!best || best.score < (strict || team.is_national ? 95 : 85)) continue;
    // Two rows that fit equally well is a guess, whatever the tier.
    const runnerUp = pickBest(seed, candidates, (row) => (row === best.row ? -1 : 0));
    if (runnerUp && runnerUp.score === best.score) continue;

    if (!attachTeam(team, { providerId: best.row.provider_id, logoUrl: best.row.logo_url })) continue;
    candidates = candidates.filter((c) => c !== best.row);
    resolved++;
    log(`team  ok  ${team.seed_name} -> ${best.row.name} #${best.row.provider_id} (from fixtures)`);
  }
  return { resolved };
}

export async function resolveTeams({ maxRequests = Infinity, log = () => {} } = {}) {
  const pending = all('SELECT * FROM teams WHERE is_seed = 1 AND resolved = 0 ORDER BY id');
  let spent = 0;
  let resolved = 0;

  for (const team of pending) {
    if (spent >= maxRequests) break;
    if (remaining() < 1) throw new BudgetExhaustedError();

    const seedDef = SEED_TEAMS.find((t) => t.name === team.seed_name) || {};
    // The provider's `name` filter is a contains-search, so query the shortest sensible
    // term and let pickBest sort the candidates out.
    const queries = [team.seed_name, ...(seedDef.aliases || [])].slice(0, 2);

    let match = null;
    let tried = 0;
    for (const q of queries) {
      if (spent >= maxRequests || remaining() < 1) break;
      const payload = await listTeams({ name: q, limit: 20 });
      spent++;
      tried++;
      const candidates = rowsOf(payload).map(normalizeTeam);
      match = pickBest({ name: team.seed_name, aliases: seedDef.aliases }, candidates, (row) => {
        // A country seed must map to a national side, and vice versa.
        if (team.is_national && !row.isNational) return -1;
        if (!team.is_national && row.isNational) return -1;
        return 0;
      });
      if (match) break;
    }

    if (match) {
      const attached = attachTeam(team, {
        providerId: match.row.providerId,
        logoUrl: match.row.logoUrl,
        isNational: match.row.isNational ? 1 : 0,
      });
      if (attached) {
        resolved++;
        log(`team  ok  ${team.seed_name} -> ${match.row.name} #${match.row.providerId}`);
      } else {
        run('UPDATE teams SET resolved = -1 WHERE id = ?', team.id);
        log(`team  --  ${team.seed_name} -> #${match.row.providerId}, which another seed team holds`);
      }
    } else if (tried === queries.length) {
      run('UPDATE teams SET resolved = -1 WHERE id = ?', team.id);
      log(`team  --  ${team.seed_name} not found`);
    }
    // Otherwise the request cap or the budget cut the lookups short. Marking the team missing
    // then would have been permanent, on the strength of a search that never ran, so it stays
    // pending and the next run asks the rest.
  }

  const left = get('SELECT COUNT(*) AS n FROM teams WHERE is_seed = 1 AND resolved = 0').n;
  return { spent, resolved, pending: left };
}

/* -------------------------------------------------------------------------- */
/* Orchestration                                                               */
/* -------------------------------------------------------------------------- */

export function seedComplete() {
  const pendingComps = get(
    'SELECT COUNT(*) AS n FROM competitions WHERE is_seed = 1 AND resolved = 0',
  ).n;
  const pendingTeams = get('SELECT COUNT(*) AS n FROM teams WHERE is_seed = 1 AND resolved = 0').n;
  return leagueCatalogComplete() && pendingComps === 0 && pendingTeams === 0;
}

export function seedStatus() {
  const tally = (table) => {
    const rows = all(
      `SELECT resolved, COUNT(*) AS n FROM ${table} WHERE is_seed = 1 GROUP BY resolved`,
    );
    const at = (v) => rows.find((r) => r.resolved === v)?.n ?? 0;
    return { resolved: at(1), pending: at(0), missing: at(-1) };
  };
  return {
    complete: seedComplete(),
    leagueCatalog: {
      fetched: Number(getState(LEAGUE_OFFSET_KEY, '0')),
      total: Number(getState(LEAGUE_TOTAL_KEY, '0')),
      complete: leagueCatalogComplete(),
    },
    competitions: tally('competitions'),
    teams: tally('teams'),
  };
}

/**
 * Runs as much of the seed as the budget allows. Competitions come first because the
 * fixture sync is driven by resolved competitions and cannot start without them.
 */
export async function runSeed({ maxRequests = Infinity, log = () => {} } = {}) {
  const inserted = insertSeedRows();
  if (inserted.comps || inserted.teams) {
    log(`inserted ${inserted.comps} competitions, ${inserted.teams} teams`);
  }

  let spent = 0;
  let stoppedForBudget = false;

  try {
    const leagues = await fetchLeagueCatalog({ maxRequests: maxRequests - spent, log });
    spent += leagues.spent;

    if (leagues.complete) {
      // Only against the whole catalog. A match is kept for good, and on a partial one the right
      // league may simply not be fetched yet, so the relaxed pass used to settle for the wrong
      // country: the Indian Super League came out as China's Super League.
      matchCompetitions({ finalize: true, log });
      // Anything fixtures have already named needs no search.
      matchTeamsLocally({ strict: neverSyncedCount() > 0, log });
      const teams = await resolveTeams({ maxRequests: maxRequests - spent, log });
      spent += teams.spent;
    }
  } catch (err) {
    if (!(err instanceof BudgetExhaustedError)) throw err;
    stoppedForBudget = true;
    log('budget exhausted, progress saved, re-run to continue');
  }

  return { spent, stoppedForBudget, status: seedStatus() };
}
