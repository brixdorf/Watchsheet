/**
 * Season ids follow the design's rule: a season starts in July, so 2026-09-05 is '26/27'.
 * Derived locally rather than read from the provider, which reports seasons inconsistently
 * across competitions.
 */
export function seasonIdFor(input) {
  const d = input instanceof Date ? input : new Date(input);
  const year = d.getFullYear();
  const start = d.getMonth() >= 6 ? year : year - 1;
  const p = (n) => String(n % 100).padStart(2, '0');
  return `${p(start)}/${p(start + 1)}`;
}

/** The season containing "now". */
export const currentSeason = () => seasonIdFor(new Date());
