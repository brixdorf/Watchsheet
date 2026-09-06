import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Modal, ModalTitle } from './Modal.jsx';
import { Eyebrow, Spinner } from './layout.jsx';

/**
 * Where the data comes from, and what it costs.
 *
 * The free tier allows 100 requests a day, so the spend is worth being able to see rather
 * than something you have to read server logs to discover.
 */
export function SyncPanel({ onClose }) {
  const [status, setStatus] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .syncStatus()
      .then((s) => live && setStatus(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  return (
    <Modal onClose={onClose} maxWidth={460}>
      <ModalTitle onClose={onClose}>Data &amp; sync</ModalTitle>
      <div style={{ color: 'var(--dim)', fontSize: 13, marginBottom: 18 }}>
        Fixtures sync in the background. Nothing you do in the app calls the provider.
      </div>

      {failed && <div style={{ color: 'var(--neg)', fontSize: 13 }}>Could not read the sync status.</div>}
      {!status && !failed && <Spinner label="Reading status" />}

      {status && (
        <>
          <Eyebrow>Today's requests</Eyebrow>
          <div className="ws-card" style={{ padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}>
                {status.budget.spent}
              </div>
              <div style={{ fontSize: 13, color: 'var(--dim)' }}>of {status.budget.budget} budgeted</div>
            </div>
            <Meter value={status.budget.spent} max={status.budget.budget} />
            <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 9 }}>
              {status.budget.remaining} left today
              {status.budget.providerRemaining != null &&
                ` · provider reports ${status.budget.providerRemaining}/${status.budget.providerLimit}`}
            </div>
          </div>

          <Eyebrow>Catalog</Eyebrow>
          <div className="ws-card" style={{ padding: 14, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Line label="Competitions" value={`${status.seed.competitions.resolved} available`} />
            <Line label="Teams" value={`${status.seed.teams.resolved} available`} />
            <Line
              label="Seeding"
              value={status.seed.complete ? 'complete' : `in progress — ${status.seed.leagueCatalog.fetched}/${status.seed.leagueCatalog.total}`}
            />
          </div>

          <Eyebrow>Fixtures</Eyebrow>
          <div className="ws-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Line label="Matches held" value={status.fixtures.matches.toLocaleString()} />
            <Line label="Added by you" value={status.fixtures.customMatches} />
            {status.fixtures.earliest && (
              <Line label="Covering" value={`${status.fixtures.earliest} → ${status.fixtures.latest}`} />
            )}
            <Line
              label="Season rotation"
              value={
                status.fixtures.rotation.neverSynced
                  ? `${status.fixtures.rotation.tracked - status.fixtures.rotation.neverSynced}/${status.fixtures.rotation.tracked} pulled`
                  : `all ${status.fixtures.rotation.tracked} pulled`
              }
            />
            {status.lastRun && (
              <Line
                label="Last run"
                value={`${status.lastRun.job} · ${status.lastRun.spent ?? 0} requests`}
              />
            )}
          </div>

          {!status.seed.complete && (
            <div style={{ fontSize: 12.5, color: 'var(--dim)', marginTop: 14, lineHeight: 1.45 }}>
              Seeding resumes automatically each hour and picks up where it stopped, so it
              finishes without ever exceeding a day's allowance.
            </div>
          )}
        </>
      )}
    </Modal>
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
      <div style={{ height: 6, width: `${pct}%`, borderRadius: 4, background: pct > 85 ? 'var(--warn)' : 'var(--accent)' }} />
    </div>
  );
}
