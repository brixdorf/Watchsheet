import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, all, run } from './index.js';
import { isMain } from '../lib/ismain.js';
import { SEED_COMPETITIONS, SEED_TEAMS } from './seedData.js';
import { competitionPopularity, teamPopularity, unranked } from './popularity.js';

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
export function migrate() {
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  ensureColumn('teams', 'popularity', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('competitions', 'popularity', 'INTEGER NOT NULL DEFAULT 0');
  // Indexed here rather than in schema.sql, which cannot add an index to a column it did
  // not create on this install.
  db.exec('CREATE INDEX IF NOT EXISTS idx_team_popularity ON teams(popularity DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_comp_popularity ON competitions(popularity DESC)');

  const gaps = unranked();
  if (gaps.teams.length || gaps.competitions.length) {
    console.warn('Seeds with no popularity rank:', [...gaps.competitions, ...gaps.teams].join(', '));
  }
  return { ranked: applyPopularity() };
}

if (isMain(import.meta.url)) {
  const result = migrate();
  console.log(`Schema applied. ${result.ranked} popularity ranks written.`);
}
