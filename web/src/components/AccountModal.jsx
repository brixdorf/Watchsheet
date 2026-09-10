import { useState } from 'react';
import { api } from '../lib/api.js';
import { Modal, ModalTitle } from './Modal.jsx';
import { Eyebrow } from './layout.jsx';

/**
 * Account details. One field for now, which is the one that was missing: the name is
 * collected once at sign-up and there was no way to change it afterwards.
 *
 * The email is shown but not editable. It is the identity a sign-in code is sent to, so
 * changing it is a different job from correcting a typo in a display name.
 */
export function AccountModal({ user, onSaved, onClose }) {
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const trimmed = name.trim();
  const unchanged = trimmed === user.name;
  const canSave = trimmed.length >= 2 && !unchanged && !saving;

  const submit = (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError('');
    api
      .updateProfile(trimmed)
      .then((r) => {
        onSaved(r.user);
        setSaved(true);
      })
      .catch((err) => setError(err.message || 'That did not save.'))
      .finally(() => setSaving(false));
  };

  return (
    <Modal onClose={onClose} maxWidth={420}>
      <ModalTitle onClose={onClose}>Your account</ModalTitle>
      <div style={{ color: 'var(--dim)', fontSize: 13, marginBottom: 18 }}>
        What Watchsheet calls you, and where your sign-in codes go.
      </div>

      <form onSubmit={submit}>
        <Eyebrow>Name</Eyebrow>
        <input
          className="ws-field"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
            setError('');
          }}
          maxLength={80}
          aria-label="Your name"
          autoFocus
          style={{ marginBottom: 6 }}
        />
        <div style={{ fontSize: 12, color: error ? 'var(--neg)' : 'var(--dim)', minHeight: 17, marginBottom: 16 }}>
          {error || (saved && !error ? 'Saved.' : 'Two characters or more.')}
        </div>

        <Eyebrow>Email</Eyebrow>
        <div
          style={{
            padding: '12px 13px',
            borderRadius: 11,
            background: 'var(--card2)',
            border: '1px solid var(--line)',
            fontSize: 14,
            color: 'var(--dim)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 20,
          }}
        >
          {user.email}
        </div>

        <button
          type="submit"
          className="ws-primary"
          disabled={!canSave}
          style={{ width: '100%', padding: '12px 16px', borderRadius: 12, fontSize: 15, opacity: canSave ? 1 : 0.5 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Modal>
  );
}
