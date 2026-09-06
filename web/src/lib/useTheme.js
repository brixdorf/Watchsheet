import { useCallback, useEffect, useState } from 'react';

/**
 * Light / dark / system, stamped onto <html data-theme>.
 *
 * Theme is the one piece of state that stays on the device rather than on the server: it
 * is a property of the screen you are looking at, not of the account.
 */

const KEY = 'watchsheet.theme';
const VALID = ['light', 'dark', 'system'];

function read() {
  try {
    const saved = localStorage.getItem(KEY);
    return VALID.includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(read);

  const apply = useCallback((value) => {
    const dark =
      value === 'dark' ||
      (value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, []);

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Private browsing or blocked storage: the theme still applies for this session.
    }
  }, [theme, apply]);

  // Follow the OS while set to "system".
  useEffect(() => {
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => apply('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme, apply]);

  const setTheme = useCallback((value) => {
    if (VALID.includes(value)) setThemeState(value);
  }, []);

  return [theme, setTheme];
}
