import { migrate } from '../db/migrate.js';
import { isMain } from '../lib/ismain.js';
import { runAuto } from './auto.js';
import { budgetStatus, remaining } from './budget.js';
import { fixtureStatus, runSync } from './fixtures.js';
import { runSeed, seedStatus } from './seed.js';

/**
 * Command line entry point for the two background jobs.
 *
 *   npm run seed                     resolve the seed list, searching for every team
 *   npm run sync                     the scheduled run: on a new install the league catalog and
 *                                    every season first, then recent scores and the rotation
 *   npm run sync -- --max=10         cap the run at ten requests
 *   npm run sync -- --season=2025    rotate a past season instead of the current one
 *   npm run sync:status              spend, seed progress and fixture counts
 *
 * Both jobs stop cleanly when the day's budget runs out and resume on the next run.
 */

function parseArgs(argv) {
  const args = { _: [] };
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? true;
    else args._.push(raw);
  }
  return args;
}

const log = (msg) => console.log(`  ${msg}`);

function printStatus() {
  const b = budgetStatus();
  const s = seedStatus();
  const f = fixtureStatus();

  console.log('\nAPI budget');
  console.log(`  ${b.spent}/${b.budget} spent today (${b.day}), ${b.remaining} left`);
  if (b.providerRemaining != null) {
    console.log(`  provider reports ${b.providerRemaining}/${b.providerLimit} remaining`);
  }

  console.log('\nSeed');
  console.log(
    `  league catalog  ${s.leagueCatalog.fetched}/${s.leagueCatalog.total}` +
      `${s.leagueCatalog.complete ? ' (complete)' : ''}`,
  );
  console.log(
    `  competitions    ${s.competitions.resolved} resolved, ` +
      `${s.competitions.pending} pending, ${s.competitions.missing} not in catalog`,
  );
  console.log(
    `  teams           ${s.teams.resolved} resolved, ` +
      `${s.teams.pending} pending, ${s.teams.missing} not found`,
  );
  console.log(`  status          ${s.complete ? 'complete' : 'incomplete'}`);

  console.log('\nFixtures');
  console.log(`  ${f.matches} matches (${f.customMatches} custom)`);
  if (f.earliest) console.log(`  range ${f.earliest} .. ${f.latest}`);
  console.log(
    `  rotation ${f.rotation.tracked} competitions, ${f.rotation.neverSynced} never synced`,
  );
  console.log(`  ${f.pendingRefreshTargets} refresh targets pending\n`);
}

async function main() {
  migrate();
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'status';
  const max = args.max ? Number(args.max) : remaining();

  if (command === 'status') {
    printStatus();
    return;
  }

  if (command === 'seed') {
    console.log(`Seeding (up to ${max} requests, ${remaining()} left today)\n`);
    const res = await runSeed({ maxRequests: max, log });
    console.log(`\nSpent ${res.spent} requests.`);
    printStatus();
    return;
  }

  if (command === 'sync') {
    console.log(`Syncing (up to ${max} requests, ${remaining()} left today)\n`);
    // A past season is the rotation on its own. Otherwise this is the scheduled run, which takes
    // a new install through the catalog and every season before anything else.
    const res = args.season
      ? await runSync({ maxRequests: max, season: Number(args.season), log })
      : await runAuto({ maxRequests: max, log });
    console.log(`\nSpent ${res.spent} requests.`);
    printStatus();
    return;
  }

  console.error(`Unknown command "${command}". Try: seed, sync, status`);
  process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`\n${err.name}: ${err.message}`);
    process.exitCode = 1;
  });
}
