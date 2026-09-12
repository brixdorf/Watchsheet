import assert from 'node:assert/strict';
import { test } from 'node:test';
import { viewerOffset } from '../lib/tz.js';
import { normalizeMatch, parseScore, parseStatus } from '../sync/normalize.js';

/*
 * Provider parsing. The status descriptions below are the ones Highlightly actually returned
 * across a full refresh and rotation pass, not guesses at what it might send.
 */

test('scores parse from the provider string, and anything else is no score', () => {
  assert.deepEqual(parseScore('2 - 4'), [2, 4]);
  assert.deepEqual(parseScore('0-0'), [0, 0]);
  assert.deepEqual(parseScore(' 10 - 1 '), [10, 1]);
  assert.deepEqual(parseScore(null), [null, null]);
  assert.deepEqual(parseScore('2 - '), [null, null]);
  assert.deepEqual(parseScore('postponed'), [null, null]);
});

test('every status the provider returns maps to one the UI knows', () => {
  const cases = [
    ['Finished', 90, 'finished'],
    ['Finished after penalties', 120, 'finished'],
    ['Finished after extra time', 120, 'finished'],
    ['Not started', null, 'scheduled'],
    ['Half time', 45, 'live'],
    ['Second half', 67, 'live'],
    ['Postponed', null, 'postponed'],
    ['Cancelled', null, 'cancelled'],
    ['Abandoned', 55, 'cancelled'],
  ];
  for (const [description, clock, expected] of cases) {
    assert.equal(parseStatus({ description, clock }), expected, description);
  }
  assert.equal(parseStatus({ clock: 12 }), 'live', 'no description but a running clock');
  assert.equal(parseStatus({}), 'scheduled', 'nothing at all');
});

test('a provider match becomes a row, or null when it cannot be one', () => {
  const row = {
    id: 1269958296,
    date: '2026-09-01T19:00:00.000Z',
    round: 'Regular Season - 23',
    league: { id: 33973, name: 'Premier League', logo: 'l.png' },
    homeTeam: { id: 36526, name: 'Arsenal', logo: 'a.png' },
    awayTeam: { id: 1, name: 'Chelsea', logo: null },
    state: { clock: 90, score: { current: '3 - 1', penalties: null }, description: 'Finished' },
  };
  const m = normalizeMatch(row);
  assert.equal(m.providerId, '1269958296');
  assert.equal(m.homeProviderId, '36526');
  assert.equal(m.kickoffUtc, Date.parse('2026-09-01T19:00:00Z'));
  assert.deepEqual([m.homeScore, m.awayScore, m.status], [3, 1, 'finished']);
  assert.equal(m.season, '26/27');
  assert.equal(m.round, 'Regular Season - 23');

  assert.equal(normalizeMatch({ ...row, date: 'soon' }), null);
  assert.equal(normalizeMatch({ ...row, awayTeam: { id: 2 } }), null);
});

test('a viewer offset is used only when a real clock could have sent it', () => {
  const server = new Date().getTimezoneOffset();
  assert.equal(viewerOffset('-330'), -330);
  assert.equal(viewerOffset('720'), 720);
  assert.equal(viewerOffset('-840'), -840);
  assert.equal(viewerOffset('0'), 0);
  assert.equal(viewerOffset('-841'), server);
  assert.equal(viewerOffset('1e308'), server);
  assert.equal(viewerOffset('abc'), server);
  assert.equal(viewerOffset(''), server);
  assert.equal(viewerOffset(undefined), server);
});
