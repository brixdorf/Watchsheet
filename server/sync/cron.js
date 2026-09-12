import cron from 'node-cron';
import { config } from '../config.js';
import { remaining } from './budget.js';
import { runSync } from './fixtures.js';
import { runSeed, seedStatus } from './seed.js';

/**
 * Hourly background sync.
 *
 * Each tick spends at most SYNC_SLICE requests, so the schedule cannot outrun the daily
 * budget however often it fires, and the budget guard is the hard stop regardless. The
 * seed takes priority while it is incomplete, because the fixture rotation is driven by
 * resolved competitions and has nothing to work with until seeding finishes.
 */

/** The cron fires at five past every hour. */
const TICKS_PER_DAY = 24;

let last = null;
let running = false;
let scheduled = false;

export const lastRun = () => last;

export async function tick({ slice = config.sync.slice, job = 'auto' } = {}) {
  if (running) return { skipped: 'already running' };
  if (!config.highlightly.apiKey) return { skipped: 'no API key' };

  const budget = Math.min(slice, remaining());
  if (budget < 1) return { skipped: 'no budget left today' };

  running = true;
  const startedAt = Date.now();
  try {
    // 'auto' is what the schedule uses: finish seeding first, because the rotation has
    // no competitions to work through until it does.
    const seeding = job === 'seed' || (job === 'auto' && !seedStatus().complete);
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

export const isRunning = () => running;

/** When the next scheduled tick fires: five past the coming hour, or null if disabled. */
export function nextRun() {
  if (!scheduled) return null;
  const next = new Date();
  next.setMinutes(5, 0, 0);
  if (next.getTime() <= Date.now()) next.setTime(next.getTime() + 3600000);
  return next.getTime();
}

export function startCron() {
  if (!config.sync.enabled) {
    console.log('Sync cron disabled (SYNC_ENABLED=false).');
    return null;
  }
  if (!config.highlightly.apiKey) {
    console.log('Sync cron idle: HIGHLIGHTLY_API_KEY is not set.');
    return null;
  }

  // Five past the hour, so a restart on the hour does not collide with the first tick.
  scheduled = true;
  const task = cron.schedule('5 * * * *', () => {
    tick().then((r) => {
      if (r && !r.skipped) console.log(`Sync tick (${r.job}): ${r.spent ?? 0} requests`);
    });
  });
  // The tick size and the daily budget come from separate env vars and nothing compared
  // them, which is how the schedule came to ask for 144 requests a day against an allowance
  // of 85. It never overspent, because the budget guard is the hard stop, but the day ran
  // out around lunchtime and evening kick-offs went unrefreshed. Cheaper to notice here.
  const daily = TICKS_PER_DAY * config.sync.slice;
  if (daily > config.highlightly.dailyBudget) {
    console.warn(
      `Sync would ask for ${daily} requests a day (${TICKS_PER_DAY} ticks x ${config.sync.slice}) `
        + `against a budget of ${config.highlightly.dailyBudget}. The guard will cut the day short; `
        + `lower SYNC_SLICE to ${Math.floor(config.highlightly.dailyBudget / TICKS_PER_DAY)} or less.`,
    );
  }
  console.log(
    `Sync cron scheduled hourly, ${config.sync.slice} requests per tick, up to ${daily} a day.`,
  );
  return task;
}
