import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { MatchRow } from './MatchRow.jsx';
import { FilterPill, MatchGrid, SearchField, Spinner } from './layout.jsx';

/**
 * Search runs against local SQLite only. It never reaches the provider, which is what
 * keeps the free tier safe no matter how much searching happens.
 */
export function SearchScreen({ season, filters, patches, onOpen, onToggle, onOpenCustom }) {
  const [query, setQuery] = useState('');
  const [competition, setCompetition] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    // Debounced so a fast typist makes one request, not one per keystroke.
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .search({ q: query, competition, season })
        .then((r) => {
          if (!controller.signal.aborted) setResult(r);
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, query ? 220 : 0);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, competition, season]);

  // Tapping the pill that is already on clears it, which is what the "All" pill used to be
  // for. One less chip, and no pill that means the absence of the others.
  const pick = (id) => setCompetition((current) => (current === id ? null : id));

  // These results were fetched here, so anything marked watched since has to be layered
  // back over them, or a row would revert the moment its sheet closed.
  const matches = useMemo(() => {
    const rows = result?.matches ?? [];
    if (!patches?.size) return rows;
    return rows.map((m) => patches.get(m.id) ?? m);
  }, [result, patches]);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search a team, a competition, a date…"
          label="Search matches"
        />
      </div>

      <div className="ws-strip ws-strip--wrap" style={{ marginBottom: 18 }}>
        {filters.customCount > 0 && (
          <FilterPill active={competition === -1} onClick={() => pick(-1)}>
            Custom
          </FilterPill>
        )}
        {filters.competitions.map((c) => (
          <FilterPill key={c.id} active={competition === c.id} onClick={() => pick(c.id)}>
            {c.name}
          </FilterPill>
        ))}
      </div>

      <div
        style={{
          fontSize: 11,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'var(--dim)',
          marginBottom: 10,
        }}
      >
        {loading
          ? 'searching…'
          : result?.filtered
            ? `${matches.length} match${matches.length === 1 ? '' : 'es'} found`
            : 'Recent matches. Start typing to narrow them.'}
      </div>

      {loading && !result ? (
        <Spinner label="Searching" />
      ) : (
        <MatchGrid>
          {matches.map((m) => (
            <MatchRow key={m.id} match={m} onOpen={onOpen} onToggle={onToggle} />
          ))}
        </MatchGrid>
      )}

      <div
        style={{
          marginTop: 16,
          padding: 20,
          border: '1px dashed var(--line2)',
          borderRadius: 15,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>Not in the database?</div>
          <div style={{ fontSize: 13, color: 'var(--dim)' }}>
            Friendlies, charity matches, that grainy stream. Add it by hand.
          </div>
        </div>
        <button type="button" className="ws-primary" onClick={onOpenCustom} style={{ padding: '11px 16px', borderRadius: 11, fontSize: 14 }}>
          Add custom match
        </button>
      </div>
    </div>
  );
}
