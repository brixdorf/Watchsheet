import cron from 'node-cron';
import { config } from '../config.js';
import { remaining } from './budget.js';
import { runSync } from './fixtures.js';
import { runSeed, seedStatus } from './seed.js';

/**
 * Hourly background sync.
 *
 * Each tick spends at most SYNC_SLICE requests, so the schedule cannot outrun the daily
 * budget however often it fires — and the budget guard is the hard stop regardless. The
 * seed takes priority while it is incomplete, because the fixture rotation is driven by
 * resolved competitions and has nothing to work with until seeding finishes.
 */

let last = null;
let running = false;

export const lastRun = () => last;

export async function tick({ slice = config.sync.slice } = {}) {
  if (running) return { skipped: 'already running' };
  if (!config.highlightly.apiKey) return { skipped: 'no API key' };

  const budget = Math.min(slice, remaining());
  if (budget < 1) return { skipped: 'no budget left today' };

  running = true;
  const startedAt = Date.now();
  try {
    const seeding = !seedStatus().complete;
    const result = seeding
      ? await runSeed({ maxRequests: budget })
      : await runSync({ maxRequests: budget });

    last = {
      at: startedAt,
      job: seeding ? 'seed' : 'sync',
      spent: result.spent,
      stoppedForBudget: result.stoppedForBudget,
    };
    return last;
  } catch (err) {
    last = { at: startedAt, job: 'error', error: err.message };
    console.error('Sync tick failed:', err.message);
    return last;
  } finally {
    running = false;
  }
}

export function startCron() {
  if (!config.sync.enabled) {
    console.log('Sync cron disabled (SYNC_ENABLED=false).');
    return null;
  }
  if (!config.highlightly.apiKey) {
    console.log('Sync cron idle — HIGHLIGHTLY_API_KEY is not set.');
    return null;
  }

  // Five past the hour, so a restart on the hour does not collide with the first tick.
  const task = cron.schedule('5 * * * *', () => {
    tick().then((r) => {
      if (r && !r.skipped) console.log(`Sync tick (${r.job}): ${r.spent ?? 0} requests`);
    });
  });
  console.log(`Sync cron scheduled hourly, ${config.sync.slice} requests per tick.`);
  return task;
}
