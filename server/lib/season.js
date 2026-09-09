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

/**
 * Watchsheet keeps fixtures from the 2026 World Cup onward, and drops what came before.
 *
 * The floor is a kickoff date rather than a season id on purpose. The tournament opened on
 * 11 June 2026, which the July rollover files under 25/26, so flooring by season would keep
 * only its knockout rounds and leave a half tournament on screen.
 *
 * User-entered custom matches are exempt. Somebody's record of a game they watched is
 * theirs, whenever it was played; this floor is about seeded provider data.
 */
export const DATA_FLOOR_MS = Date.parse('2026-06-01T00:00:00Z');

/** The earliest provider season worth requesting, matching the floor above. */
export const MIN_PROVIDER_SEASON = 2026;
