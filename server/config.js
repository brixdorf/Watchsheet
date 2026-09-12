import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Node reads .env itself, so this needs no dependency. Variables already set in the
// environment win, exactly as they did under dotenv, and the file is found from the project
// root rather than whatever directory a command happens to run in. It is optional: a
// deployment may supply everything through the environment instead.
try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

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

  // How many proxies sit in front. Cloudflare and Traefik is two; get it wrong and req.ip
  // is a proxy's address rather than the caller's, which would put every visitor into the
  // same rate-limit bucket. Cloudflare's own header is preferred over this anyway, so it
  // only matters where that header is absent.
  trustProxyHops: num(process.env.TRUST_PROXY_HOPS, 2),

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
    // Requests per hourly tick, so the day's ceiling is 24 times this. It has to stay under
    // the daily budget above, or the schedule simply stops part way through the afternoon
    // when the guard runs out, which is the wrong half of the day to lose.
    slice: num(process.env.SYNC_SLICE, 3),
  },

  mail: {
    // A Resend key is the only thing that has to be supplied to send real mail: with one set
    // and no explicit MAIL_PROVIDER, Resend is used. MAIL_PROVIDER=console still forces local
    // delivery, which is how to test the flow on a machine that holds a live key.
    provider:
      process.env.MAIL_PROVIDER || (process.env.RESEND_API_KEY ? 'resend' : 'console'),
    // The subdomain verified at Resend, so its SPF and DKIM sit apart from another mail host's on the apex.
    from: process.env.MAIL_FROM || 'Watchsheet <auth@mail.example.com>',
    // Resend only sends here, by choice, so replies are pointed at the another mail host inbox instead.
    replyTo: process.env.MAIL_REPLY_TO || 'hi@example.com',
    resendApiKey: process.env.RESEND_API_KEY || '',
    devEcho: bool(process.env.OTP_DEV_ECHO, process.env.NODE_ENV !== 'production'),
  },

  otp: {
    // Codes an address can be sent from one caller per hour. The per-address cooldown stops
    // someone spamming one inbox; this stops them working through a list of inboxes.
    ipPerHour: num(process.env.OTP_IP_PER_HOUR, 10),
  },
};
