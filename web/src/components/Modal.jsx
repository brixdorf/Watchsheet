import { useEffect, useRef } from 'react';
import { animateSheet } from '../lib/anim.js';

/**
 * The shared overlay: click the backdrop or press Escape to close, and the sheet animates
 * in with the design's entrance. Body scroll is locked while one is open so a long modal
 * does not scroll the page behind it.
 */
export function Modal({ children, onClose, maxWidth = 540, padded = true }) {
  const ref = useRef(null);

  useEffect(() => animateSheet(ref.current), []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(0,0,0,.62)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '24px 16px',
        overflowY: 'auto',
      }}
    >
      <div
        data-anim="sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth,
          background: 'var(--bg2)',
          border: '1px solid var(--line2)',
          borderRadius: 20,
          overflow: 'hidden',
          ...(padded ? { padding: 20 } : null),
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalTitle({ children, onClose }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 10 }}>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>{children}</div>
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
