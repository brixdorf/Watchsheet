import { useEffect, useMemo, useState } from 'react';
import { Crest } from './Crest.jsx';
import { EmptyNote, FilterPill } from './layout.jsx';

/**
 * Teams and competitions to follow.
 *
 * Everything the provider resolved is here, not just the names Watchsheet was seeded with —
 * several hundred sides, ordered by rough worldwide popularity so the familiar ones lead.
 * The list is rendered in pages because a few hundred cards at once is a slow first paint;
 * typing a filter searches the whole catalog regardless of what is currently shown.
 *
 * Following only decides whose fixtures reach your feed. It never marks anything watched.
 */

const PAGE = 60;

export function Following({ teams, competitions, onToggleFollow }) {
  const [kind, setKind] = useState('teams');
  const [query, setQuery] = useState('');
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const source = kind === 'teams' ? teams : competitions;

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return source.filter((c) => {
      if (onlyFollowed && !c.following) return false;
      if (!q) return true;
      return `${c.name} ${c.short ?? ''}`.toLowerCase().includes(q);
    });
  }, [source, query, onlyFollowed]);

  // Any change of what is being looked at starts the paging over.
  useEffect(() => setLimit(PAGE), [kind, query, onlyFollowed]);

  const followedCount = source.filter((c) => c.following).length;
  const shown = items.slice(0, limit);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <FilterPill active={kind === 'teams'} onClick={() => setKind('teams')}>
          Teams
        </FilterPill>
        <FilterPill active={kind === 'comps'} onClick={() => setKind('comps')}>
          Competitions
        </FilterPill>
        <FilterPill active={onlyFollowed} onClick={() => setOnlyFollowed((v) => !v)}>
          Followed
        </FilterPill>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <i
            className="ph ph-magnifying-glass"
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 15,
              color: 'var(--dim)',
            }}
          />
          <input
            className="ws-field ws-field--card"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every team and competition…"
            aria-label="Search the catalog"
            style={{ padding: '9px 12px 9px 36px', borderRadius: 10, fontSize: 14 }}
          />
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--dim2)', marginBottom: 14 }}>
        {items.length.toLocaleString()} {kind === 'teams' ? 'teams' : 'competitions'} · {followedCount} followed
        {shown.length < items.length && ` · showing ${shown.length}`}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 9 }}>
        {shown.map((item) => (
          <div
            key={item.id}
            data-anim="row"
            className="ws-card"
            style={{
              display: 'grid',
              gridTemplateColumns: '38px minmax(0,1fr) auto',
              gap: 11,
              alignItems: 'center',
              padding: '11px 12px',
              borderRadius: 14,
            }}
          >
            <Crest
              crest={item.crest}
              short={item.short}
              color={item.color}
              name={item.name}
              size={38}
              radius={11}
              fontSize={12}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                {kind === 'teams'
                  ? `${item.isNational ? 'National side' : 'Club'} · ${item.watched} watched`
                  : `${item.country || 'International'} · ${item.watched} watched`}
              </div>
            </div>
            <button
              type="button"
              className="ws-pop"
              aria-label={item.following ? `Unfollow ${item.name}` : `Follow ${item.name}`}
              aria-pressed={item.following}
              onClick={() => onToggleFollow(kind === 'teams' ? 'team' : 'competition', item.id, !item.following)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                fontSize: 16,
                background: item.following ? 'var(--accent)' : 'var(--card2)',
                color: item.following ? 'var(--accent-ink)' : 'var(--dim)',
                border: `1px solid ${item.following ? 'var(--accent)' : 'var(--line)'}`,
              }}
            >
              <i className={item.following ? 'ph-fill ph-heart' : 'ph ph-plus'} />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <EmptyNote>
            {onlyFollowed && !query
              ? 'You are not following anything here yet.'
              : 'Nothing matches that. Anything the provider does not carry can go in as a custom match.'}
          </EmptyNote>
        )}
      </div>

      {shown.length < items.length && (
        <button
          type="button"
          className="ws-dashed"
          onClick={() => setLimit((n) => n + PAGE * 2)}
          style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 13, fontSize: 13.5, fontWeight: 600 }}
        >
          Show more · {(items.length - shown.length).toLocaleString()} left
        </button>
      )}
    </div>
  );
}
