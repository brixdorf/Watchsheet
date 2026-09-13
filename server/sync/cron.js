import cron from 'node-cron';
import { config } from '../config.js';
import { remaining, usageFor } from './budget.js';
import { AuthError } from './client.js';
import { runSync } from './fixtures.js';
import { runAuto } from './auto.js';
import { runSeed } from './seed.js';

/**
 * Hourly background sync.
 *
 * Each tick spends at most SYNC_SLICE requests, so the schedule cannot outrun the daily
 * budget however often it fires, and the budget guard is the hard stop regardless. What a
 * tick does on a new install, and in what order, is set out in auto.js.
 */

/** Five past every hour, so a restart on the hour does not collide with the first tick. */
const SCHEDULE = '5 * * * *';
const TICKS_PER_DAY = 24;

let last = null;
let running = false;
let task = null;
// Set once Highlightly refuses the key. The key is only read at startup, so nothing changes
// until a restart, and asking again every hour would only repeat the same error in the log.
let keyRejected = null;

export const lastRun = () => last;
export const keyRejection = () => keyRejected;

export async function tick({ slice = config.sync.slice, job = 'auto' } = {}) {
  if (running) return { skipped: 'already running' };
  if (!config.highlightly.apiKey) return { skipped: 'no API key' };
  if (keyRejected) return { skipped: 'the API key was rejected, so sync is paused until a restart' };

  const budget = Math.min(slice, remaining());
  if (budget < 1) return { skipped: 'no budget left today' };

  running = true;
  const startedAt = Date.now();
  const spentBefore = usageFor().requests;
  try {
    // 'auto' is what the schedule and the admin button use; auto.js decides what it covers.
    const result =
      job === 'seed'
        ? await runSeed({ maxRequests: budget })
        : job === 'sync'
          ? await runSync({ maxRequests: budget })
          : await runAuto({ maxRequests: budget });

    last = {
      at: startedAt,
      job: result.job ?? job,
      spent: result.spent,
      stoppedForBudget: result.stoppedForBudget,
    };
    return last;
  } catch (err) {
    // What the ledger moved by, since a failed job never gets to report its own count.
    const spent = Math.max(0, usageFor().requests - spentBefore);
    last = { at: startedAt, job: 'error', spent, error: err.message };
    if (err instanceof AuthError) {
      keyRejected = err.message;
      console.error(`Sync paused: ${err.message}`);
    } else {
      console.error('Sync tick failed:', err.message);
    }
    return last;
  } finally {
    running = false;
  }
}

export const isRunning = () => running;

/**
 * When the next scheduled tick fires, or null if nothing is scheduled. Asked of the scheduler
 * rather than worked out again here, so it cannot drift from SCHEDULE.
 */
export function nextRun() {
  return task?.getNextRun()?.getTime() ?? null;
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

  task = cron.schedule(SCHEDULE, () => {
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
