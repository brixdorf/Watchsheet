/** Small shared layout pieces, so the screens stay about their own content. */

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
      style={{
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
