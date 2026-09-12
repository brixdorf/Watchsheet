import express from 'express';
import { all } from '../db/index.js';
import { requireAuth } from '../lib/session.js';
import { toViewerClock, viewerOffset } from '../lib/tz.js';

export const exportRouter = express.Router();
exportRouter.use(requireAuth);

/**
 * Export the watched history as JSON or CSV.
 *
 * Column set matches the design's download(): season, date, kickoff, timezone,
 * competition, home, away, score, rating, note. Times are rendered in the viewer's
 * timezone, which is passed in rather than assumed from the server's clock.
 */

const COLUMNS = [
  'season',
  'date',
  'kickoff',
  'timezone',
  'competition',
  'home',
  'away',
  'score',
  'rating',
  'note',
];

const pad = (n) => String(n).padStart(2, '0');

/** RFC 4180: wrap every field, double any embedded quote. */
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function rowsFor(userId, scope) {
  const season = scope && scope !== 'all' ? scope : null;
  return all(
    `SELECT m.kickoff_utc, m.home_score, m.away_score, m.season, m.is_custom,
            COALESCE(ht.seed_name, ht.name, m.home_name) AS home,
            COALESCE(at.seed_name, at.name, m.away_name) AS away,
            COALESCE(c.seed_name, m.competition_name)    AS competition,
            wl.rating, wl.note
       FROM watch_logs wl
       JOIN matches m ON m.id = wl.match_id
       LEFT JOIN teams ht       ON ht.id = m.home_team_id
       LEFT JOIN teams at       ON at.id = m.away_team_id
       LEFT JOIN competitions c ON c.id  = m.competition_id
      WHERE wl.user_id = ? AND wl.watched = 1
        AND (m.is_custom = 0 OR m.owner_user_id = ?)
        ${season ? 'AND m.season = ?' : ''}
      ORDER BY m.kickoff_utc DESC`,
    ...(season ? [userId, userId, season] : [userId, userId]),
  );
}

function toRecords(rows, { tzOffsetMin, tzName }) {
  return rows.map((r) => {
    const d = toViewerClock(r.kickoff_utc, tzOffsetMin);
    const hours = d.getUTCHours();
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return {
      season: r.season,
      date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      kickoff: `${hour12}:${pad(d.getUTCMinutes())} ${suffix}`,
      timezone: tzName,
      competition: r.competition,
      home: r.home,
      away: r.away,
      score: r.home_score == null ? '' : `${r.home_score}-${r.away_score}`,
      rating: r.rating || '',
      note: r.note || '',
    };
  });
}

/** Row count for the download button, without building the file. */
exportRouter.get('/count', (req, res) => {
  res.json({ count: rowsFor(req.user.id, req.query.scope).length });
});

exportRouter.get('/', (req, res) => {
  const scope = req.query.scope ? String(req.query.scope) : 'all';
  const format = String(req.query.format ?? 'CSV').toUpperCase() === 'JSON' ? 'JSON' : 'CSV';
  const tzOffsetMin = viewerOffset(req.query.tzOffset);
  const tzName = String(req.query.tz ?? '').slice(0, 40);

  const records = toRecords(rowsFor(req.user.id, scope), { tzOffsetMin, tzName });
  // The scope comes straight off the query string and lands in a header, so it is reduced to
  // letters, digits and dashes: a quote broke the filename, and CR/LF made Node refuse the
  // header outright and the download answered 500.
  const slug = scope === 'all' ? 'all-time' : scope.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const stem = `watchsheet-${slug || 'export'}`;

  if (format === 'JSON') {
    const body = JSON.stringify(
      {
        app: 'Watchsheet',
        exported: new Date().toISOString(),
        scope,
        count: records.length,
        matches: records,
      },
      null,
      2,
    );
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${stem}.json"`);
    return res.send(body);
  }

  const body = [COLUMNS.join(',')]
    .concat(records.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(',')))
    .join('\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${stem}.csv"`);
  res.send(body);
});
