import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './index.js';
import { isMain } from '../lib/ismain.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Applies schema.sql. Every statement is IF NOT EXISTS, so this is safe on every boot. */
export function migrate() {
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
}

if (isMain(import.meta.url)) {
  migrate();
  console.log('Schema applied.');
}
