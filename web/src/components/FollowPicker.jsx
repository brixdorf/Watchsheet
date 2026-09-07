import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { animateScreen } from '../lib/anim.js';
import { Crest } from './Crest.jsx';
import { Eyebrow, Spinner } from './layout.jsx';

/**
 * The last step of signing up: choose what shows up in your feed.
 *
 * Ordering is rough worldwide popularity, and the first few of each list are drawn larger,
 * so the names most people are looking for are both first and most prominent. Nothing is
 * pre-selected — an account starts with whatever its owner picks, and following a side only
 * puts its fixtures in the feed. It never marks anything watched.
 */

const FEATURED = 5;
const QUICK_PICK = 8;

export function FollowPicker({ name, onDone }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [teams, setTeams] = useState(() => new Set());
  const [comps, setComps] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const rootRef = useRef(null);

  useEffect(() => {
    api
      .suggestions()
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (data) return animateScreen(rootRef.current);
    return undefined;
  }, [data]);

  const total = teams.size + comps.size;

  const toggle = (set, apply) => (id) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const quickPick = () => {
    setComps(new Set((data?.competitions ?? []).slice(0, QUICK_PICK).map((c) => c.id)));
    setTeams(new Set((data?.teams ?? []).slice(0, QUICK_PICK).map((t) => t.id)));
  };

  const save = async (skip = false) => {
    if (skip) return onDone(0);
    setBusy(true);
    try {
      const res = await api.followMany([...teams], [...comps]);
      onDone(res.following);
    } catch (err) {
      setBusy(false);
      onDone(0, err instanceof ApiError ? err.message : 'Could not save those follows.');
    }
  };

  const summary = useMemo(() => {
    if (!total) return 'Pick as many as you like — or skip and add them later.';
    const bits = [];
    if (comps.size) bits.push(`${comps.size} competition${comps.size === 1 ? '' : 's'}`);
    if (teams.size) bits.push(`${teams.size} team${teams.size === 1 ? '' : 's'}`);
    return bits.join(' · ');
  }, [comps.size, teams.size, total]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(120% 90% at 50% -10%, var(--accent-soft), transparent 60%)',
        paddingBottom: 96,
      }}
    >
      <div ref={rootRef} style={{ maxWidth: 880, margin: '0 auto', padding: '28px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <img
            src="/logo.svg"
            alt=""
            style={{ width: 56, height: 56, flex: 'none', borderRadius: 16, boxShadow: '0 10px 26px rgba(11,42,168,.4)' }}
          />
          <div style={{ minWidth: 0 }}>
            <Eyebrow style={{ marginBottom: 2 }}>Last step{name ? `, ${name}` : ''}</Eyebrow>
            <div style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-.03em', lineHeight: 1.05 }}>
              Who are you following?
            </div>
          </div>
        </div>

        <div style={{ color: 'var(--dim)', fontSize: 14.5, marginBottom: 20, maxWidth: 560 }}>
          This decides whose fixtures land in your feed. It does not mark anything watched, and
          you can change it whenever you like from the Following tab.
        </div>

        {failed && (
          <div className="ws-card" style={{ padding: 16, color: 'var(--neg)', fontSize: 13.5 }}>
            Could not load the suggestions.{' '}
            <button type="button" className="ws-quiet" onClick={() => onDone(0)} style={{ fontSize: 13.5 }}>
              Carry on anyway
            </button>
          </div>
        )}
        {!data && !failed && <Spinner label="Finding the big names" />}

        {data && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 26 }}>
              <button
                type="button"
                className="ws-quiet"
                onClick={quickPick}
                style={{ padding: '8px 13px', borderRadius: 10, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}
              >
                <i className="ph ph-sparkle" style={{ fontSize: 15 }} /> Pick the popular ones
              </button>
              {total > 0 && (
                <button
                  type="button"
                  className="ws-quiet"
                  onClick={() => {
                    setTeams(new Set());
                    setComps(new Set());
                  }}
                  style={{ padding: '8px 13px', borderRadius: 10, fontSize: 13 }}
                >
                  Clear
                </button>
              )}
            </div>

            <Group
              title="Competitions"
              sub="Leagues, cups and tournaments."
              items={data.competitions}
              selected={comps}
              onToggle={toggle(comps, setComps)}
            />
            <Group
              title="Teams"
              sub="Clubs and national sides."
              items={data.teams}
              selected={teams}
              onToggle={toggle(teams, setTeams)}
            />
          </>
        )}
      </div>

      {data && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 30,
            background: 'var(--bg2)',
            borderTop: '1px solid var(--line)',
          }}
        >
          <div
            style={{
              maxWidth: 880,
              margin: '0 auto',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--dim)', minWidth: 0, flex: 1 }}>{summary}</div>
            <button
              type="button"
              className="ws-quiet"
              onClick={() => save(true)}
              disabled={busy}
              style={{ padding: '10px 14px', borderRadius: 11, fontSize: 13.5 }}
            >
              Skip for now
            </button>
            <button
              type="button"
              className="ws-primary"
              onClick={() => save(false)}
              disabled={busy || total === 0}
              style={{ padding: '11px 18px', fontSize: 14.5 }}
            >
              <i className={busy ? 'ph ph-circle-notch ws-spin' : 'ph-bold ph-check'} />
              {busy ? 'Saving…' : `Follow ${total || ''}`.trim()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, sub, items, selected, onToggle }) {
  const featured = items.slice(0, FEATURED);
  const rest = items.slice(FEATURED);

  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>{sub}</div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))',
          gap: 10,
          marginBottom: rest.length ? 10 : 0,
        }}
      >
        {featured.map((item) => (
          <BigPick key={item.id} item={item} on={selected.has(item.id)} onClick={() => onToggle(item.id)} />
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {rest.map((item) => (
          <SmallPick key={item.id} item={item} on={selected.has(item.id)} onClick={() => onToggle(item.id)} />
        ))}
      </div>
    </div>
  );
}

function BigPick({ item, on, onClick }) {
  return (
    <button
      type="button"
      data-anim="row"
      onClick={onClick}
      aria-pressed={on}
      className="ws-pop"
      style={{
        display: 'grid',
        gap: 9,
        padding: '15px 13px',
        borderRadius: 16,
        cursor: 'pointer',
        textAlign: 'left',
        background: on ? 'var(--accent-soft)' : 'var(--card)',
        border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
        color: 'var(--fg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Crest crest={item.crest} short={item.short} color={item.color} name={item.name} size={44} radius={13} fontSize={14} />
        <i
          className={on ? 'ph-fill ph-check-circle' : 'ph ph-plus-circle'}
          style={{ fontSize: 20, color: on ? 'var(--accent-txt)' : 'var(--dim2)' }}
        />
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.2 }}>{item.name}</div>
        <div style={{ fontSize: 11.5, color: 'var(--dim)', marginTop: 2 }}>
          {item.isNational === true ? 'National side' : item.isNational === false ? 'Club' : item.country || 'International'}
        </div>
      </div>
    </button>
  );
}

function SmallPick({ item, on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px 7px 8px',
        borderRadius: 11,
        cursor: 'pointer',
        fontSize: 13.5,
        fontWeight: 600,
        background: on ? 'var(--accent-soft)' : 'var(--card)',
        border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
        color: on ? 'var(--accent-txt)' : 'var(--fg)',
      }}
    >
      <Crest crest={item.crest} short={item.short} color={item.color} name={item.name} size={24} radius={8} fontSize={9} />
      {item.name}
      <i className={on ? 'ph-fill ph-check' : 'ph ph-plus'} style={{ fontSize: 13, opacity: on ? 1 : 0.5 }} />
    </button>
  );
}
