/**
 * Season ids are derived locally rather than read from the provider, which reports seasons
 * inconsistently across competitions.
 *
 * A season turns over in June. Europe's domestic seasons finish in late May, so June is
 * where the year actually breaks, and it puts a summer tournament in the season it belongs
 * to instead of the one that just ended: the 2026 World Cup opened on 11 June and is 26/27
 * throughout, rather than being split across the final and the group stage.
 */
export function seasonIdFor(input) {
  const d = input instanceof Date ? input : new Date(input);
  const year = d.getFullYear();
  const start = d.getMonth() >= 5 ? year : year - 1;
  const p = (n) => String(n % 100).padStart(2, '0');
  return `${p(start)}/${p(start + 1)}`;
}

/** The season containing "now". */
export const currentSeason = () => seasonIdFor(new Date());

/**
 * Watchsheet keeps fixtures from the 2026 World Cup onward, and drops what came before.
 *
 * The floor is a kickoff date rather than a season id, and it is deliberately set to the
 * same June boundary the season rule uses. The two agreeing is what makes every fixture we
 * hold fall in one season, 26/27, with the tournament whole inside it.
 *
 * User-entered custom matches are exempt. Somebody's record of a game they watched is
 * theirs, whenever it was played; this floor is about seeded provider data.
 */
export const DATA_FLOOR_MS = Date.parse('2026-06-01T00:00:00Z');

/** The earliest provider season worth requesting, matching the floor above. */
export const MIN_PROVIDER_SEASON = 2026;
