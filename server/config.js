import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const num = (v, fallback) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v, fallback) => (v == null || v === '' ? fallback : /^(1|true|yes|on)$/i.test(v));

export const config = {
  rootDir,
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num(process.env.PORT, 3000),
  sessionSecret: process.env.SESSION_SECRET || 'watchsheet-dev-secret',
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH || './data/watchsheet.db'),

  // Who may open the admin screen. Kept in the environment rather than on the user row,
  // so access is a config change and a copied database grants nothing.
  adminEmails: (process.env.ADMIN_EMAILS || 'admin@example.com')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  highlightly: {
    apiKey: process.env.HIGHLIGHTLY_API_KEY || '',
    baseUrl: (process.env.HIGHLIGHTLY_BASE_URL || 'https://soccer.highlightly.net').replace(/\/+$/, ''),
    dailyBudget: num(process.env.HIGHLIGHTLY_DAILY_BUDGET, 85),
  },

  sync: {
    enabled: bool(process.env.SYNC_ENABLED, true),
    slice: num(process.env.SYNC_SLICE, 6),
  },

  mail: {
    provider: process.env.MAIL_PROVIDER || 'console',
    from: process.env.MAIL_FROM || 'Watchsheet <watchsheet@example.com>',
    replyTo: process.env.MAIL_REPLY_TO || '',
    resendApiKey: process.env.RESEND_API_KEY || '',
    devEcho: bool(process.env.OTP_DEV_ECHO, process.env.NODE_ENV !== 'production'),
  },
};
