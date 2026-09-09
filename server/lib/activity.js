/**
 * Whether a competition is actually being played right now.
 *
 * Popularity alone puts the World Cup and the Euros at the top of every list forever, months
 * after their finals. Ranking by real fixtures instead fixes that without a list anyone has
 * to remember to edit: a tournament sinks once it ends, and rises again when its qualifiers
 * appear.
 *
 * The window looks back as well as forward. A competition with nothing ahead of it is not
 * necessarily over: the sync pulls a season in pages, so a league can hold only the rounds
 * fetched so far. Forty-five days is wide enough to ride out an international break, a
 * winter shutdown or a half-synced season, and short enough that a finished tournament is
 * out of the way within weeks.
 */

export const LIVE_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

/** Kickoffs at or after this instant count a competition as live. */
export const liveSince = () => Date.now() - LIVE_WINDOW_MS;
