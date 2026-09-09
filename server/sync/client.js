import { config } from '../config.js';
import { BudgetExhaustedError, recordHeaders, reserve } from './budget.js';

/**
 * The only place in the codebase that talks to Highlightly.
 *
 * Nothing under routes/ may import this. User-facing reads are served from SQLite, so a
 * request spike can never translate into provider traffic and blow the 100/day free tier.
 */

export class ProviderError extends Error {
  constructor(status, body) {
    super(`Highlightly responded ${status}: ${String(body).slice(0, 300)}`);
    this.name = 'ProviderError';
    this.status = status;
  }
}

export class NotConfiguredError extends Error {
  constructor() {
    super('HIGHLIGHTLY_API_KEY is not set. Add it to .env before syncing.');
    this.name = 'NotConfiguredError';
  }
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One budgeted GET. Retries are deliberately limited to two and only for transient
 * statuses; each attempt is charged, because each attempt reaches the provider.
 */
export async function request(pathname, params = {}, { retries = 2 } = {}) {
  if (!config.highlightly.apiKey) throw new NotConfiguredError();

  const url = new URL(config.highlightly.baseUrl + pathname);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    reserve(1);
    let res;
    try {
      res = await fetch(url, {
        headers: {
          'x-rapidapi-key': config.highlightly.apiKey,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      lastErr = err;
      if (attempt === retries) throw err;
      await sleep(800 * (attempt + 1));
      continue;
    }

    recordHeaders(res.headers);

    if (res.ok) return res.json();

    const body = await res.text().catch(() => '');
    lastErr = new ProviderError(res.status, body);

    // A provider-side 429 means our own ledger is behind reality. Stop the run rather
    // than burning the remaining allowance discovering the same thing again.
    if (res.status === 429) throw new BudgetExhaustedError('Provider returned 429, so the quota is reached');
    if (!RETRY_STATUSES.has(res.status) || attempt === retries) throw lastErr;
    await sleep(800 * (attempt + 1));
  }
  throw lastErr;
}

export const listLeagues = (params) => request('/leagues', params);
export const listTeams = (params) => request('/teams', params);
export const listMatches = (params) => request('/matches', params);

/** Provider responses wrap results in `data` but occasionally return a bare array. */
export function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

export function totalOf(payload, fallback = 0) {
  const p = payload && payload.pagination;
  if (p && Number.isFinite(p.totalCount)) return p.totalCount;
  return fallback;
}
