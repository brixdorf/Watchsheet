/**
 * GSAP entrance choreography, ported from the design canvas including its safety nets.
 *
 * The three nets are the canvas's own, and the reason the worst failure here is "no
 * animation" rather than "invisible content":
 *   1. Kill in-flight tweens and reset to the settled state before every run, so an
 *      interrupted tween can never strand an element in its from-state.
 *   2. Only hide-then-reveal inside a requestAnimationFrame, and bail if the document is
 *      hidden. In a background tab no frame arrives, so content simply stays visible.
 *   3. A timeout that forces the settled state once the entrance should have finished, in
 *      case the ticker was throttled mid-flight. Its window is computed from the stagger
 *      rather than fixed, since a fixed one expired early on long lists and left their last
 *      rows hidden permanently.
 */

const SETTLED = { opacity: 1, y: 0, scale: 1, scaleY: 1, clearProps: 'transform,opacity' };

/**
 * The stagger is capped as a total, not billed per row.
 *
 * A per-row delay is fine for a feed of a dozen cards and wrong for the catalog, which
 * renders sixty: at 0.028s each the last card would not appear for over two seconds, which
 * reads as a list that is still loading. Handing GSAP `amount` spreads the same choreography
 * across a fixed window however many rows there are, so a long list arrives quickly and a
 * short one still arrives one card at a time.
 */
const ROW_STAGGER_EACH = 0.028;
const ROW_STAGGER_MAX = 0.55;
const NUM_STAGGER_EACH = 0.03;
const NUM_STAGGER_MAX = 0.3;

const spread = (count, each, max) => Math.min(count * each, max);

const gsap = () => (typeof window !== 'undefined' ? window.gsap : null);

const pick = (root, selector) =>
  root ? Array.prototype.slice.call(root.querySelectorAll(selector)) : [];

function settle(g, sets) {
  for (const set of sets) {
    if (!set.length) continue;
    g.killTweensOf(set);
    g.set(set, SETTLED);
  }
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Runs the list/number/bar entrance inside `root`.
 * Returns a cleanup function that cancels the pending frame and timeout.
 */
export function animateScreen(root) {
  const g = gsap();
  if (!g || !root) return () => {};

  const rows = pick(root, '[data-anim="row"]');
  const nums = pick(root, '[data-anim="num"]');
  const bars = pick(root, '[data-anim="bar"]');
  const sets = [rows, nums, bars];

  const rowSpread = spread(rows.length, ROW_STAGGER_EACH, ROW_STAGGER_MAX);
  const numSpread = spread(nums.length, NUM_STAGGER_EACH, NUM_STAGGER_MAX);
  const barSpread = spread(bars.length, 0.035, 0.4);
  // Long enough to cover the slowest entrance in flight, plus a margin. A fixed window used
  // to expire mid-stagger on the catalog and leave its last rows invisible for good.
  const safetyMs = Math.ceil((0.6 + Math.max(rowSpread, numSpread, barSpread)) * 1000) + 600;

  settle(g, sets);
  if (prefersReducedMotion()) return () => {};

  const done = (set) => ({
    clearProps: 'transform,opacity',
    onInterrupt: () => g.set(set, SETTLED),
  });

  const frame = requestAnimationFrame(() => {
    if (document.visibilityState !== 'visible') return;
    if (rows.length) {
      g.fromTo(
        rows,
        { y: 14, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.42,
          ease: 'power3.out',
          stagger: { amount: rowSpread, from: 'start' },
          ...done(rows),
        },
      );
    }
    if (nums.length) {
      g.fromTo(
        nums,
        { y: 8, opacity: 0, scale: 0.9 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.5,
          delay: 0.06,
          ease: 'back.out(2)',
          stagger: { amount: numSpread, from: 'start' },
          ...done(nums),
        },
      );
    }
    if (bars.length) {
      g.fromTo(
        bars,
        { scaleY: 0, transformOrigin: 'bottom' },
        { scaleY: 1, duration: 0.6, ease: 'power3.out', stagger: { amount: barSpread }, ...done(bars) },
      );
    }
  });

  const timer = setTimeout(() => settle(g, sets), safetyMs);

  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
}

/** The modal/sheet entrance, plus the scoreline pop inside it. */
export function animateSheet(root) {
  const g = gsap();
  if (!g || !root || prefersReducedMotion()) return () => {};

  const frame = requestAnimationFrame(() => {
    if (document.visibilityState !== 'visible') return;
    const sheet = root.querySelector('[data-anim="sheet"]');
    if (sheet) {
      g.fromTo(
        sheet,
        { y: 24, opacity: 0, scale: 0.97 },
        { y: 0, opacity: 1, scale: 1, duration: 0.34, ease: 'power3.out' },
      );
    }
    const score = root.querySelector('[data-anim="score"]');
    if (score) {
      g.fromTo(
        score,
        { y: 18, opacity: 0, scale: 0.75 },
        { y: 0, opacity: 1, scale: 1, duration: 0.55, delay: 0.08, ease: 'back.out(2.4)' },
      );
    }
  });

  return () => cancelAnimationFrame(frame);
}

/** A small nudge on the scoreline when a rating changes. */
export function pulseScore(root) {
  const g = gsap();
  if (!g || !root || prefersReducedMotion()) return;
  const score = root.querySelector('[data-anim="score"]');
  if (score) g.fromTo(score, { scale: 0.9 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' });
}

/**
 * Returning to a tab after it was backgrounded mid-tween: force everything settled, since
 * the tween that would have finished the job was throttled away.
 */
export function installVisibilityGuard(getRoot) {
  const handler = () => {
    const g = gsap();
    const root = getRoot();
    if (document.visibilityState !== 'visible' || !g || !root) return;
    const set = pick(root, '[data-anim="row"],[data-anim="num"],[data-anim="bar"]');
    if (set.length) {
      g.killTweensOf(set);
      g.set(set, SETTLED);
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
