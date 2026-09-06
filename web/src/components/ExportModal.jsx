import { useEffect, useState } from 'react';
import { api, exportUrl } from '../lib/api.js';
import { tzName } from '../lib/format.js';
import { Modal, ModalTitle } from './Modal.jsx';
import { Eyebrow } from './layout.jsx';

/** Export the watched history as JSON or CSV, for one season or all of it. */
export function ExportModal({ seasons, season, onClose }) {
  const [scope, setScope] = useState(season ?? 'all');
  const [format, setFormat] = useState('CSV');
  const [count, setCount] = useState(null);

  useEffect(() => {
    let live = true;
    setCount(null);
    api
      .exportCount(scope)
      .then((r) => live && setCount(r.count))
      .catch(() => live && setCount(0));
    return () => {
      live = false;
    };
  }, [scope]);

  const options = [
    { id: 'all', label: 'Complete history — all seasons' },
    ...seasons.map((s) => ({ id: s.id, label: `Season ${s.id}${s.current ? ' · current' : ''}`, logged: s.logged })),
  ];

  return (
    <Modal onClose={onClose} maxWidth={440}>
      <ModalTitle onClose={onClose}>Export history</ModalTitle>
      <div style={{ color: 'var(--dim)', fontSize: 13, marginBottom: 18 }}>
        Your log, yours to take. No account lock-in.
      </div>

      <Eyebrow>Scope</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
        {options.map((o) => {
          const active = scope === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setScope(o.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '12px 13px',
                borderRadius: 12,
                cursor: 'pointer',
                textAlign: 'left',
                background: active ? 'var(--accent-soft)' : 'var(--card)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                color: 'var(--fg)',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>{o.label}</span>
              {o.logged != null && <span style={{ fontSize: 11.5, color: 'var(--dim)' }}>{o.logged} matches</span>}
            </button>
          );
        })}
      </div>

      <Eyebrow>Format</Eyebrow>
      <div style={{ display: 'flex', gap: 7, marginBottom: 20 }}>
        {['CSV', 'JSON'].map((f) => {
          const active = format === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 14,
                background: active ? 'var(--accent-soft)' : 'var(--card)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                color: 'var(--fg)',
              }}
            >
              {f}
            </button>
          );
        })}
      </div>

      <a
        className="ws-primary"
        href={exportUrl({ scope, format, tz: tzName() })}
        download
        onClick={() => setTimeout(onClose, 150)}
        style={{ width: '100%', padding: 14, fontSize: 15, textDecoration: 'none' }}
      >
        <i className="ph-bold ph-download-simple" style={{ fontSize: 18 }} />
        {count == null ? 'Download' : `Download ${count} match${count === 1 ? '' : 'es'}`}
      </a>
    </Modal>
  );
}
