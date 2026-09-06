/**
 * GSAP entrance choreography, ported from the design canvas including its safety nets.
 *
 * Those nets exist for a reason and are kept verbatim:
 *   1. Kill in-flight tweens and reset to the settled state before every run, so an
 *      interrupted tween can never strand an element in its from-state.
 *   2. Only hide-then-reveal inside a requestAnimationFrame, and bail if the document is
 *      hidden — in a background tab no frame arrives, so content simply stays visible.
 *   3. A timeout that forces the settled state shortly after, in case the ticker was
 *      throttled mid-flight.
 *
 * Together they mean the worst failure is "no animation", never "invisible content".
 */

const SETTLED = { opacity: 1, y: 0, scale: 1, scaleY: 1, clearProps: 'transform,opacity' };
const SAFETY_MS = 1500;

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
          stagger: { each: 0.028, from: 'start' },
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
          stagger: 0.03,
          ...done(nums),
        },
      );
    }
    if (bars.length) {
      g.fromTo(
        bars,
        { scaleY: 0, transformOrigin: 'bottom' },
        { scaleY: 1, duration: 0.6, ease: 'power3.out', stagger: 0.035, ...done(bars) },
      );
    }
  });

  const timer = setTimeout(() => settle(g, sets), SAFETY_MS);

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
