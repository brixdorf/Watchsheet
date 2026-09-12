import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pruneCodes } from './lib/otp.js';
import { attachUser, pruneSessions } from './lib/session.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { exportRouter } from './routes/export.js';
import { logsRouter } from './routes/logs.js';
import { matchesRouter } from './routes/matches.js';
import { statsRouter } from './routes/stats.js';
import { startCron } from './sync/cron.js';

migrate();

const app = express();
app.disable('x-powered-by');
// Without this req.ip is the proxy, not the caller. See lib/clientIp.js for why the
// Cloudflare header is preferred over the value this produces.
app.set('trust proxy', config.trustProxyHops);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser(config.sessionSecret));
app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, env: config.env }));

app.use('/api/auth', authRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/logs', logsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/export', exportRouter);
app.use('/api/admin', adminRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint' }));

// In production the built SPA is served from here; in development Vite serves it and
// proxies /api back to this process.
if (config.isProd) {
  const dist = path.join(config.rootDir, 'web', 'dist');
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

/**
 * A refusal from the body parser is the caller's mistake, not ours: it carries its own 4xx
 * status, and answering 500 with a stack in the log made an oversized note or a truncated
 * request look like a server fault. Anything without a client status still is one.
 */
const CLIENT_ERRORS = {
  'entity.too.large': 'That is too much to send in one go.',
  'entity.parse.failed': 'That request did not arrive in one piece. Try again.',
};

app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number(err.status ?? err.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: CLIENT_ERRORS[err.type] ?? 'That request could not be read.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(config.port, () => {
  // Every interface, not just loopback. In development the phone reaches the app through
  // Vite, which proxies here, so this port is not the one to open in a browser.
  console.log(`Watchsheet API listening on port ${config.port} (${config.env})`);
  startCron();
});

// Housekeeping: expired sessions and stale codes, hourly.
pruneSessions();
pruneCodes();
setInterval(() => {
  pruneSessions();
  pruneCodes();
}, 3_600_000).unref();
