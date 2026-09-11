/**
 * Address validation, mirroring `server/lib/otp.js`.
 *
 * This is a courtesy copy: it saves a round trip on an address that is obviously wrong, and
 * it is the server's copy that actually guards the provider. The two must stay in step, so
 * if one changes, change the other.
 */

/** RFC 5321 ceilings. Anything past them is rejected by a receiving server anyway. */
const EMAIL_MAX = 254;
const LOCAL_MAX = 64;
const LABEL_MAX = 63;

export const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

/**
 * Structural, not exhaustive: the shape has to be deliverable, but the character set is
 * left alone wherever it can be, since a local part may hold unicode and a domain may be
 * punycode. Only the TLD is pinned to ASCII.
 */
export function isValidEmail(input) {
  const email = normalizeEmail(input);
  if (email.length < 3 || email.length > EMAIL_MAX) return false;

  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return false;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (local.length > LOCAL_MAX || /[\s@]/.test(local)) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;

  const labels = domain.split('.');
  if (labels.length < 2) return false;
  if (labels.some((l) => !l || l.length > LABEL_MAX || /[\s@.]/.test(l))) return false;
  if (labels.some((l) => l.startsWith('-') || l.endsWith('-'))) return false;

  const tld = labels[labels.length - 1];
  return tld.length >= 2 && /^[a-z][a-z0-9-]*$/.test(tld);
}
