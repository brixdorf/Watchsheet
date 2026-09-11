import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, all, run, tx } from './index.js';
import { isMain } from '../lib/ismain.js';
import { SEED_COMPETITIONS, SEED_TEAMS } from './seedData.js';
import { competitionPopularity, teamPopularity, unranked } from './popularity.js';
import { coreName } from '../lib/names.js';
import { DATA_FLOOR_MS, seasonIdFor } from '../lib/season.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Adds a column to an existing table. schema.sql is all IF NOT EXISTS, which creates tables
 * but never alters one that already exists, so a new column needs this to reach an install
 * that predates it.
 */
function ensureColumn(table, column, definition) {
  const has = all(`PRAGMA table_info(${table})`).some((c) => c.name === column);
  if (has) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

/**
 * Writes the popularity ranks onto the seed rows. Cheap, idempotent and local, so it runs on
 * every boot: editing the order in popularity.js is then the only step needed to change how
 * the catalog sorts.
 */
function applyPopularity() {
  let touched = 0;
  for (const c of SEED_COMPETITIONS) {
    touched += run(
      `UPDATE competitions SET popularity = ?
        WHERE seed_name = ? AND COALESCE(country_hint, '') = COALESCE(?, '') AND popularity <> ?`,
      competitionPopularity(c.name, c.country),
      c.name,
      c.country ?? null,
      competitionPopularity(c.name, c.country),
    ).changes;
  }
  for (const t of SEED_TEAMS) {
    touched += run(
      'UPDATE teams SET popularity = ? WHERE seed_name = ? AND popularity <> ?',
      teamPopularity(t.name),
      t.name,
      teamPopularity(t.name),
    ).changes;
  }
  return touched;
}

/** Applies schema.sql, then the additive migrations it cannot express. Safe on every boot. */
/**
 * Drops seeded fixtures from before the data floor.
 *
 * Runs every boot rather than once: it is a cheap indexed delete, and stating the invariant
 * where it can be re-checked is worth more than a one-shot migration flag. Custom matches
 * and anything anyone has marked watched are both excluded, so this can never take away a
 * record somebody entered or kept.
 */
function purgeBelowFloor() {
  const result = run(
    `DELETE FROM matches
      WHERE is_custom = 0
        AND kickoff_utc < ?
        AND id NOT IN (SELECT match_id FROM watch_logs)`,
    DATA_FLOOR_MS,
  );
  return Number(result.changes ?? 0);
}

/**
 * Re-stamps matches whose stored season disagrees with what the rule says today.
 *
 * matches.season is written once at ingest, so a change to the rollover would otherwise
 * only reach rows synced after it. Runs every boot alongside the purge, costs one scan, and
 * settles to zero changes the moment the data agrees with the rule.
 */
function restampSeasons() {
  let touched = 0;
  const rows = all('SELECT id, kickoff_utc, season FROM matches');
  for (const row of rows) {
    const season = seasonIdFor(new Date(row.kickoff_utc));
    if (season === row.season) continue;
    run('UPDATE matches SET season = ? WHERE id = ?', season, row.id);
    touched++;
  }
  return touched;
}

/**
 * Reunites a seeded team with its own fixtures when resolution split them in two.
 *
 * A seed is resolved by name lookup, and the provider can hand back a different id than the
 * one its own fixtures carry. Milan is the case in hand: the seeded row resolved to
 * 14300137, while every Milan fixture points at 416923, which arrived later through
 * ensureTeam as an ordinary provider row called "AC Milan". Both rows are real, both show
 * in the catalog, and the one people can follow is the one holding nothing.
 *
 * coreName already strips the club furniture that separates the two spellings, so the same
 * helper resolution uses decides identity here. The bar is deliberately high: the seed must
 * hold no fixtures at all, the candidate must hold some, and there must be exactly one
 * candidate. National sides are left alone, since every provider row is created as a club.
 */
function mergeSplitTeams() {
  const orphans = all(
    `SELECT id, seed_name, name FROM teams
       WHERE is_seed = 1 AND is_national = 0 AND resolved = 1
         AND NOT EXISTS(SELECT 1 FROM matches m
                         WHERE m.home_team_id = teams.id OR m.away_team_id = teams.id)`,
  );
  if (!orphans.length) return 0;

  const candidates = all(
    `SELECT id, name, provider_id, logo_url, color FROM teams
       WHERE is_seed = 0 AND is_national = 0
         AND EXISTS(SELECT 1 FROM matches m
                     WHERE m.home_team_id = teams.id OR m.away_team_id = teams.id)`,
  );

  let merged = 0;
  for (const seed of orphans) {
    const core = coreName(seed.seed_name || seed.name);
    const hits = candidates.filter((c) => coreName(c.name) === core);
    if (hits.length !== 1) continue;
    const dup = hits[0];

    tx(() => {
      // Fixtures move first: matches reference teams(id) ON DELETE SET NULL, so dropping the
      // duplicate before this would strip the very links being rescued.
      run('UPDATE matches SET home_team_id = ? WHERE home_team_id = ?', seed.id, dup.id);
      run('UPDATE matches SET away_team_id = ? WHERE away_team_id = ?', seed.id, dup.id);
      // Anyone who followed the duplicate keeps their follow, unless they already had both.
      run(
        "UPDATE OR IGNORE follows SET entity_id = ? WHERE kind = 'team' AND entity_id = ?",
        seed.id,
        dup.id,
      );
      run("DELETE FROM follows WHERE kind = 'team' AND entity_id = ?", dup.id);
      // The provider_id is unique, so the duplicate has to go before the seed can take it.
      run('DELETE FROM teams WHERE id = ?', dup.id);
      run(
        `UPDATE teams SET provider_id = ?,
                          logo_url = COALESCE(logo_url, ?),
                          color = COALESCE(color, ?)
          WHERE id = ?`,
        dup.provider_id,
        dup.logo_url,
        dup.color,
        seed.id,
      );
    });
    console.log(`Merged duplicate team "${dup.name}" into seeded "${seed.seed_name}".`);
    merged++;
  }
  return merged;
}

export function migrate() {
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  ensureColumn('otp_codes', 'ip', 'TEXT');
  ensureColumn('teams', 'popularity', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('competitions', 'popularity', 'INTEGER NOT NULL DEFAULT 0');
  // Indexed here rather than in schema.sql, which cannot add an index to a column it did
  // not create on this install.
  db.exec('CREATE INDEX IF NOT EXISTS idx_team_popularity ON teams(popularity DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_comp_popularity ON competitions(popularity DESC)');
  // The rate-limit count is a lookup by caller over a one hour window.
  db.exec('CREATE INDEX IF NOT EXISTS idx_otp_ip ON otp_codes(ip, created_at DESC)');

  const gaps = unranked();
  if (gaps.teams.length || gaps.competitions.length) {
    console.warn('Seeds with no popularity rank:', [...gaps.competitions, ...gaps.teams].join(', '));
  }
  return {
    ranked: applyPopularity(),
    purged: purgeBelowFloor(),
    restamped: restampSeasons(),
    merged: mergeSplitTeams(),
  };
}

if (isMain(import.meta.url)) {
  const result = migrate();
  console.log(
    `Schema applied. ${result.ranked} popularity ranks written, ${result.purged} pre-floor `
      + `fixtures dropped, ${result.restamped} seasons re-stamped, ${result.merged} teams merged.`,
  );
}
