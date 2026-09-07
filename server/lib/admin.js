import { config } from '../config.js';

/**
 * Admin access is by email address, listed in ADMIN_EMAILS. There is no admin flag on the
 * user row on purpose: the list lives in the environment, so revoking access is a config
 * change and a restart rather than a database edit, and a copied database grants nothing.
 */

export const isAdmin = (user) =>
  !!user && config.adminEmails.includes(String(user.email ?? '').trim().toLowerCase());

/**
 * Answers 404 rather than 403 for a signed-in non-admin, so the admin surface does not
 * announce that it exists to anyone who goes looking.
 */
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  if (!isAdmin(req.user)) return res.status(404).json({ error: 'No such endpoint' });
  next();
}
