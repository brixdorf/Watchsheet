import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

/*
 * The HTTP API, served on a spare port against a throwaway database. Mail goes to the
 * console and the code is echoed back, which is how these tests sign in; nothing is sent and
 * no provider is involved.
 */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchsheet-api-'));
Object.assign(process.env, {
  DATABASE_PATH: path.join(dir, 'api.db'),
  NODE_ENV: 'test',
  MAIL_PROVIDER: 'console',
  OTP_DEV_ECHO: 'true',
  OTP_IP_PER_HOUR: '0',
  SYNC_ENABLED: 'false',
});

const { migrate } = await import('../db/migrate.js');
migrate();
const { app } = await import('../index.js');
const { db, run, tx } = await import('../db/index.js');

const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

after(() => {
  server.closeAllConnections();
  server.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(pathname, { method = 'GET', body, raw, cookie } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined || raw !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + pathname, {
    method,
    headers,
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // CSV and other non-JSON bodies stay in `text`.
  }
  return { status: res.status, headers: res.headers, json, text };
}

let accounts = 0;
async function signIn() {
  const email = `tester${++accounts}@example.com`;
  const code = await call('/api/auth/request-code', { method: 'POST', body: { email } });
  assert.equal(code.status, 200);
  const res = await fetch(`${base}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code: code.json.devCode }),
  });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { user, cookie };
}

const insertMatch = ({ home = 'Home', away = 'Away', homeTeam = null, awayTeam = null, kickoff, status = 'finished' }) =>
  Number(run(
    `INSERT INTO matches (provider_id, competition_name, home_team_id, home_name, away_team_id, away_name,
                          kickoff_utc, home_score, away_score, status, season, is_custom, updated_at)
     VALUES (?, 'Test League', ?, ?, ?, ?, ?, 1, 0, ?, '26/27', 0, ?)`,
    `test-${Math.random()}`, homeTeam, home, awayTeam, away, kickoff, status, Date.now(),
  ).lastInsertRowid);

const logMatch = (userId, matchId, note = '') => run(
  `INSERT INTO watch_logs (user_id, match_id, watched, rating, note, watched_at, updated_at)
   VALUES (?, ?, 1, 0, ?, ?, ?)`,
  userId, matchId, note, Date.now(), Date.now(),
);

test('signed-out requests to private routes are refused', async () => {
  for (const p of ['/api/matches/feed', '/api/stats', '/api/export', '/api/catalog/teams']) {
    assert.equal((await call(p)).status, 401, p);
  }
});

test('a body the parser refuses keeps its own 4xx status', async () => {
  const big = await call('/api/auth/verify', { method: 'POST', raw: JSON.stringify({ email: 'x'.repeat(300_000) }) });
  assert.equal(big.status, 413);
  const broken = await call('/api/auth/verify', { method: 'POST', raw: '{"email": "a@b.co",' });
  assert.equal(broken.status, 400);
});

test('a code allows five wrong guesses, then even the right one is refused', async () => {
  const email = 'guesser@example.com';
  const issued = await call('/api/auth/request-code', { method: 'POST', body: { email } });
  const wrong = issued.json.devCode === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) {
    assert.equal((await call('/api/auth/verify', { method: 'POST', body: { email, code: wrong } })).status, 400);
  }
  assert.equal((await call('/api/auth/verify', { method: 'POST', body: { email, code: issued.json.devCode } })).status, 400);
  assert.equal((await call('/api/auth/request-code', { method: 'POST', body: { email } })).status, 429, 'resend cooldown');
});

test('search treats % and _ as the characters they are', async () => {
  const { cookie } = await signIn();
  insertMatch({ home: 'Alpha Rovers', away: 'Beta Town', kickoff: Date.now() - 86_400_000 });
  assert.equal((await call('/api/matches/search?q=alpha', { cookie })).json.matches.length, 1);
  assert.equal((await call('/api/matches/search?q=_', { cookie })).json.matches.length, 0);
  assert.equal((await call('/api/matches/search?q=%25', { cookie })).json.matches.length, 0);
});

test('search skips the "vs" typed between two sides, but keeps a date whole', async () => {
  const { cookie } = await signIn();
  const kickoff = Date.parse('2026-09-08T19:00:00Z');
  insertMatch({ home: 'Millwall', away: 'Newcastle United', kickoff });
  insertMatch({ home: 'Decoy Athletic', away: 'Other Town', kickoff: Date.parse('2026-08-09T19:00:00Z') });
  const found = async (q) => (await call(`/api/matches/search?q=${encodeURIComponent(q)}`, { cookie })).json.matches;

  for (const q of ['Millwall vs Newcastle', 'millwall v. newcastle', 'Millwall - Newcastle', 'Millwall-Newcastle']) {
    assert.ok((await found(q)).some((m) => m.home.name === 'Millwall'), q);
  }
  const byDate = await found('2026-09-08');
  assert.ok(byDate.some((m) => m.home.name === 'Millwall'));
  assert.ok(!byDate.some((m) => m.home.name === 'Decoy Athletic'), '2026-08-09 is not 2026-09-08');
});

test('the export filename survives a hostile scope', async () => {
  const { cookie } = await signIn();
  for (const scope of ['26/27"; evil=1', 'all\r\nSet-Cookie: x=1']) {
    const res = await call(`/api/export?format=CSV&scope=${encodeURIComponent(scope)}`, { cookie });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /^attachment; filename="[A-Za-z0-9-]+\.csv"$/);
  }
});

test('custom matches and history months follow the viewer clock, not the server', async () => {
  const { cookie } = await signIn();
  const add = (date, time) => call('/api/matches/custom', {
    method: 'POST', cookie, body: { home: 'Sunday XI', away: 'Park Rangers', date, time, tzOffset: -330 },
  });

  const afternoon = await add('2026-09-01', '15:00');
  assert.equal(afternoon.status, 201);
  assert.equal(afternoon.json.match.kickoff, Date.parse('2026-09-01T09:30:00Z'), '15:00 in India is 09:30 UTC');

  const pastMidnight = await add('2026-06-01', '00:30');
  assert.equal(pastMidnight.json.match.season, '26/27', 'the season follows the date typed');

  const late = await add('2026-09-01', '01:30');
  const month = async (offset) => {
    const h = await call(`/api/matches/history?season=all&tzOffset=${offset}`, { cookie });
    return h.json.groups.find((g) => g.matches.some((m) => m.id === late.json.match.id)).label;
  };
  assert.equal(await month(-330), 'Sep 2026');
  assert.equal(await month(0), 'Aug 2026');
});

test('history counts everything logged, even past the rows one screen shows', async () => {
  const { user, cookie } = await signIn();
  tx(() => {
    for (let i = 0; i < 610; i++) {
      logMatch(user.id, insertMatch({ kickoff: Date.parse('2026-07-01T12:00:00Z') + i * 3_600_000 }), i % 2 ? 'noted' : '');
    }
  });
  const h = await call('/api/matches/history?season=all', { cookie });
  assert.equal(h.json.total, 610);
  assert.equal(h.json.withNotes, 305);
  assert.equal(h.json.shown, 600);
});

test("another user's custom match cannot be read, logged or deleted", async () => {
  const owner = await signIn();
  const other = await signIn();
  const created = await call('/api/matches/custom', {
    method: 'POST', cookie: owner.cookie, body: { home: 'Secret FC', away: 'Hidden', date: '2026-08-01', time: '12:00' },
  });
  const id = created.json.match.id;
  assert.equal((await call(`/api/matches/${id}`, { cookie: other.cookie })).status, 404);
  assert.equal((await call(`/api/logs/${id}`, { method: 'PUT', cookie: other.cookie, body: { rating: 5 } })).status, 404);
  assert.equal((await call(`/api/matches/${id}`, { method: 'DELETE', cookie: other.cookie })).status, 404);
  assert.equal((await call(`/api/matches/${id}`, { cookie: owner.cookie })).status, 200);
});

test('the feed shares its competition slots out, rather than giving them all to the soonest', async () => {
  const { user, cookie } = await signIn();
  const comp = (name) => {
    const id = Number(run(
      'INSERT INTO competitions (provider_id, name, seed_name, resolved, created_at) VALUES (?, ?, ?, 1, ?)',
      `comp-${name}`, name, name, Date.now(),
    ).lastInsertRowid);
    run("INSERT INTO follows (user_id, kind, entity_id, created_at) VALUES (?, 'competition', ?, ?)", user.id, id, Date.now());
    return id;
  };
  const fixture = (competitionId, kickoff, status) => run(
    `INSERT INTO matches (provider_id, competition_id, competition_name, home_name, away_name,
                          kickoff_utc, status, season, is_custom, updated_at)
     VALUES (?, ?, 'Test', 'Home', 'Away', ?, ?, '26/27', 0, ?)`,
    `feed-${Math.random()}`, competitionId, kickoff, status, Date.now(),
  );
  const hour = 3_600_000;
  const now = Date.now();
  const [busy, later, faraway] = [comp('Busy League'), comp('Later League'), comp('Faraway Cup')];
  tx(() => {
    for (let i = 1; i <= 20; i++) {
      fixture(busy, now + i * hour, 'scheduled');
      fixture(busy, now - i * hour, 'finished');
    }
    fixture(later, now + 30 * hour, 'scheduled');
    fixture(faraway, now + 30 * 24 * hour, 'scheduled');
    fixture(faraway, now - 10 * 24 * hour, 'finished');
  });

  const { upcoming, recent } = (await call('/api/matches/feed', { cookie })).json;
  const competitions = (list) => new Set(list.map((m) => m.competition.id));
  assert.deepEqual(competitions(upcoming), new Set([busy, later, faraway]), 'a busy weekend does not crowd out the rest');
  assert.deepEqual(competitions(recent), new Set([busy, faraway]));
  assert.equal(upcoming.length, 14, 'the card is still full');
  const kickoffs = (list) => list.map((m) => m.kickoff);
  assert.deepEqual(kickoffs(upcoming), kickoffs(upcoming).toSorted((a, b) => a - b), 'shown in kick-off order');
  assert.deepEqual(kickoffs(recent), kickoffs(recent).toSorted((a, b) => b - a));
});

test('the team catalog counts each watched match once and knows who is playing soon', async () => {
  const { user, cookie } = await signIn();
  const team = (name) => Number(run(
    'INSERT INTO teams (provider_id, name, short, resolved, created_at) VALUES (?, ?, ?, 1, ?)',
    `team-${name}`, name, name.slice(0, 3).toUpperCase(), Date.now(),
  ).lastInsertRowid);
  const [a, b, c] = [team('Aardvarks'), team('Badgers'), team('Coyotes')];
  logMatch(user.id, insertMatch({ homeTeam: a, awayTeam: b, kickoff: Date.now() - 20 * 86_400_000 }));
  logMatch(user.id, insertMatch({ homeTeam: c, awayTeam: a, kickoff: Date.now() + 3 * 86_400_000, status: 'scheduled' }));

  const { teams } = (await call('/api/catalog/teams', { cookie })).json;
  const byId = Object.fromEntries(teams.map((t) => [t.id, t]));
  assert.deepEqual([byId[a].watched, byId[a].playing], [2, true]);
  assert.deepEqual([byId[b].watched, byId[b].playing], [1, false]);
  assert.deepEqual([byId[c].watched, byId[c].playing], [1, true]);
});
