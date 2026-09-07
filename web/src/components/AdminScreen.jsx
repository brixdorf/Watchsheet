import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { fmtDateShort } from '../lib/format.js';
import { Eyebrow, EmptyNote, SectionHeading, Spinner } from './layout.jsx';

/**
 * The admin screen — owner only, and the only place provider spend is visible.
 *
 * It exists because two things were in the wrong hands: the request budget was shown to
 * every signed-in user, and running a sync meant shell access to the server. Both belong
 * here, behind ADMIN_EMAILS.
 */

const JOBS = [
  ['auto', 'Auto', 'Seeding if unfinished, otherwise scores then rotation.'],
  ['sync', 'Fixtures', 'Refresh recent scores, then advance the season rotation.'],
  ['seed', 'Catalog', 'Resolve any teams and competitions still pending.'],
];

const CAPS = [2, 6, 12, 25];

function ago(ts) {
  if (!ts) return 'never';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function until(ts) {
  if (!ts) return '—';
  const mins = Math.max(0, Math.round((ts - Date.now()) / 60000));
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

export function AdminScreen({ onClose, onFlash }) {
  const [status, setStatus] = useState(null);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');

  const [job, setJob] = useState('auto');
  const [cap, setCap] = useState(6);
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, o, u] = await Promise.all([api.syncStatus(), api.adminOverview(), api.adminUsers()]);
      setStatus(s);
      setOverview(o);
      setUsers(u);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the admin data.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await api.runSync(job, cap);
      const spent = res.result?.spent ?? 0;
      onFlash(
        res.result?.skipped
          ? `Nothing to do — ${res.result.skipped}.`
          : `${res.result?.job ?? 'sync'} finished · ${spent} request${spent === 1 ? '' : 's'} spent`,
        res.result?.skipped ? 'warn' : 'accent',
      );
      await load();
    } catch (err) {
      onFlash(err instanceof ApiError ? err.message : 'Could not start the sync.', 'negative');
    } finally {
      setRunning(false);
    }
  };

  const revoke = async (user) => {
    try {
      const res = await api.revokeSessions(user.id);
      onFlash(`Signed ${user.name} out of ${res.revoked} session${res.revoked === 1 ? '' : 's'}`);
      await load();
    } catch (err) {
      onFlash(err instanceof ApiError ? err.message : 'Could not revoke that.', 'negative');
    }
  };

  const remove = async (user) => {
    try {
      await api.deleteUser(user.id);
      onFlash(`Deleted ${user.email}`);
      setConfirming(null);
      await load();
    } catch (err) {
      onFlash(err instanceof ApiError ? err.message : 'Could not delete that account.', 'negative');
    }
  };

  const ready = status && overview && users;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          className="ws-chip"
          aria-label="Back"
          onClick={onClose}
          style={{ width: 36, height: 36, flex: 'none', display: 'grid', placeItems: 'center', fontSize: 16 }}
        >
          <i className="ph-bold ph-arrow-left" />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Eyebrow style={{ marginBottom: 3 }}>Owner only</Eyebrow>
          <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05 }}>Admin</div>
          <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>
            Provider spend, the sync schedule, and everyone who has signed up.
          </div>
        </div>
        <button
          type="button"
          className="ws-quiet"
          onClick={load}
          style={{ padding: '8px 12px', borderRadius: 10, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}
        >
          <i className="ph ph-arrow-clockwise" style={{ fontSize: 14 }} /> Refresh
        </button>
      </div>

      {error && (
        <div className="ws-card" style={{ padding: 14, color: 'var(--neg)', fontSize: 13.5, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {!ready && !error && <Spinner label="Reading the install" />}

      {ready && (
        <>
          <div
            data-anim="row"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
              gap: 9,
              marginBottom: 26,
            }}
          >
            <Tile label="Accounts" value={overview.users} icon="ph ph-users" />
            <Tile label="Live sessions" value={overview.activeSessions} icon="ph ph-key" />
            <Tile label="Matches logged" value={overview.watched} icon="ph ph-check-circle" />
            <Tile label="With notes" value={overview.notes} icon="ph ph-note-pencil" />
            <Tile label="Custom matches" value={overview.customMatches} icon="ph ph-plus-circle" />
            <Tile label="Fixtures held" value={overview.matches.toLocaleString()} icon="ph ph-calendar-blank" />
            <Tile label="Teams" value={overview.teams.toLocaleString()} icon="ph ph-shield" />
            <Tile label="Competitions" value={overview.competitions} icon="ph ph-trophy" />
          </div>

          <SectionHeading
            title="Provider budget"
            sub="The free tier allows 100 requests a day. Nothing a user does in the app spends one."
            meta={`${status.budget.day} UTC`}
          />
          <div data-anim="row" className="ws-card" style={{ padding: 16, marginBottom: 26 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <div
                data-anim="num"
                style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}
              >
                {status.budget.spent}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--dim)' }}>of {status.budget.budget} budgeted</div>
            </div>
            <Meter value={status.budget.spent} max={status.budget.budget} />
            <div style={{ fontSize: 12.5, color: 'var(--dim)', marginTop: 10 }}>
              {status.budget.remaining} left today
              {status.budget.providerRemaining != null &&
                ` · provider reports ${status.budget.providerRemaining}/${status.budget.providerLimit}`}
            </div>
          </div>

          <SectionHeading
            title="Sync"
            sub="Runs on its own every hour. This is the same job, on demand."
            meta={status.schedule.enabled ? 'Scheduled' : 'Disabled'}
          />
          <div data-anim="row" className="ws-card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
              <Line
                label="Schedule"
                value={
                  status.schedule.enabled
                    ? `hourly · ${status.schedule.slicePerTick} requests a tick`
                    : 'off'
                }
              />
              <Line label="Next run" value={status.schedule.nextRun ? until(status.schedule.nextRun) : '—'} />
              <Line
                label="Last run"
                value={
                  status.lastRun
                    ? `${status.lastRun.job} · ${status.lastRun.spent ?? 0} requests · ${ago(status.lastRun.at)}`
                    : 'not yet this boot'
                }
              />
              <Line label="Currently running" value={status.schedule.running ? 'yes' : 'no'} />
            </div>

            <Eyebrow>Run now</Eyebrow>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
              {JOBS.map(([id, text, hint]) => (
                <button
                  key={id}
                  type="button"
                  title={hint}
                  onClick={() => setJob(id)}
                  aria-pressed={job === id}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 9,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    background: job === id ? 'var(--accent)' : 'var(--card2)',
                    color: job === id ? 'var(--accent-ink)' : 'var(--fg)',
                    border: `1px solid ${job === id ? 'var(--accent)' : 'var(--line)'}`,
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--dim)', marginBottom: 12 }}>
              {JOBS.find(([id]) => id === job)?.[2]}
            </div>

            <Eyebrow>Spend at most</Eyebrow>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
              {CAPS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCap(n)}
                  aria-pressed={cap === n}
                  style={{
                    minWidth: 42,
                    padding: '7px 10px',
                    borderRadius: 9,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    background: cap === n ? 'var(--card2)' : 'transparent',
                    color: cap === n ? 'var(--accent-txt)' : 'var(--dim)',
                    border: `1px solid ${cap === n ? 'var(--line2)' : 'var(--line)'}`,
                  }}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                className="ws-primary"
                onClick={runNow}
                disabled={running || status.budget.remaining < 1}
                style={{ marginLeft: 'auto', padding: '10px 16px', fontSize: 14 }}
              >
                <i className={running ? 'ph ph-circle-notch ws-spin' : 'ph-bold ph-play'} />
                {running ? 'Running…' : 'Run sync'}
              </button>
            </div>
            {status.budget.remaining < 1 && (
              <div style={{ fontSize: 12.5, color: 'var(--warn)', marginTop: 10 }}>
                Today&apos;s budget is spent. It resets at midnight UTC.
              </div>
            )}
          </div>

          <div
            data-anim="row"
            className="ws-card"
            style={{ padding: 16, marginBottom: 26, display: 'flex', flexDirection: 'column', gap: 7 }}
          >
            <Line label="Competitions resolved" value={status.seed.competitions.resolved} />
            <Line label="Teams resolved" value={status.seed.teams.resolved} />
            <Line
              label="Seeding"
              value={
                status.seed.complete
                  ? 'complete'
                  : `in progress — ${status.seed.leagueCatalog.fetched}/${status.seed.leagueCatalog.total}`
              }
            />
            <Line
              label="Season rotation"
              value={
                status.fixtures.rotation.neverSynced
                  ? `${status.fixtures.rotation.tracked - status.fixtures.rotation.neverSynced}/${status.fixtures.rotation.tracked} pulled`
                  : `all ${status.fixtures.rotation.tracked} pulled`
              }
            />
            {status.fixtures.earliest && (
              <Line label="Covering" value={`${status.fixtures.earliest} → ${status.fixtures.latest}`} />
            )}
          </div>

          <SectionHeading
            title="Accounts"
            sub={`Sessions last ${users.sessionTtlDays} days, then a fresh code is needed.`}
            meta={`${users.users.length} total`}
          />
          <div style={{ display: 'grid', gap: 9 }}>
            {users.users.map((u) => (
              <div key={u.id} data-anim="row" className="ws-card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{u.name}</div>
                  {u.admin && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '.07em',
                        textTransform: 'uppercase',
                        padding: '2px 7px',
                        borderRadius: 6,
                        background: 'var(--accent-soft)',
                        color: 'var(--accent-txt)',
                        border: '1px solid var(--accent)',
                      }}
                    >
                      Owner
                    </span>
                  )}
                  <div style={{ fontSize: 12.5, color: 'var(--dim)', marginLeft: 'auto' }}>
                    joined {fmtDateShort(u.createdAt)}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 10, wordBreak: 'break-all' }}>
                  {u.email}
                </div>

                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, marginBottom: 12 }}>
                  <Stat n={u.watched} label="logged" />
                  <Stat n={u.notes} label="notes" />
                  <Stat n={u.follows} label="follows" />
                  <Stat n={u.customMatches} label="custom" />
                  <Stat n={u.sessions} label={u.sessions === 1 ? 'session' : 'sessions'} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--dim2)' }}>
                    last seen {ago(u.lastLoginAt)}
                    {u.sessionExpiresAt ? ` · signs out ${until(u.sessionExpiresAt)}` : ' · signed out'}
                  </div>
                  <div style={{ display: 'flex', gap: 7, marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="ws-quiet"
                      onClick={() => revoke(u)}
                      disabled={!u.sessions}
                      style={{ padding: '6px 10px', borderRadius: 9, fontSize: 12.5 }}
                    >
                      Sign out
                    </button>
                    {!u.admin &&
                      (confirming === u.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => remove(u)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 9,
                              fontSize: 12.5,
                              fontWeight: 600,
                              cursor: 'pointer',
                              background: 'var(--neg)',
                              color: '#fff',
                              border: '1px solid var(--neg)',
                            }}
                          >
                            Delete everything
                          </button>
                          <button
                            type="button"
                            className="ws-quiet"
                            onClick={() => setConfirming(null)}
                            style={{ padding: '6px 10px', borderRadius: 9, fontSize: 12.5 }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ws-quiet"
                          onClick={() => setConfirming(u.id)}
                          style={{ padding: '6px 10px', borderRadius: 9, fontSize: 12.5, color: 'var(--neg)' }}
                        >
                          Delete
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            ))}
            {users.users.length === 0 && <EmptyNote>Nobody has signed up yet.</EmptyNote>}
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, icon }) {
  return (
    <div className="ws-card" style={{ padding: '13px 14px' }}>
      <i className={icon} style={{ fontSize: 16, color: 'var(--dim)' }} />
      <div
        data-anim="num"
        style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: '-.03em',
          fontVariantNumeric: 'tabular-nums',
          marginTop: 4,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--dim)' }}>{label}</div>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <span style={{ color: 'var(--dim)' }}>
      <strong style={{ color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{n}</strong> {label}
    </span>
  );
}

function Line({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13.5 }}>
      <span style={{ color: 'var(--dim)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Meter({ value, max }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div style={{ height: 6, borderRadius: 4, background: 'var(--card2)', overflow: 'hidden' }}>
      <div
        style={{ height: 6, width: `${pct}%`, borderRadius: 4, background: pct > 85 ? 'var(--warn)' : 'var(--accent)' }}
      />
    </div>
  );
}
