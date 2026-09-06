/**
 * Name matching between our seed list and Highlightly's catalog.
 *
 * The provider names things its own way ("Bayern Munich", "Korea Republic", "Carabao
 * Cup"), so resolution is: exact normalized match, then alias match, then a conservative
 * fuzzy fallback. The fallback is deliberately strict — a wrong match silently attaches a
 * user's follow to the wrong club, which is worse than not resolving at all.
 */

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function normalizeName(input) {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Club-name furniture that carries no identity on its own.
const NOISE = new Set(['fc', 'cf', 'sc', 'afc', 'ac', 'ss', 'ssc', 'club', 'de', 'the', '1907']);

/** Normalized name with the decorative tokens removed, e.g. "ssc napoli" -> "napoli". */
export function coreName(input) {
  const words = normalizeName(input).split(' ').filter((w) => w && !NOISE.has(w));
  return words.length ? words.join(' ') : normalizeName(input);
}

/** England, Great Britain and the UK are one country as far as league metadata goes. */
const COUNTRY_SYNONYMS = {
  gb: ['gb', 'uk', 'england', 'great britain', 'united kingdom', 'gb eng'],
  es: ['es', 'spain', 'espana'],
  de: ['de', 'germany', 'deutschland'],
  it: ['it', 'italy', 'italia'],
  fr: ['fr', 'france'],
  in: ['in', 'india'],
};

export function countryMatches(hint, code, name) {
  if (!hint) return true;
  const want = COUNTRY_SYNONYMS[String(hint).toLowerCase()] || [String(hint).toLowerCase()];
  const got = [normalizeName(code), normalizeName(name)].filter(Boolean);
  return got.some((g) => want.includes(g));
}

/**
 * How well `candidate` matches `seed`, 0 (no match) to 100 (exact).
 *
 * Only the top two tiers are trustworthy enough to auto-resolve; `pickBest` enforces the
 * threshold rather than leaving it to callers.
 */
export function scoreName(seedName, aliases, candidateName) {
  const cand = normalizeName(candidateName);
  const candCore = coreName(candidateName);
  if (!cand) return 0;

  // The seed's own name always outranks an alias. Aliases are broad by design — "Super
  // Cup" is a real alias for the Italian and Spanish trophies, and every country has a
  // competition by that literal name — so an alias must never beat an exact hit on the
  // name we actually asked for.
  if (normalizeName(seedName) === cand) return 100;
  for (const w of aliases || []) {
    if (normalizeName(w) === cand) return 95;
  }
  if (coreName(seedName) === candCore) return 90;
  for (const w of aliases || []) {
    if (coreName(w) === candCore) return 85;
  }
  for (const w of [seedName, ...(aliases || [])]) {
    const wc = coreName(w);
    if (!wc) continue;
    // "arsenal" vs "arsenal women" / "arsenal u21" — a prefix match on whole words only.
    if (candCore.startsWith(wc + ' ') || candCore.endsWith(' ' + wc)) return 60;
  }
  return 0;
}

// Squads that share a club's name but are a different team entirely.
const EXCLUDE = /\b(u ?\d{2}|women|ladies|feminin|femenino|reserves?|ii|b team|academy|youth)\b/i;

/**
 * Best candidate above the confidence threshold, or null.
 *
 * `candidates` are `{ name, ... }` objects; `extra` can veto or boost a row (used to
 * prefer national sides for country seeds and to honour the country hint on leagues).
 */
export function pickBest(seed, candidates, extra = () => 0) {
  const scored = [];
  for (const c of candidates) {
    if (EXCLUDE.test(String(c.name ?? ''))) continue;
    const bonus = extra(c);
    if (bonus < 0) continue;
    const score = scoreName(seed.name, seed.aliases, c.name) + bonus;
    if (score > 0) scored.push({ row: c, score });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);

  const [best, runnerUp] = scored;
  // 60 is the weakest tier (whole-word prefix/suffix); anything below is a guess.
  if (best.score < 60) return null;
  // A weak match that two candidates fit equally well is ambiguous — "Inter" against both
  // "Inter Miami" and "Inter Turku". Decline rather than pick one arbitrarily.
  if (best.score < 90 && runnerUp && runnerUp.score === best.score) return null;
  return best;
}
