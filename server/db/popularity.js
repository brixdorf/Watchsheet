import { normalizeName } from '../lib/names.js';
import { SEED_COMPETITIONS, SEED_TEAMS } from './seedData.js';

/**
 * Rough worldwide popularity, most-followed first.
 *
 * This orders what a new account is offered during sign-up and how the Following catalog
 * reads, so it is deliberately about global pull rather than anyone's personal taste — the
 * seed list is a starting menu, not an assumption about what a user follows.
 *
 * Names are compared after normalisation, so they are written here without diacritics.
 * The two competitions that share the name "Super Cup" are told apart by the same country
 * hint that separates them everywhere else.
 */

const TEAM_ORDER = [
  'Real Madrid', 'Barcelona', 'Brazil', 'Argentina', 'Manchester United', 'Liverpool',
  'Bayern Munchen', 'Manchester City', 'France', 'Paris Saint-Germain', 'Arsenal', 'Chelsea',
  'Germany', 'Spain', 'England', 'Juventus', 'Milan', 'Inter', 'Portugal',
  'Borussia Dortmund', 'Tottenham Hotspur', 'Atletico Madrid', 'Italy', 'Netherlands',
  'Napoli', 'Al Nassr', 'Inter Miami', 'Belgium', 'Croatia', 'Japan', 'Morocco',
  'South Korea', 'USA', 'Santos', 'Norway', 'Turkiye', 'Sweden', 'Australia', 'Canada',
  'India', 'Como', 'Bengaluru FC', 'Odisha FC', 'Mohun Bagan SG', 'Sidemen FC',
  'YouTube Allstars',
];

const COMPETITION_ORDER = [
  'FIFA World Cup', 'Champions League', 'Premier League', 'LaLiga', 'EURO', 'Serie A',
  'Bundesliga', 'Copa America', 'Ligue 1', 'Europa League', 'Copa Libertadores',
  'FIFA Club World Cup', 'Africa Cup of Nations', 'FA Cup', 'Copa del Rey',
  'UEFA Nations League A', 'Asian Cup', 'CONCACAF Gold Cup', 'EFL Cup', 'Conference League',
  'UEFA Super Cup', 'Coppa Italia', 'DFB Pokal', 'Supercopa de Espana',
  'AFC Champions League Elite', 'Community Shield', 'Coupe de France', 'Indian Super League',
  'Supercoppa', 'Super Cup|DE', 'Trophee des champions', 'FIFA Intercontinental Cup',
  'Finalissima', 'Soccer Aid', 'Sidemen Charity Match', 'UEFA Nations League B',
  'UEFA Nations League C', 'UEFA Nations League D', 'Durand Cup', 'Super Cup|IN',
  'SAFF Championship', 'African Nations Championship',
];

/** "Name|CC" -> a comparable key; the country half is optional. */
function keyOf(name, country) {
  const base = normalizeName(name);
  return country ? `${base}|${String(country).toUpperCase()}` : base;
}

function rankMap(order) {
  const map = new Map();
  order.forEach((entry, i) => {
    const [name, country] = entry.split('|');
    // Higher is more popular, so a plain DESC sort puts the biggest names first and
    // anything unranked (0) falls to the bottom.
    map.set(keyOf(name, country), order.length - i);
  });
  return map;
}

const TEAM_RANKS = rankMap(TEAM_ORDER);
const COMPETITION_RANKS = rankMap(COMPETITION_ORDER);

export const teamPopularity = (name) => TEAM_RANKS.get(keyOf(name)) ?? 0;

export const competitionPopularity = (name, countryHint) =>
  COMPETITION_RANKS.get(keyOf(name, countryHint)) ?? COMPETITION_RANKS.get(keyOf(name)) ?? 0;

/**
 * Every seed must carry a rank, or it would sort below teams the provider invented. Returns
 * the names that fell through so a typo surfaces as a warning instead of a silent zero.
 */
export function unranked() {
  return {
    teams: SEED_TEAMS.filter((t) => teamPopularity(t.name) === 0).map((t) => t.name),
    competitions: SEED_COMPETITIONS.filter(
      (c) => competitionPopularity(c.name, c.country) === 0,
    ).map((c) => c.name),
  };
}
