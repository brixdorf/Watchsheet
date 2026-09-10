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

/**
 * Whether a team is in its own season right now, which decides club against country.
 *
 * The competition window is no use here. It asks whether a competition has a fixture within
 * forty-five days, and every national side passes that through the Nations League, so
 * reusing it would rank Brazil above Arsenal in September.
 *
 * Ten days forward separates the two calendars instead, because they are deliberately kept
 * apart. Clubs play weekly, so they sit inside it all season; during an international break
 * the domestic fixtures stop and the gap stretches past three weeks, which drops the clubs
 * out just as the national sides come in. It inverts itself, so a World Cup needs no edit.
 */
export const PLAYING_SOON_MS = 10 * 24 * 60 * 60 * 1000;

/** The window a team must have a fixture in to count as playing. */
export const playingWindow = (now = Date.now()) => [now - 2 * 86_400_000, now + PLAYING_SOON_MS];
