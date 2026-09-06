import { get, run } from '../db/index.js';
import { config } from '../config.js';

/**
 * Thrown when the day's request allowance is gone. Callers treat this as a normal stopping
 * condition: persist whatever progress was made and return cleanly.
 */
export class BudgetExhaustedError extends Error {
  constructor(message = 'Daily Highlightly request budget is exhausted') {
    super(message);
    this.name = 'BudgetExhaustedError';
  }
}

/** The provider's quota resets on UTC day boundaries, so the ledger is keyed that way too. */
export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function usageFor(day = dayKey()) {
  return (
    get('SELECT * FROM api_usage WHERE day = ?', day) || {
      day,
      requests: 0,
      remaining_reported: null,
      limit_reported: null,
      updated_at: null,
    }
  );
}

/**
 * Requests still available today.
 *
 * Two numbers are in play: our own count against the configured budget, and the provider's
 * `x-ratelimit-requests-remaining`. The header is authoritative whenever it is lower — it
 * survives restarts and accounts for the key being used elsewhere — so take the minimum.
 */
export function remaining(day = dayKey()) {
  const u = usageFor(day);
  const local = config.highlightly.dailyBudget - u.requests;
  if (u.remaining_reported == null) return Math.max(0, local);
  return Math.max(0, Math.min(local, u.remaining_reported));
}

export function canSpend(n = 1, day = dayKey()) {
  return remaining(day) >= n;
}

/**
 * Counts one request before it is made. Charging up front means a request that crashes or
 * times out still costs us on paper, which is the safe direction to be wrong in.
 */
export function reserve(n = 1) {
  const day = dayKey();
  if (!canSpend(n, day)) throw new BudgetExhaustedError();
  run(
    `INSERT INTO api_usage (day, requests, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET requests = requests + ?, updated_at = excluded.updated_at`,
    day,
    n,
    Date.now(),
    n,
  );
}

/** Reconciles the ledger with whatever the provider reported on the last response. */
export function recordHeaders(headers) {
  const toInt = (v) => {
    const n = Number.parseInt(v ?? '', 10);
    return Number.isFinite(n) ? n : null;
  };
  const rem = toInt(headers.get('x-ratelimit-requests-remaining'));
  const lim = toInt(headers.get('x-ratelimit-requests-limit'));
  if (rem == null && lim == null) return;

  const day = dayKey();
  run(
    `INSERT INTO api_usage (day, requests, remaining_reported, limit_reported, updated_at)
     VALUES (?, 0, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET
       remaining_reported = COALESCE(excluded.remaining_reported, api_usage.remaining_reported),
       limit_reported     = COALESCE(excluded.limit_reported, api_usage.limit_reported),
       updated_at         = excluded.updated_at`,
    day,
    rem,
    lim,
    Date.now(),
  );
}

export function budgetStatus(day = dayKey()) {
  const u = usageFor(day);
  return {
    day,
    spent: u.requests,
    budget: config.highlightly.dailyBudget,
    remaining: remaining(day),
    providerRemaining: u.remaining_reported,
    providerLimit: u.limit_reported,
    updatedAt: u.updated_at,
  };
}
