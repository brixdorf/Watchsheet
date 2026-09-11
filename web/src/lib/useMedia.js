import { useSyncExternalStore } from 'react';

/**
 * The one breakpoint in the app.
 *
 * 700px because that is where the header's two rows stop fitting on one line, not because
 * any particular handset is that wide. Anything purely visual belongs in a media query in
 * styles.css; this hook is for the places where the markup itself differs, which is the
 * navigation moving out of the header and into a bottom bar.
 *
 * It must stay in step with the `@media (max-width: 700px)` block in styles.css.
 */
export const PHONE = '(max-width: 700px)';

/**
 * useSyncExternalStore wants a stable subscribe and a stable getSnapshot, so the MediaQueryList
 * and its two callbacks are made once per query and reused. Building them inline would
 * resubscribe on every render.
 */
const queries = new Map();

function queryStore(query) {
  let store = queries.get(query);
  if (!store) {
    const mq = window.matchMedia(query);
    store = {
      subscribe: (onChange) => {
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
      },
      get: () => mq.matches,
    };
    queries.set(query, store);
  }
  return store;
}

export function useMediaQuery(query) {
  const store = queryStore(query);
  return useSyncExternalStore(store.subscribe, store.get, () => false);
}

export const useIsPhone = () => useMediaQuery(PHONE);
