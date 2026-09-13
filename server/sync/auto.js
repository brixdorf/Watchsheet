import { get } from '../db/index.js';
import { BudgetExhaustedError } from './budget.js';
import { neverSyncedCount, runSync } from './fixtures.js';
import {
  fetchLeagueCatalog,
  insertSeedRows,
  leagueCatalogComplete,
  matchCompetitions,
  matchTeamsLocally,
  resolveTeams,
} from './seed.js';

/**
 * The run the hourly schedule, the admin button and `npm run sync` all make.
 *
 * A new install needs the league catalog, every competition's fixtures and the seed teams, and
 * the order decides how soon anything can be marked watched:
 *
 *   1. The league catalog, about ten requests, which the competitions are matched against.
 *   2. Each competition's season once, followed and popular ones first. About sixty requests,
 *      so it fits inside the first day's budget.
 *   3. The seed teams. Fixtures name both sides with the provider's ids, so most resolve for
 *      nothing along the way, and only the ones no fixture mentions cost a search.
 *
 * The seed used to do 1 and 3 before a single fixture was fetched. The team searches were most
 * of its cost, so a new install could spend its first day's budget on them and show nothing to
 * mark. Once all three are done this is the ordinary sync.
 */

const pendingCompetitions = () =>
  get('SELECT COUNT(*) AS n FROM competitions WHERE is_seed = 1 AND resolved = 0').n;
const pendingTeams = () =>
  get('SELECT COUNT(*) AS n FROM teams WHERE is_seed = 1 AND resolved = 0').n;

/**
 * True until a new install has its catalog, every season once, and its seed teams settled.
 * Costs nothing to ask. A database with no seed rows at all counts as new, whatever else it
 * holds, since that is exactly what a deleted or first-boot database looks like.
 */
export function firstSyncPending() {
  return (
    !get('SELECT 1 AS x FROM competitions WHERE is_seed = 1 LIMIT 1')
    || !leagueCatalogComplete()
    || pendingCompetitions() > 0
    || neverSyncedCount() > 0
    || pendingTeams() > 0
  );
}

export async function runAuto({ maxRequests = Infinity, log = () => {} } = {}) {
  const phases = [];
  let spent = 0;
  let stoppedForBudget = false;
  const left = () => maxRequests - spent;

  // Free and idempotent. A new or deleted database has no seed rows, and without them the
  // catalog has nothing to be matched against: the run fetched every league and resolved none.
  const inserted = insertSeedRows();
  if (inserted.comps || inserted.teams) {
    log(`inserted ${inserted.comps} competitions, ${inserted.teams} teams`);
  }

  try {
    if (!leagueCatalogComplete()) {
      const catalog = await fetchLeagueCatalog({ maxRequests, log });
      spent += catalog.spent;
      phases.push('catalog');
    }

    if (leagueCatalogComplete()) {
      // Whenever anything is unmatched, not only in the run that finished the catalog, so a
      // run that stopped between the two picks the matching up next time.
      if (pendingCompetitions() > 0) matchCompetitions({ finalize: true, log });

      // A team is only searched for once every season is in, since until then the next page
      // may well name it for free.
      if (left() > 0 && neverSyncedCount() === 0 && pendingTeams() > 0) {
        matchTeamsLocally({ log });
        if (pendingTeams() > 0) {
          const teams = await resolveTeams({ maxRequests: left(), log });
          spent += teams.spent;
          if (teams.spent) phases.push('teams');
        }
      }

      if (left() > 0) {
        const sync = await runSync({ maxRequests: left(), log });
        spent += sync.spent;
        stoppedForBudget = sync.stoppedForBudget;
        phases.push('fixtures');
        matchTeamsLocally({ strict: neverSyncedCount() > 0, log });
      }
    }
  } catch (err) {
    if (!(err instanceof BudgetExhaustedError)) throw err;
    stoppedForBudget = true;
    log('budget exhausted, progress saved, re-run to continue');
  }

  return { spent, stoppedForBudget, job: phases.join(' + ') || 'sync' };
}
