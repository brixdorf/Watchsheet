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

/**
 * Typo suggestions for the big mailbox providers: "sam@gamil.com" offers "sam@gmail.com".
 *
 * Client only, and only ever a suggestion, because a near miss can be a real domain. The
 * provider's name and the ending after it are compared separately, which is what keeps a
 * country variant safe: "yahoo.fr" and "hotmail.co.uk" are several edits from ".com", so they
 * are never pulled back to it, while "gmail.con" and "hotmail.co" are one. Short names get no
 * slack in the name itself ("aol", "msn", "me"), since one edit from a three-letter name is
 * just a different three-letter domain.
 */

// Most used first. A tie goes to whichever comes earlier.
const PROVIDERS = [
  'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'live.com',
  'protonmail.com', 'proton.me', 'aol.com', 'msn.com', 'ymail.com', 'rediffmail.com',
  'zoho.com', 'yandex.com', 'gmx.com', 'fastmail.com', 'me.com', 'mac.com',
];

// Real domains close enough to a provider to be flagged otherwise.
const KNOWN = new Set([
  ...PROVIDERS,
  'email.com', 'mail.com', 'googlemail.com', 'rocketmail.com', 'zohomail.com', 'zohomail.in',
  'cloud.com', 'pm.me', 'protonmail.ch',
]);

/** Edit distance counting a swap of two neighbouring letters as one edit, as in "gamil". */
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** How far a typed domain is from one provider, or Infinity when it is too far to suggest. */
function distanceTo(name, ending, provider) {
  const dot = provider.indexOf('.');
  const pName = provider.slice(0, dot);
  const pEnding = provider.slice(dot + 1);

  // No dot at all: "gmail", or the dot left out as in "gmailcom".
  if (!ending) {
    if (name === pName) return 1;
    if (pName.length < 5) return Infinity;
    const d = editDistance(name, pName + pEnding.replace(/\./g, ''));
    return d <= 1 ? 1 + d : Infinity;
  }

  const nameEdits = editDistance(name, pName);
  const endingEdits = editDistance(ending, pEnding);
  const nameSlack = pName.length >= 7 && endingEdits === 0 ? 2 : pName.length >= 5 ? 1 : 0;
  return nameEdits <= nameSlack && endingEdits <= 1 ? nameEdits + endingEdits : Infinity;
}

/**
 * The address the user probably meant, or null. The local part is kept exactly as typed;
 * only the domain is replaced.
 */
export function suggestEmail(input) {
  const email = String(input ?? '').trim();
  const at = email.lastIndexOf('@');
  if (at < 1) return null;

  const domain = email.slice(at + 1).toLowerCase().replace(/\.+$/, '');
  if (domain.length < 2 || KNOWN.has(domain)) return null;

  const dot = domain.indexOf('.');
  const name = dot === -1 ? domain : domain.slice(0, dot);
  const ending = dot === -1 ? '' : domain.slice(dot + 1);

  let best = null;
  let bestDistance = Infinity;
  for (const provider of PROVIDERS) {
    const distance = distanceTo(name, ending, provider);
    if (distance < bestDistance) {
      best = provider;
      bestDistance = distance;
    }
  }
  return best ? `${email.slice(0, at)}@${best}` : null;
}
