import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { animateScreen } from '../lib/anim.js';
import { Crest } from './Crest.jsx';
import { Eyebrow, Spinner } from './layout.jsx';

/**
 * The last step of signing up: choose what shows up in your feed.
 *
 * Competitions being played lead, then the rest by rough worldwide popularity, so the names
 * most people are looking for come first. Every card is the same size: the order carries the
 * emphasis, and nothing here should suggest one side is a better answer than another.
 *
 * Nothing is pre-selected. An account starts with whatever its owner picks, and following a
 * side only puts its fixtures in the feed. It never marks anything watched.
 */

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

  const toggle = (apply) => (id) =>
    apply((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
    if (!total) return 'Pick as many as you like, or skip and add them later.';
    const bits = [];
    if (comps.size) bits.push(`${comps.size} competition${comps.size === 1 ? '' : 's'}`);
    if (teams.size) bits.push(`${teams.size} team${teams.size === 1 ? '' : 's'}`);
    return bits.join(' · ');
  }, [comps.size, teams.size, total]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'radial-gradient(120% 90% at 50% -10%, var(--accent-soft), transparent 60%)',
        paddingBottom: 96,
      }}
    >
      <div ref={rootRef} style={{ maxWidth: 880, margin: '0 auto', padding: '28px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <img
            src="/logo.svg"
            alt=""
            style={{ width: 62, height: 62, flex: 'none', borderRadius: 18, boxShadow: '0 10px 26px rgba(11,42,168,.4)' }}
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
            <Group
              title="Competitions"
              sub="Leagues, cups and tournaments."
              items={data.competitions}
              selected={comps}
              onToggle={toggle(setComps)}
            />
            <Group
              title="Teams"
              sub="Clubs and national sides."
              items={data.teams}
              selected={teams}
              onToggle={toggle(setTeams)}
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
            {total > 0 && (
              <button
                type="button"
                className="ws-quiet"
                onClick={() => {
                  setTeams(new Set());
                  setComps(new Set());
                }}
                style={{ padding: '10px 14px', borderRadius: 11, fontSize: 13.5 }}
              >
                Clear
              </button>
            )}
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
          gridAutoRows: '1fr',
          gap: 10,
        }}
      >
        {items.map((item) => (
          <Pick key={item.id} item={item} on={selected.has(item.id)} onClick={() => onToggle(item.id)} />
        ))}
      </div>
    </div>
  );
}

function Pick({ item, on, onClick }) {
  return (
    <button
      type="button"
      data-anim="row"
      onClick={onClick}
      aria-pressed={on}
      className="ws-pop"
      style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        gap: 9,
        height: '100%',
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
        <div
          style={{
            fontWeight: 700,
            fontSize: 14.5,
            lineHeight: 1.2,
            // Always two lines tall, wrapped or not, so a card in the Teams grid is exactly as
            // big as one in the Competitions grid.
            minHeight: '2.4em',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
          title={item.name}
        >
          {item.name}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--dim)', marginTop: 2 }}>
          {item.isNational === true ? 'National side' : item.isNational === false ? 'Club' : item.country || 'International'}
        </div>
      </div>
    </button>
  );
}
