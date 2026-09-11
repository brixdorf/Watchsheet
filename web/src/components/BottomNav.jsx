import { TABS } from './Header.jsx';

/**
 * The phone navigation: the same five tabs as the header, moved to where a thumb is.
 *
 * It reads the same TABS array the header does, so the two can never drift apart. Admin is
 * deliberately absent, exactly as it is from the header strip, and lives in the account
 * menu instead: it is a tool, not a place you visit.
 *
 * Nothing is marked current when the admin screen is open. Highlighting Home would be a
 * lie, and the screen already has its own way back.
 */
export function BottomNav({ tab, onTab }) {
  return (
    <nav className="ws-bottomnav" aria-label="Sections">
      {TABS.map(([id, text, icon]) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            className="ws-bottomnav-tab"
            data-active={active || undefined}
            aria-current={active ? 'page' : undefined}
            onClick={() => onTab(id)}
          >
            <i className={active ? icon.replace('ph ph-', 'ph-fill ph-') : icon} />
            <span>{text}</span>
          </button>
        );
      })}
    </nav>
  );
}
