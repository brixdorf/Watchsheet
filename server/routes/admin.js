import express from 'express';
import { budgetStatus } from '../sync/budget.js';
import { fixtureStatus } from '../sync/fixtures.js';
import { seedStatus } from '../sync/seed.js';
import { lastRun } from '../sync/cron.js';
import { requireAuth } from '../lib/session.js';

export const adminRouter = express.Router();
adminRouter.use(requireAuth);

/**
 * Read-only view of what the background jobs are doing: today's spend against the free
 * tier, how far seeding got, and what the fixture rotation holds. Surfaced in the app so
 * the request budget is visible rather than something you have to read logs to discover.
 */
adminRouter.get('/sync', (_req, res) => {
  res.json({
    budget: budgetStatus(),
    seed: seedStatus(),
    fixtures: fixtureStatus(),
    lastRun: lastRun(),
  });
});
