import { useEffect, useRef, useState } from 'react';
import { initialsOf } from '../lib/format.js';

const THEMES = [
  ['light', 'ph ph-sun', 'Light'],
  ['dark', 'ph ph-moon', 'Dark'],
  ['system', 'ph ph-desktop', 'System'],
];

const TABS = [
  ['home', 'Home', 'ph ph-house'],
  ['search', 'Search', 'ph ph-magnifying-glass'],
  ['following', 'Following', 'ph ph-heart'],
  ['history', 'History', 'ph ph-clock-counter-clockwise'],
  ['stats', 'Stats', 'ph ph-chart-bar'],
];

/** Closes a popover on outside click and on Escape. */
function useDismiss(open, close) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);
}

const pill = (active) =>
  active
    ? { background: 'var(--accent)', color: 'var(--accent-ink)', border: '1px solid var(--accent)' }
    : { background: 'var(--card)', color: 'var(--fg)', border: '1px solid var(--line)' };

export function Header({
  user,
  tab,
  onTab,
  theme,
  onTheme,
  season,
  seasons,
  onSeason,
  onOpenExport,
  onOpenCustom,
  onOpenSync,
  onLogout,
}) {
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeAll = useRef(() => {});
  closeAll.current = () => {
    setSeasonOpen(false);
    setMenuOpen(false);
  };
  useDismiss(seasonOpen || menuOpen, () => closeAll.current());

  const seasonLabel = season === 'all' ? 'All seasons' : season;

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'var(--bg2)', borderBottom: '1px solid var(--line)' }}>
      <div
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          padding: '11px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 'auto', minWidth: 0 }}>
          <img src="/logo.svg" alt="" style={{ width: 48, height: 48, flex: 'none', borderRadius: 14 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 25, letterSpacing: '-.03em', lineHeight: 1.05 }}>Watchsheet</div>
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--accent-txt)',
                letterSpacing: '.11em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              Your season, logged
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: 3,
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 11,
          }}
        >
          {THEMES.map(([id, icon, title]) => (
            <button
              key={id}
              type="button"
              title={title}
              aria-label={title}
              aria-pressed={theme === id}
              onClick={() => onTheme(id)}
              style={{
                width: 31,
                height: 27,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                fontSize: 15,
                background: theme === id ? 'var(--card2)' : 'transparent',
                color: theme === id ? 'var(--accent-txt)' : 'var(--dim2)',
              }}
            >
              <i className={icon} />
            </button>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="ws-chip"
            onClick={() => { setSeasonOpen((v) => !v); setMenuOpen(false); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px' }}
          >
            <i className="ph ph-calendar-blank" style={{ fontSize: 15, color: 'var(--dim)' }} />
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-.01em' }}>{seasonLabel}</span>
            <i className="ph ph-caret-down" style={{ fontSize: 12, color: 'var(--dim)' }} />
          </button>
          {seasonOpen && (
            <>
              <Scrim onClick={() => closeAll.current()} />
              <Popover>
                {[...seasons, { id: 'all', label: 'All seasons', logged: null }].map((s) => {
                  const active = s.id === season;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="ws-menu-item"
                      onClick={() => { onSeason(s.id); closeAll.current(); }}
                      style={{
                        justifyContent: 'space-between',
                        background: active ? 'var(--card2)' : 'transparent',
                        color: active ? 'var(--accent-txt)' : 'var(--fg)',
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 14 }}>
                        {s.label ?? `${s.id}${s.current ? ' · current' : ''}`}
                      </span>
                      {s.logged != null && (
                        <span style={{ fontSize: 11, color: 'var(--dim)' }}>{s.logged} logged</span>
                      )}
                    </button>
                  );
                })}
              </Popover>
            </>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="ws-chip"
            aria-label="Account menu"
            onClick={() => { setMenuOpen((v) => !v); setSeasonOpen(false); }}
            style={{ width: 36, height: 36, fontWeight: 700, fontSize: 13, color: 'var(--accent-txt)' }}
          >
            {initialsOf(user.name)}
          </button>
          {menuOpen && (
            <>
              <Scrim onClick={() => closeAll.current()} />
              <Popover width={230}>
                <div style={{ padding: '9px 10px 11px', borderBottom: '1px solid var(--line)', marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.email}
                  </div>
                </div>
                <button type="button" className="ws-menu-item" onClick={() => { onOpenExport(); closeAll.current(); }}>
                  <i className="ph ph-download-simple" style={{ fontSize: 16, color: 'var(--dim)' }} /> Export history
                </button>
                <button type="button" className="ws-menu-item" onClick={() => { onOpenSync(); closeAll.current(); }}>
                  <i className="ph ph-cloud-arrow-down" style={{ fontSize: 16, color: 'var(--dim)' }} /> Data &amp; sync
                </button>
                <button
                  type="button"
                  className="ws-menu-item"
                  onClick={() => { closeAll.current(); onLogout(); }}
                  style={{ color: 'var(--neg)' }}
                >
                  <i className="ph ph-sign-out" style={{ fontSize: 16 }} /> Log out
                </button>
              </Popover>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          padding: '0 16px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div className="ws-strip" style={{ gap: 5, flex: 1, minWidth: 0 }}>
          {TABS.map(([id, text, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 13px',
                borderRadius: 10,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontWeight: 600,
                fontSize: 13.5,
                transition: 'background .15s ease',
                ...pill(tab === id),
              }}
            >
              <i className={icon} style={{ fontSize: 16 }} />
              {text}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ws-dashed"
          onClick={onOpenCustom}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '8px 13px',
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 13.5,
            whiteSpace: 'nowrap',
          }}
        >
          <i className="ph-bold ph-plus" style={{ fontSize: 14 }} /> Custom match
        </button>
      </div>
    </div>
  );
}

const Scrim = ({ onClick }) => <div onClick={onClick} style={{ position: 'fixed', inset: 0, zIndex: 44 }} />;

function Popover({ children, width = 200 }) {
  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 'calc(100% + 6px)',
        minWidth: width,
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        borderRadius: 13,
        padding: 6,
        boxShadow: '0 18px 40px rgba(0,0,0,.35)',
        zIndex: 50,
      }}
    >
      {children}
    </div>
  );
}
