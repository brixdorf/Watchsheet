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
let paths = [];
const provider = http.createServer((req, res) => {
  hits++;
  paths.push(req.url);
  const step = script.shift() ?? { status: 200, json: { data: [], pagination: { totalCount: 0 } } };
  const headers = { 'content-type': 'application/json' };
  // A refused key comes back without the rate-limit headers, so a step can leave them off.
  if (step.rateLimit !== false) {
    headers['x-ratelimit-requests-limit'] = '100';
    headers['x-ratelimit-requests-remaining'] = String(step.remaining ?? 90);
  }
  res.writeHead(step.status, headers);
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
const { insertSeedRows, matchTeamsLocally, resolveTeams } = await import('../sync/seed.js');
const { firstSyncPending, runAuto } = await import('../sync/auto.js');
const { SEED_TEAMS } = await import('../db/seedData.js');
const { tick } = await import('../sync/cron.js');

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
  paths = [];
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

test('a rejected key stops at once and is not charged', async () => {
  script = [{ status: 401, rateLimit: false, json: { message: 'Invalid request token.' } }];
  await assert.rejects(request('/leagues'), { name: 'AuthError' });
  assert.equal(hits, 1, 'not retried');
  assert.equal(budget.usageFor().requests, 0, 'the provider did not count it, so neither do we');
});

test("a new API key starts the day afresh, since the old key's count is not its count", () => {
  budget.rebaseLedgerForKey('test-key');
  run(
    'INSERT INTO api_usage (day, requests, remaining_reported, limit_reported, updated_at) VALUES (?, 40, 0, 100, 0)',
    budget.dayKey(),
  );
  budget.rebaseLedgerForKey('test-key');
  assert.equal(budget.remaining(), 0, 'the same key keeps its count');

  budget.rebaseLedgerForKey('a-new-key');
  assert.equal(budget.remaining(), 50, 'the whole configured budget is back');
  budget.rebaseLedgerForKey('test-key');
});

/**
 * A new install: empty tables, as a first boot or a deleted database leaves them. No seed rows
 * either, since inserting them here is what hid a first sync that never inserted them itself.
 */
function freshInstall() {
  for (const table of ['matches', 'follows', 'teams', 'competitions', 'provider_leagues', 'sync_state']) {
    run(`DELETE FROM ${table}`);
  }
  run("INSERT OR IGNORE INTO users (id, email, name, created_at) VALUES (1, 'fan@example.com', 'Fan', 0)");
}

const league = (id, name, code, country) => ({
  id, name, country: { code, name: country }, seasons: [{ season: 2026 }],
});
const fixture = (id, [homeId, homeName], [awayId, awayName]) => ({
  id,
  date: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  homeTeam: { id: homeId, name: homeName },
  awayTeam: { id: awayId, name: awayName },
  state: { description: 'Finished', score: { current: '2 - 1' } },
});
const addTeam = (providerId, name) => Number(run(
  'INSERT INTO teams (provider_id, name, is_seed, resolved, created_at) VALUES (?, ?, 0, 1, 0)',
  providerId, name,
).lastInsertRowid);
const seedTeam = (name) => get('SELECT id, provider_id, resolved FROM teams WHERE seed_name = ?', name);

test('a first run on an empty database reaches fixtures, followed competitions first, teams unsearched', async () => {
  freshInstall();
  assert.equal(firstSyncPending(), true);

  // A run cut off right after the catalog, like a small manual run, then a follow in between.
  script = [
    { status: 200, json: { data: [league('pl', 'Premier League', 'GB', 'England'), league('ll', 'LaLiga', 'ES', 'Spain')], pagination: { totalCount: 2 } } },
  ];
  const first = await runAuto({ maxRequests: 1 });
  assert.equal(first.job, 'catalog');
  const laliga = get("SELECT id, resolved FROM competitions WHERE seed_name = 'LaLiga'");
  assert.equal(laliga?.resolved, 1, 'the run creates the seed rows and matches them');
  run("INSERT INTO follows (user_id, kind, entity_id, created_at) VALUES (1, 'competition', ?, 0)", laliga.id);

  script = [
    { status: 200, json: { data: [fixture('m1', ['t-bar', 'Barcelona'], ['t-rma', 'Real Madrid'])], pagination: { totalCount: 1 } } },
    { status: 200, json: { data: [fixture('m2', ['t-ars', 'Arsenal'], ['t-tot', 'Tottenham'])], pagination: { totalCount: 1 } } },
  ];
  const result = await runAuto({ maxRequests: 10 });

  assert.equal(result.job, 'fixtures');
  assert.equal(hits, 3, 'one catalog page and one page per season, nothing else');
  assert.ok(paths[0].startsWith('/leagues'));
  assert.match(paths[1], /leagueId=ll/, 'the followed competition is pulled before the more popular one');
  assert.match(paths[2], /leagueId=pl/);
  assert.ok(!paths.some((p) => p.startsWith('/teams')), 'no team was searched for');

  const barcelona = seedTeam('Barcelona');
  assert.deepEqual([barcelona.provider_id, barcelona.resolved], ['t-bar', 1]);
  assert.equal(seedTeam('Tottenham Hotspur').provider_id, 't-tot', 'through its alias');
  assert.equal(get("SELECT home_team_id FROM matches WHERE provider_id = 'm1'").home_team_id, barcelona.id);
  assert.equal(get("SELECT COUNT(*) AS n FROM teams WHERE provider_id = 't-bar'").n, 1, 'no duplicate row left');
});

test('a catalog with no seed rows beside it still counts as a new install, and a run repairs it', async () => {
  freshInstall();
  run("INSERT INTO sync_state (key, value) VALUES ('seed.leagues.total', '1'), ('seed.leagues.offset', '1')");
  run(
    `INSERT INTO provider_leagues (provider_id, name, country_code, country_name, seasons_json, fetched_at)
     VALUES ('pl', 'Premier League', 'GB', 'England', '[2026]', 0)`,
  );
  assert.equal(firstSyncPending(), true, 'so the server starts a first sync on boot');

  script = [{ status: 200, json: { data: [], pagination: { totalCount: 0 } } }];
  await runAuto({ maxRequests: 1 });
  assert.equal(get("SELECT resolved FROM competitions WHERE seed_name = 'Premier League'").resolved, 1);
  assert.ok(!paths.some((p) => p.startsWith('/leagues')), 'the catalog it already had is not fetched again');
});

test('while seasons are still unpulled, a team resolves from fixtures only on an exact name', () => {
  freshInstall();
  insertSeedRows();
  addTeam('t-bsc', 'Barcelona SC');
  matchTeamsLocally({ strict: true });
  assert.equal(seedTeam('Barcelona').resolved, 0, "Ecuador's Barcelona SC is not taken for the seed");

  const fcb = addTeam('t-fcb', 'Barcelona');
  run("INSERT INTO follows (user_id, kind, entity_id, created_at) VALUES (1, 'team', ?, 0)", fcb);
  matchTeamsLocally({ strict: true });
  const barcelona = seedTeam('Barcelona');
  assert.equal(barcelona.provider_id, 't-fcb');
  assert.equal(
    get("SELECT entity_id FROM follows WHERE user_id = 1 AND kind = 'team'").entity_id,
    barcelona.id,
    'a follow on the fixture row moves to the seed row',
  );
});

test('a searched team whose id a fixture already gave a row takes that row over', async () => {
  freshInstall();
  insertSeedRows();
  const india = addTeam('t-ind', 'India');
  run(
    `INSERT INTO matches (provider_id, competition_name, home_team_id, home_name, away_name,
                          kickoff_utc, status, season, is_custom, updated_at)
     VALUES ('m-ind', 'Friendly', ?, 'India', 'Nepal', ?, 'finished', '26/27', 0, 0)`,
    india, Date.now(),
  );
  run("UPDATE teams SET resolved = 1 WHERE is_seed = 1 AND seed_name <> 'India'");
  script = [{ status: 200, json: { data: [{ id: 't-ind', name: 'India', type: 'national' }] } }];

  await resolveTeams({ maxRequests: 2 });

  const seed = seedTeam('India');
  assert.deepEqual([seed.provider_id, seed.resolved], ['t-ind', 1]);
  assert.equal(get("SELECT home_team_id FROM matches WHERE provider_id = 'm-ind'").home_team_id, seed.id);
  assert.equal(get("SELECT COUNT(*) AS n FROM teams WHERE provider_id = 't-ind'").n, 1);
});

// Last, because a rejected key pauses the schedule for the rest of the process.
test('a tick that meets a rejected key reports it and stops asking', async () => {
  run('DELETE FROM sync_state');
  run('DELETE FROM provider_leagues');
  script = [{ status: 401, rateLimit: false }];
  const first = await tick({ slice: 3, job: 'seed' });
  assert.equal(first.job, 'error');
  assert.match(first.error, /rejected HIGHLIGHTLY_API_KEY/);
  assert.equal(first.spent, 0);
  assert.equal(hits, 1);

  const second = await tick({ slice: 3, job: 'seed' });
  assert.ok(second.skipped, 'the next tick does not call the provider again');
  assert.equal(hits, 1);
});
