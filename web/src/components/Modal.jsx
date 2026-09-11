import { useEffect, useRef } from 'react';
import { animateSheet } from '../lib/anim.js';

/**
 * The shared overlay: click the backdrop or press Escape to close, and the sheet animates
 * in with the design's entrance.
 *
 * On a phone it is a bottom sheet rather than a centred card, which is the whole reason the
 * layout lives in styles.css instead of here: a media query cannot reach an inline style.
 * `maxWidth` is passed down as a custom property so the phone rule can drop it without
 * needing !important to beat an inline value.
 */

/**
 * Body scroll is locked while a modal is open, counted rather than captured.
 *
 * App.jsx holds `detail`, `quick` and `modal` in three independent states, so two can be
 * mounted at once. The previous version recorded document.body.style.overflow on mount, so
 * a second modal recorded 'hidden' as the value to go back to and restored that on unmount,
 * leaving the page locked with nothing on screen to explain it.
 */
let openModals = 0;
let overflowBefore = '';

function lockScroll() {
  if (openModals === 0) {
    overflowBefore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openModals += 1;
  return () => {
    openModals -= 1;
    if (openModals === 0) document.body.style.overflow = overflowBefore;
  };
}

export function Modal({ children, onClose, maxWidth = 540, padded = true }) {
  const ref = useRef(null);

  useEffect(() => animateSheet(ref.current), []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const unlock = lockScroll();
    return () => {
      document.removeEventListener('keydown', onKey);
      unlock();
    };
  }, [onClose]);

  return (
    <div ref={ref} onClick={onClose} role="dialog" aria-modal="true" className="ws-modal">
      <div
        data-anim="sheet"
        onClick={(e) => e.stopPropagation()}
        // A field focused near the bottom of a tall sheet sits under the software keyboard,
        // which does not shrink a fixed overlay. Nudging it into view is the cheap half of
        // the fix and costs nothing when there is no keyboard.
        onFocus={(e) => e.target.scrollIntoView?.({ block: 'nearest' })}
        className={`ws-sheet${padded ? ' ws-sheet--padded' : ''}`}
        style={{ '--sheet-max': `${maxWidth}px` }}
      >
        <div className="ws-sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

export function ModalTitle({ children, onClose }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 10 }}>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', minWidth: 0 }}>{children}</div>
      <button
        type="button"
        className="ws-chip"
        aria-label="Close"
        onClick={onClose}
        style={{ width: 32, height: 32, flex: 'none', borderRadius: 9, display: 'grid', placeItems: 'center' }}
      >
        <i className="ph-bold ph-x" />
      </button>
    </div>
  );
}
