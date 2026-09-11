import { useRef } from 'react';

/** Small shared layout pieces, so the screens stay about their own content. */

/**
 * The search field used on the Search and Following tabs.
 *
 * type="search" gives the browser's own cancel button, which is drawn by the platform and
 * ignores every colour token the app defines. It is suppressed in styles.css and replaced
 * with the same ph-x the modals close on, so the control looks like it belongs here and is
 * there on every browser rather than only on WebKit.
 */
export function SearchField({ value, onChange, placeholder, label, size = 'md' }) {
  const input = useRef(null);
  const big = size === 'md';
  // Size lives in a class rather than here, so the phone rule in styles.css can lift it to
  // the 16px that stops iOS zooming on focus. Inline would win over the media query.
  const pad = big ? { padding: '14px 44px 14px 44px', borderRadius: 14 } : { padding: '9px 36px 9px 36px', borderRadius: 10 };

  return (
    <div style={{ position: 'relative' }}>
      <i
        className="ph ph-magnifying-glass"
        style={{
          position: 'absolute',
          left: big ? 15 : 13,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: big ? 18 : 15,
          color: 'var(--dim)',
          pointerEvents: 'none',
        }}
      />
      <input
        ref={input}
        className={`ws-field ws-field--card ${big ? 'ws-search--md' : 'ws-search--sm'}`}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        style={pad}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          title="Clear search"
          onClick={() => {
            onChange('');
            input.current?.focus();
          }}
          style={{
            position: 'absolute',
            right: big ? 9 : 7,
            top: '50%',
            transform: 'translateY(-50%)',
            width: big ? 28 : 23,
            height: big ? 28 : 23,
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
            color: 'var(--dim)',
            fontSize: big ? 14 : 12,
          }}
          className="ws-pop ws-tap"
        >
          <i className="ph-bold ph-x" />
        </button>
      )}
    </div>
  );
}


export function SectionHeading({ title, sub, meta }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        marginBottom: 14,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.4 }}>{sub}</div>}
      </div>
      {meta && (
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--dim2)',
            whiteSpace: 'nowrap',
          }}
        >
          {meta}
        </div>
      )}
    </div>
  );
}

export function MatchGrid({ children, style }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))',
        gap: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function EmptyNote({ children, padding = 26 }) {
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        padding,
        textAlign: 'center',
        border: '1px dashed var(--line2)',
        borderRadius: 15,
        color: 'var(--dim)',
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

export function FilterPill({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="ws-tap"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '7px 12px',
        borderRadius: 9,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        fontSize: 13,
        fontWeight: 600,
        background: active ? 'var(--accent)' : 'var(--card)',
        color: active ? 'var(--accent-ink)' : 'var(--fg)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
      }}
    >
      {children}
    </button>
  );
}

export function Eyebrow({ children, style }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: 'var(--dim)',
        marginBottom: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 48,
        color: 'var(--dim)',
        fontSize: 14,
      }}
    >
      <i className="ph ph-circle-notch ws-spin" style={{ fontSize: 18 }} />
      {label}…
    </div>
  );
}
