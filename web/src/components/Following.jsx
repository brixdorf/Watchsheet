import { useMemo, useState } from 'react';
import { Crest } from './Crest.jsx';
import { EmptyNote, FilterPill } from './layout.jsx';

/**
 * Teams and competitions to follow.
 *
 * Only entities that resolved against the provider appear. A seed the provider does not
 * carry is simply absent rather than listed with nothing behind it — custom match entry is
 * the route for those.
 */
export function Following({ teams, competitions, onToggleFollow }) {
  const [kind, setKind] = useState('teams');
  const [query, setQuery] = useState('');

  const source = kind === 'teams' ? teams : competitions;
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return source;
    return source.filter((c) => `${c.name} ${c.short ?? ''}`.toLowerCase().includes(q));
  }, [source, query]);

  const followedCount = source.filter((c) => c.following).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <FilterPill active={kind === 'teams'} onClick={() => setKind('teams')}>
          Teams
        </FilterPill>
        <FilterPill active={kind === 'comps'} onClick={() => setKind('comps')}>
          Competitions
        </FilterPill>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <i
            className="ph ph-magnifying-glass"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: 'var(--dim)' }}
          />
          <input
            className="ws-field ws-field--card"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name…"
            aria-label="Filter by name"
            style={{ padding: '9px 12px 9px 36px', borderRadius: 10, fontSize: 14 }}
          />
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--dim2)', marginBottom: 14 }}>
        {items.length} {kind === 'teams' ? 'teams' : 'competitions'} · {followedCount} followed
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 9 }}>
        {items.map((item) => (
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
            <Crest crest={item.crest} short={item.short} color={item.color} name={item.name} size={38} radius={11} fontSize={12} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
        {items.length === 0 && <EmptyNote>Nothing matches that filter.</EmptyNote>}
      </div>
    </div>
  );
}
