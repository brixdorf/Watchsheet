/**
 * The viewer's clock offset, in the form Date.getTimezoneOffset() reports it: minutes to add
 * to local time to reach UTC, so India is -330. Every route that buckets by day, hour or
 * month takes it from the query string rather than trusting the server's own clock.
 *
 * Real offsets run from -840 (UTC+14) to +720 (UTC-12). A value outside that range is not a
 * clock: 1e308 turned every kick-off into an invalid date, the export wrote NaN-NaN-NaN, and
 * stats filed three thousand matches under one day. Those fall back exactly as a missing
 * value always has, to the server's offset.
 */
export function viewerOffset(value) {
  const n = value == null || value === '' ? Number.NaN : Number(value);
  return Number.isFinite(n) && n >= -840 && n <= 720 ? n : new Date().getTimezoneOffset();
}

/** An instant shifted into the viewer's wall clock: read it back with the getUTC* methods. */
export const toViewerClock = (ts, offsetMin) => new Date(ts - offsetMin * 60_000);
