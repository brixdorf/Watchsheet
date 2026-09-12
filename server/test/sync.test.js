import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, test } from 'node:test';

/*
 * The sync jobs against a local stand-in for Highlightly and a throwaway database.
 *
 * The environment is set before anything reads the config. Node's .env loader never
 * overrides a variable that is already set, so the real key in .env cannot be used here and
 * nothing leaves the machine.
 */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchsheet-sync-'));

let script = [];
let hits = 0;
const provider = http.createServer((req, res) => {
  hits++;
  const step = script.shift() ?? { status: 200, json: { data: [], pagination: { totalCount: 0 } } };
  res.writeHead(step.status, {
    'content-type': 'application/json',
    'x-ratelimit-requests-limit': '100',
    'x-ratelimit-requests-remaining': String(step.remaining ?? 90),
  });
  res.end(JSON.stringify(step.json ?? { message: 'error' }));
});
await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));

Object.assign(process.env, {
  DATABASE_PATH: path.join(dir, 'sync.db'),
  HIGHLIGHTLY_API_KEY: 'test-key',
  HIGHLIGHTLY_BASE_URL: `http://127.0.0.1:${provider.address().port}`,
  HIGHLIGHTLY_DAILY_BUDGET: '50',
  SYNC_ENABLED: 'false',
  MAIL_PROVIDER: 'console',
});

const { migrate } = await import('../db/migrate.js');
migrate();
const { db, get, run } = await import('../db/index.js');
const { request } = await import('../sync/client.js');
const budget = await import('../sync/budget.js');
const { staleRefreshTargets } = await import('../sync/fixtures.js');
const { insertSeedRows, resolveTeams } = await import('../sync/seed.js');
const { SEED_TEAMS } = await import('../db/seedData.js');

after(() => {
  provider.closeAllConnections();
  provider.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  run('DELETE FROM api_usage');
  script = [];
  hits = 0;
});

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

test('transient provider errors are retried, and every attempt is charged', async () => {
  script = [{ status: 500 }, { status: 502 }, { status: 200, json: { data: [{ id: 1 }] } }];
  const payload = await request('/matches', { leagueId: 1 });
  assert.equal(payload.data.length, 1);
  assert.equal(hits, 3);
  assert.equal(budget.usageFor().requests, 3);
});

test('a provider 429 stops at once and closes the guard for the day', async () => {
  script = [{ status: 429, remaining: 0 }];
  await assert.rejects(request('/matches', { leagueId: 1 }), { name: 'BudgetExhaustedError' });
  assert.equal(hits, 1);
  assert.equal(budget.remaining(), 0);
});

test('refresh leaves alone matches that have not kicked off and postponed ones', () => {
  const comp = Number(run(
    `INSERT INTO competitions (provider_id, name, seed_name, resolved, created_at)
     VALUES ('9001', 'Test League', 'Test League', 1, ?)`,
    Date.now(),
  ).lastInsertRowid);
  const now = Date.now();
  const add = (providerId, kickoff, status) => run(
    `INSERT INTO matches (provider_id, competition_id, competition_name, home_name, away_name,
                          kickoff_utc, status, season, is_custom, updated_at)
     VALUES (?, ?, 'Test League', 'Home', 'Away', ?, ?, '26/27', 0, 0)`,
    providerId, comp, kickoff, status,
  );
  add('refresh-live', now - 3_600_000, 'live');
  add('refresh-later-today', now + 30 * 3_600_000, 'scheduled');
  add('refresh-postponed', now - 20 * 86_400_000, 'postponed');

  const targets = staleRefreshTargets({ now });
  assert.ok(targets.some((t) => t.day === isoDay(now - 3_600_000)), 'the match in progress is refreshed');
  assert.ok(targets.every((t) => t.latestKickoff <= now), 'nothing that has not started');
  assert.ok(!targets.some((t) => t.day === isoDay(now + 30 * 3_600_000)), 'no future day');
  assert.ok(!targets.some((t) => t.day === isoDay(now - 20 * 86_400_000)), 'no postponed-only day');
});

test('a seed team is only marked missing once both of its lookups have run', async () => {
  insertSeedRows();
  const seed = SEED_TEAMS.find((t) => t.aliases?.length);
  run('UPDATE teams SET resolved = 1 WHERE is_seed = 1');
  run('UPDATE teams SET resolved = 0, provider_id = NULL WHERE seed_name = ?', seed.name);
  const state = () => get('SELECT resolved FROM teams WHERE seed_name = ?', seed.name).resolved;

  await resolveTeams({ maxRequests: 1 });
  assert.equal(hits, 1);
  assert.equal(state(), 0, 'the alias was never searched, so it stays pending');

  await resolveTeams({ maxRequests: 5 });
  assert.equal(hits, 3);
  assert.equal(state(), -1, 'both searches missed');
});
