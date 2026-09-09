import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db = new DatabaseSync(config.databasePath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA synchronous = NORMAL');

/**
 * node:sqlite has no transaction() wrapper, so this is the equivalent: run `fn` inside
 * BEGIN/COMMIT and roll back on any throw. Not reentrant, so do not nest calls.
 */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // The transaction was already unwound; the original error is the useful one.
    }
    throw err;
  }
}

export const get = (sql, ...params) => db.prepare(sql).get(...params);
export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const run = (sql, ...params) => db.prepare(sql).run(...params);

export function getState(key, fallback = null) {
  const row = get('SELECT value FROM sync_state WHERE key = ?', key);
  return row ? row.value : fallback;
}

export function setState(key, value) {
  run(
    `INSERT INTO sync_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value == null ? null : String(value),
  );
}
