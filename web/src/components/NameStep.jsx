import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { animateScreen } from '../lib/anim.js';
import { Eyebrow } from './layout.jsx';

/**
 * The first step after a code is accepted: what to call you.
 *
 * It lives here rather than on the sign-in screen because a name belongs to an account, and
 * until the code comes back there is no account. An account with no name is the signal that
 * this step is owed, derived live the same way the follow picker is derived from having no
 * follows. Nothing is persisted to say the step was seen, so abandoning it means being asked
 * again next time, which is the honest outcome.
 *
 * Two characters is the floor the server enforces on PATCH /auth/me, restated here so the
 * button is disabled rather than the request refused.
 */

const MIN = 2;
const MAX = 80;

export function NameStep({ onNamed }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    animateScreen(rootRef.current);
    // After the entrance, or the caret lands mid-animation.
    const t = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(t);
  }, []);

  const trimmed = name.trim();
  const ready = trimmed.length >= MIN && !busy;

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.updateProfile(trimmed);
      onNamed(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that. Try again.');
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'radial-gradient(120% 90% at 50% -10%, var(--accent-soft), transparent 60%)',
        display: 'grid',
        placeItems: 'center',
        padding: '28px 20px calc(28px + env(safe-area-inset-bottom))',
      }}
    >
      <div ref={rootRef} style={{ width: '100%', maxWidth: 420 }}>
        <div data-anim="row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <img
            src="/logo.svg"
            alt=""
            className="ws-brand-logo"
            style={{ flex: 'none', borderRadius: 18, boxShadow: '0 10px 26px rgba(11,42,168,.4)' }}
          />
          <div style={{ minWidth: 0 }}>
            <Eyebrow style={{ marginBottom: 2 }}>You're in</Eyebrow>
            <div className="ws-picker-title" style={{ fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05 }}>
              What should we call you?
            </div>
          </div>
        </div>

        <div className="ws-card" data-anim="row" style={{ padding: 22 }}>
          <div style={{ color: 'var(--dim)', fontSize: 13.5, marginBottom: 18 }}>
            It goes on your account and nowhere else. You can change it any time from the
            account menu.
          </div>

          <label htmlFor="ws-yourname" style={labelStyle}>Name</label>
          <input
            ref={inputRef}
            id="ws-yourname"
            className="ws-field"
            type="text"
            autoComplete="name"
            maxLength={MAX}
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="Sam Okoye"
            style={{ marginBottom: 8 }}
          />

          {error && (
            <div
              role="alert"
              style={{ color: 'var(--neg)', fontSize: 12.5, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <i className="ph-fill ph-warning-circle" />
              {error}
            </div>
          )}

          <button
            type="button"
            className="ws-primary"
            onClick={save}
            disabled={!ready}
            style={{ width: '100%', marginTop: 10, padding: 14, fontSize: 15.5 }}
          >
            <i className={busy ? 'ph ph-circle-notch ws-spin' : 'ph-bold ph-arrow-right'} />
            {busy ? 'Saving…' : 'Continue'}
          </button>

          <div style={{ color: 'var(--dim2)', fontSize: 11.5, marginTop: 10, textAlign: 'center' }}>
            Two characters or more.
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontFamily: 'Barlow, system-ui, sans-serif',
  fontSize: 10.5,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'var(--dim)',
  marginBottom: 7,
};
