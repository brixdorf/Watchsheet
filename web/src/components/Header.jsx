import { useEffect, useRef, useState } from 'react';
import { initialsOf } from '../lib/format.js';
import { useIsPhone } from '../lib/useMedia.js';

const THEMES = [
  ['light', 'ph ph-sun', 'Light'],
  ['dark', 'ph ph-moon', 'Dark'],
  ['system', 'ph ph-desktop', 'System'],
];

export const TABS = [
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
  onOpenAdmin,
  onOpenAccount,
  onLogout,
}) {
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Structural, not cosmetic: on a phone the tab row is not rendered here at all, and the
  // theme picker and Custom match move inside the account menu rather than being duplicated
  // and hidden. Sizes stay in styles.css where they belong.
  const isPhone = useIsPhone();
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
          padding: '9px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 'auto', minWidth: 0 }}>
          <img
            src="/logo.svg"
            alt=""
            className="ws-brand-logo"
            style={{ flex: 'none', borderRadius: 18, boxShadow: '0 10px 26px rgba(11,42,168,.4)' }}
          />
          <div style={{ minWidth: 0 }}>
            <div className="ws-brand-name" style={{ fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05 }}>
              Watchsheet
            </div>
            <div
              className="ws-brand-tag"
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--accent-txt)',
                letterSpacing: '.11em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              Your season, logged
            </div>
          </div>
        </div>

        {!isPhone && <ThemePicker theme={theme} onTheme={onTheme} />}
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
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--dim)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {user.email}
                  </div>
                </div>
                <button type="button" className="ws-menu-item" onClick={() => { onOpenAccount(); closeAll.current(); }}>
                  <i className="ph ph-user-circle" style={{ fontSize: 16, color: 'var(--dim)' }} /> Your account
                </button>
                {isPhone && (
                  <button type="button" className="ws-menu-item" onClick={() => { onOpenCustom(); closeAll.current(); }}>
                    <i className="ph ph-plus-circle" style={{ fontSize: 16, color: 'var(--dim)' }} /> Custom match
                  </button>
                )}
                <button type="button" className="ws-menu-item" onClick={() => { onOpenExport(); closeAll.current(); }}>
                  <i className="ph ph-download-simple" style={{ fontSize: 16, color: 'var(--dim)' }} /> Export history
                </button>
                {user.admin && (
                  <button
                    type="button"
                    className="ws-menu-item"
                    onClick={() => { onOpenAdmin(); closeAll.current(); }}
                  >
                    <i className="ph ph-sliders-horizontal" style={{ fontSize: 16, color: 'var(--dim)' }} /> Admin
                  </button>
                )}
                {isPhone && (
                  <div style={{ padding: '8px 10px 4px', borderTop: '1px solid var(--line)', marginTop: 6 }}>
                    <ThemePicker theme={theme} onTheme={onTheme} full />
                  </div>
                )}
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

      {!isPhone && (
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
      )}
    </div>
  );
}

/** The three-way theme switch: a segmented control on a desk, a full-width row in the menu. */
function ThemePicker({ theme, onTheme, full = false }) {
  return (
    <div
      className="ws-theme"
      style={full ? { display: 'flex', gap: 4 } : undefined}
    >
      {THEMES.map(([id, icon, title]) => (
        <button
          key={id}
          type="button"
          title={title}
          aria-label={title}
          aria-pressed={theme === id}
          onClick={() => onTheme(id)}
          className="ws-theme-btn"
          style={{
            ...(full ? { flex: 1 } : null),
            background: theme === id ? 'var(--card2)' : 'transparent',
            color: theme === id ? 'var(--accent-txt)' : 'var(--dim2)',
          }}
        >
          <i className={icon} />
        </button>
      ))}
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
        maxWidth: 'calc(100vw - 32px)',
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
