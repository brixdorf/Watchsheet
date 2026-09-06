/**
 * Formatting and colour helpers, carried over from the design canvas.
 *
 * The contrast maths is what keeps a monogram legible on any club colour, and it is the
 * same routine the canvas used to recolour the accent — so light mode stays readable when
 * the accent changes.
 */

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const INK_DARK = '#0A0F0D';

export function rgbOf(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function relLum(hex) {
  return rgbOf(hex)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    })
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}

export function contrast(a, b) {
  const l1 = relLum(a);
  const l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Whichever of near-black or white reads better on `hex`. */
export function ink(hex) {
  return contrast(hex, INK_DARK) >= contrast(hex, '#FFFFFF') ? INK_DARK : '#FFFFFF';
}

export function darken(hex, factor) {
  const [r, g, b] = rgbOf(hex);
  const h = (v) => Math.round(v * factor).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * A stable colour for teams the provider gave us no brand colour for. Hashing the name
 * keeps it consistent between sessions and between the two sides of a fixture.
 */
export function colorFor(name, fallbackSeed = '') {
  const source = `${name ?? ''}${fallbackSeed}`;
  let h = 0;
  for (let i = 0; i < source.length; i++) h = (h * 31 + source.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const sat = 42 + (h % 18);
  const light = 32 + ((h >> 3) % 12);
  return hslToHex(hue, sat, light);
}

function hslToHex(h, s, l) {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n) => {
    const v = lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Season ids run July to June, so 2026-09-05 is '26/27'. Mirrors the server. */
export function seasonIdFor(input) {
  const d = input instanceof Date ? input : new Date(input);
  const year = d.getFullYear();
  const start = d.getMonth() >= 6 ? year : year - 1;
  const p = (n) => String(n % 100).padStart(2, '0');
  return `${p(start)}/${p(start + 1)}`;
}

export function tzName() {
  try {
    const part = new Intl.DateTimeFormat([], { timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((x) => x.type === 'timeZoneName');
    return part ? part.value : '';
  } catch {
    return '';
  }
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function fmtDateShort(ts) {
  const d = new Date(ts);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtDateLong(ts) {
  const d = new Date(ts);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "in 3h" / "tomorrow" / "in 4d" for fixtures that have not kicked off. */
export function countdown(ts, now = Date.now()) {
  const diff = ts - now;
  if (diff < 0) return 'played';
  const hours = Math.round(diff / 3_600_000);
  if (hours < 1) return 'kicking off';
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'tomorrow' : `in ${days}d`;
}

export function initialsOf(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Local YYYY-MM-DD, for prefilling the custom match date field. */
export function todayInputDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
