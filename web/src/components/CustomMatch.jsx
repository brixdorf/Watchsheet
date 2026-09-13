import { useState } from 'react';
import { seasonIdFor, todayInputDate } from '../lib/format.js';
import { Modal, ModalTitle } from './Modal.jsx';
import { Stars, ratingText } from './Stars.jsx';

/**
 * Manual match entry: the fallback for everything the provider does not carry.
 *
 * That is not an edge case here: charity matches, Soccer Aid and the Durand Cup all live in
 * this form. A custom match is watched by definition, so it is logged the moment it is added.
 */

const label = {
  display: 'block',
  fontSize: 10,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'var(--dim)',
  marginBottom: 6,
};

const field = { padding: '11px 12px', borderRadius: 11 };

export function CustomMatch({ onClose, onSave }) {
  const [form, setForm] = useState({
    home: '',
    away: '',
    competition: '',
    date: todayInputDate(),
    time: '15:00',
    homeScore: '',
    awayScore: '',
    note: '',
    rating: 0,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setError('');
  };

  const submit = async () => {
    if (!form.home.trim() || !form.away.trim()) return setError('Both sides need a name.');
    if (!form.date) return setError('Pick a date.');
    setBusy(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message || 'Could not save that.');
      setBusy(false);
    }
  };

  const seasonHint = form.date ? seasonIdFor(new Date(`${form.date}T15:00:00`)) : 'pick a date';

  return (
    <Modal onClose={onClose} maxWidth={500}>
      <ModalTitle onClose={onClose}>Add a custom match</ModalTitle>
      <div style={{ color: 'var(--dim)', fontSize: 13, marginBottom: 18 }}>
        It gets filed into season {seasonHint} automatically.
      </div>

      <div className="ws-pair" style={{ marginBottom: 12 }}>
        <div>
          <label htmlFor="cm-home" style={label}>Home</label>
          <input id="cm-home" className="ws-field ws-field--card" style={field} value={form.home}
            onChange={(e) => set({ home: e.target.value })} placeholder="Sidemen FC" />
        </div>
        <div>
          <label htmlFor="cm-away" style={label}>Away</label>
          <input id="cm-away" className="ws-field ws-field--card" style={field} value={form.away}
            onChange={(e) => set({ away: e.target.value })} placeholder="YouTube Allstars" />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label htmlFor="cm-comp" style={label}>Competition</label>
        <input id="cm-comp" className="ws-field ws-field--card" style={field} value={form.competition}
          onChange={(e) => set({ competition: e.target.value })} placeholder="Sidemen Charity Match" />
      </div>

      <div className="ws-pair ws-pair--wide" style={{ marginBottom: 12 }}>
        <div>
          <label htmlFor="cm-date" style={label}>Date</label>
          <input id="cm-date" type="date" className="ws-field ws-field--card" style={field} value={form.date}
            onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div>
          <label htmlFor="cm-time" style={label}>Kick-off</label>
          <input id="cm-time" type="time" className="ws-field ws-field--card" style={field} value={form.time}
            onChange={(e) => set({ time: e.target.value })} />
        </div>
      </div>

      <div className="ws-pair" style={{ marginBottom: 12 }}>
        <div>
          <label htmlFor="cm-hs" style={label}>Home goals</label>
          <input id="cm-hs" type="number" min="0" className="ws-field ws-field--card" style={field} value={form.homeScore}
            onChange={(e) => set({ homeScore: e.target.value })} placeholder="–" />
        </div>
        <div>
          <label htmlFor="cm-as" style={label}>Away goals</label>
          <input id="cm-as" type="number" min="0" className="ws-field ws-field--card" style={field} value={form.awayScore}
            onChange={(e) => set({ awayScore: e.target.value })} placeholder="–" />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 7 }}>
          <span style={{ ...label, marginBottom: 0 }}>Rating (optional)</span>
          <span style={{ fontSize: 11.5, color: 'var(--dim2)' }}>{ratingText(form.rating)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Stars value={form.rating} onChange={(rating) => set({ rating })} size={44} flex />
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label htmlFor="cm-note" style={label}>Note (optional)</label>
        <input id="cm-note" className="ws-field ws-field--card" style={field} value={form.note}
          onChange={(e) => set({ note: e.target.value })} placeholder="Freezing. Chips were elite." />
      </div>

      {error && (
        <div role="alert" style={{ color: 'var(--neg)', fontSize: 12.5, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <button type="button" className="ws-primary" onClick={submit} disabled={busy}
        style={{ width: '100%', padding: 14, fontSize: 15 }}>
        <i className="ph-fill ph-check-circle" style={{ fontSize: 18 }} />
        {busy ? 'Saving…' : 'Add & mark watched'}
      </button>
    </Modal>
  );
}
