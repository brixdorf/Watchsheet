/** Brief confirmation, bottom-centre, matching the design's ws-pop entrance. */
export function Toast({ message, tone = 'accent' }) {
  if (!message) return null;
  const negative = tone === 'negative';
  return (
    <div
      role="status"
      className="ws-toast"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '11px 16px',
        borderRadius: 13,
        background: negative ? 'var(--neg)' : 'var(--accent)',
        color: negative ? '#FFFFFF' : 'var(--accent-ink)',
        fontWeight: 600,
        fontSize: 14,
        boxShadow: '0 14px 34px rgba(0,0,0,.4)',
        animation: 'ws-pop .3s ease both',
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <i className={negative ? 'ph-fill ph-warning-circle' : 'ph-fill ph-check-circle'} style={{ fontSize: 18 }} />
      {message}
    </div>
  );
}
