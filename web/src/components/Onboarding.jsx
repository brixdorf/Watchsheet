import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { animateScreen } from '../lib/anim.js';

/**
 * Sign-in: intro, then name and email, then the six-digit code.
 *
 * The code is real (hashed server-side, rate limited, five attempts). Only delivery is
 * local until a mail provider is configured. When it is local the server hands the code
 * back and it is shown here, which is what makes the whole flow usable today.
 */

const FEATURES = [
  ['ph ph-check-circle', 'One tap = watched', 'Notes and a 1–5 rating are optional, whenever.'],
  ['ph ph-heart', 'Follow teams & competitions', 'Their fixtures land in one feed, ready to tick off.'],
  ['ph ph-chart-bar', 'Season by season, forever', "Streaks, most-watched sides, and stats you didn't ask for."],
];

const label = {
  display: 'block',
  fontFamily: 'Barlow, system-ui, sans-serif',
  fontSize: 10.5,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'var(--dim)',
  marginBottom: 7,
};

const card = {
  background: 'var(--card)',
  border: '1px solid var(--line)',
  borderRadius: 20,
  padding: 24,
};

export function Onboarding({ onSignedIn }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resend, setResend] = useState(0);
  const [devCode, setDevCode] = useState(null);

  const rootRef = useRef(null);
  const cellsRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => animateScreen(rootRef.current), [step]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  /**
   * The cooldown is the server's to define, so the countdown is seeded from what it reports:
   * `resendInMs` when a code goes out, `retryAfterMs` when one is refused for being early.
   * The fallback only covers a response that carried neither.
   */
  const startCooldown = (seconds) => {
    clearInterval(timerRef.current);
    setResend(Math.max(1, Math.ceil(seconds ?? 30)));
    timerRef.current = setInterval(() => {
      setResend((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    setError('');
    if (name.trim().length < 2) return setError('Pop your name in first.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      return setError('That email does not look right.');
    }
    setBusy(true);
    try {
      const res = await api.requestCode(email.trim(), name.trim());
      setDevCode(res.devCode ?? null);
      setCode(['', '', '', '', '', '']);
      const cooldown = res.resendInMs != null ? res.resendInMs / 1000 : undefined;
      setStep(2);
      startCooldown(cooldown);
      setTimeout(() => cellsRef.current[0]?.focus(), 120);
    } catch (err) {
      if (err instanceof ApiError && err.payload?.retryAfterMs != null) {
        setStep(2);
        startCooldown(err.payload.retryAfterMs / 1000);
      }
      setError(err instanceof ApiError ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (resend > 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.requestCode(email.trim(), name.trim());
      setDevCode(res.devCode ?? null);
      setCode(['', '', '', '', '', '']);
      const cooldown = res.resendInMs != null ? res.resendInMs / 1000 : undefined;
      startCooldown(cooldown);
      setTimeout(() => cellsRef.current[0]?.focus(), 80);
    } catch (err) {
      // A 429 means the server is still counting; take its number rather than showing a
      // second, stale one beside the live button.
      if (err instanceof ApiError && err.payload?.retryAfterMs != null) {
        startCooldown(err.payload.retryAfterMs / 1000);
      }
      setError(err instanceof ApiError ? err.message : 'Could not resend the code.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code.join('')) => {
    if (value.length < 6) return setError('All six digits, please.');
    setBusy(true);
    setError('');
    try {
      const res = await api.verifyCode(email.trim(), value);
      clearInterval(timerRef.current);
      onSignedIn(res.user, res.followCount ?? 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That code is not right.');
      setCode(['', '', '', '', '', '']);
      cellsRef.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  const onCell = (index, raw) => {
    const digits = String(raw).replace(/\D/g, '');
    setError('');

    // A pasted code fills the row from wherever the cursor is.
    if (digits.length > 1) {
      const next = [...code];
      for (let i = 0; i < digits.length && index + i < 6; i++) next[index + i] = digits[i];
      setCode(next);
      const filled = next.join('');
      cellsRef.current[Math.min(5, index + digits.length)]?.focus();
      if (filled.length === 6) verify(filled);
      return;
    }

    const next = [...code];
    next[index] = digits.slice(-1);
    setCode(next);
    if (next[index]) {
      if (index < 5) cellsRef.current[index + 1]?.focus();
      else if (next.join('').length === 6) verify(next.join(''));
    }
  };

  return (
    <div
      ref={rootRef}
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '28px 20px',
        background: 'radial-gradient(120% 90% at 50% -10%, var(--accent-soft), transparent 60%)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26 }}>
          <img
            src="/logo.svg"
            alt=""
            style={{ width: 78, height: 78, flex: 'none', borderRadius: 20, boxShadow: '0 10px 26px rgba(11,42,168,.4)' }}
          />
          <div>
            <div style={{ fontWeight: 800, fontSize: 38, letterSpacing: '-.03em', lineHeight: 1 }}>Watchsheet</div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--accent-txt)',
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                marginTop: 3,
              }}
            >
              Your season, logged
            </div>
          </div>
        </div>

        {step === 0 && (
          <div data-anim="row" style={card}>
            <div style={{ fontSize: 29, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.08, marginBottom: 8 }}>
              Every match you watch,
              <br />
              on the record.
            </div>
            <div style={{ color: 'var(--dim)', fontSize: 14.5, marginBottom: 22 }}>
              A private logbook for football. One tap to mark a match watched. Notes and ratings only if you feel like it.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
              {FEATURES.map(([icon, title, sub]) => (
                <div key={title} style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 12, alignItems: 'start' }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: 'var(--card2)',
                      display: 'grid',
                      placeItems: 'center',
                      color: 'var(--accent-txt)',
                    }}
                  >
                    <i className={icon} style={{ fontSize: 19 }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
                    <div style={{ color: 'var(--dim)', fontSize: 13 }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="ws-primary" onClick={() => setStep(1)} style={{ width: '100%', padding: 14, fontSize: 15.5 }}>
              Get started <i className="ph-bold ph-arrow-right" />
            </button>
          </div>
        )}

        {step === 1 && (
          <div data-anim="row" style={card}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 4 }}>Sign in</div>
            <div style={{ color: 'var(--dim)', fontSize: 13.5, marginBottom: 20 }}>
              No password. We'll email you a six-digit code.
            </div>

            <label htmlFor="ws-name" style={label}>Name</label>
            <input
              id="ws-name"
              className="ws-field"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Sam Okoye"
              style={{ marginBottom: 16 }}
            />

            <label htmlFor="ws-email" style={label}>Email</label>
            <input
              id="ws-email"
              className="ws-field"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && sendCode()}
              placeholder="sam@example.com"
              style={{ marginBottom: 8 }}
            />

            {error && <ErrorLine>{error}</ErrorLine>}

            <button
              type="button"
              className="ws-primary"
              onClick={sendCode}
              disabled={busy}
              style={{ width: '100%', marginTop: 10, padding: 14, fontSize: 15.5 }}
            >
              <i className={busy ? 'ph ph-circle-notch ws-spin' : 'ph-bold ph-envelope-simple'} />
              {busy ? 'Sending…' : 'Send my code'}
            </button>
            <button
              type="button"
              className="ws-quiet"
              onClick={() => { setStep(0); setError(''); }}
              style={{ width: '100%', marginTop: 10, padding: 10, borderRadius: 11, fontSize: 13.5 }}
            >
              Back
            </button>
          </div>
        )}

        {step === 2 && (
          <div data-anim="row" style={card}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 4 }}>Check your inbox</div>
            <div style={{ color: 'var(--dim)', fontSize: 13.5, marginBottom: 20 }}>
              Six digits sent to <span style={{ color: 'var(--fg)' }}>{email.trim()}</span>.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 8, marginBottom: 14 }}>
              {code.map((value, i) => (
                <input
                  key={i}
                  ref={(el) => { cellsRef.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={6}
                  aria-label={`Digit ${i + 1}`}
                  value={value}
                  onChange={(e) => onCell(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !code[i] && i > 0) cellsRef.current[i - 1]?.focus();
                    if (e.key === 'Enter') verify();
                  }}
                  className="ws-field"
                  style={{ padding: '13px 0', textAlign: 'center', fontSize: 21, fontWeight: 700 }}
                />
              ))}
            </div>

            {devCode && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 11,
                  background: 'var(--accent-soft)',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent-txt)',
                  fontSize: 12.5,
                  marginBottom: 12,
                }}
              >
                <i className="ph-fill ph-wrench" style={{ fontSize: 15 }} />
                <span>
                  No mail provider configured, so the code stays local:{' '}
                  <strong style={{ letterSpacing: '.18em' }}>{devCode}</strong>
                </span>
              </div>
            )}

            {error && <ErrorLine>{error}</ErrorLine>}

            <button
              type="button"
              className="ws-primary"
              onClick={() => verify()}
              disabled={busy}
              style={{ width: '100%', padding: 14, fontSize: 15.5 }}
            >
              {busy ? 'Checking…' : 'Verify & start'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="ws-quiet"
                onClick={() => { setStep(1); setError(''); setCode(['', '', '', '', '', '']); }}
                style={{ fontSize: 13, padding: '4px 0' }}
              >
                Wrong email?
              </button>
              <button
                type="button"
                onClick={resendCode}
                disabled={resend > 0 || busy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1px solid ${resend > 0 ? 'var(--line)' : 'var(--line2)'}`,
                  background: 'var(--card2)',
                  fontFamily: 'Barlow, system-ui, sans-serif',
                  fontSize: 12.5,
                  fontWeight: 600,
                  letterSpacing: '.03em',
                  cursor: resend > 0 ? 'not-allowed' : 'pointer',
                  color: resend > 0 ? 'var(--dim2)' : 'var(--fg)',
                }}
              >
                <i className="ph ph-arrow-clockwise" style={{ fontSize: 14 }} />
                {resend > 0 ? `Resend in ${resend}s` : 'Resend code'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorLine({ children }) {
  return (
    <div
      role="alert"
      style={{ color: 'var(--neg)', fontSize: 12.5, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}
    >
      <i className="ph-fill ph-warning-circle" />
      {children}
    </div>
  );
}
