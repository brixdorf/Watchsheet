import { MatchRow } from './MatchRow.jsx';
import { EmptyNote, FilterPill, MatchGrid, Spinner } from './layout.jsx';

const FILTERS = ['All', 'Rated', 'With notes', 'Custom'];

/** Watched history, grouped by month, with the design's four filters. */
export function History({ history, loading, filter, onFilter, seasonLabel, onOpen, onToggle, onOpenExport }) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em' }}>Watched history</div>
          <div style={{ fontSize: 13, color: 'var(--dim)' }}>
            {history ? `${history.total} matches · ${seasonLabel} · ${history.withNotes} with notes` : seasonLabel}
          </div>
        </div>
        <button
          type="button"
          className="ws-chip"
          onClick={onOpenExport}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontWeight: 600, fontSize: 13.5 }}
        >
          <i className="ph ph-download-simple" style={{ fontSize: 16 }} /> Export
        </button>
      </div>

      <div className="ws-strip" style={{ marginBottom: 20 }}>
        {FILTERS.map((f) => (
          <FilterPill key={f} active={filter === f} onClick={() => onFilter(f)}>
            {f}
          </FilterPill>
        ))}
      </div>

      {loading && !history ? (
        <Spinner label="Loading history" />
      ) : (
        <>
          {history?.groups.map((group) => (
            <div key={group.label} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase' }}>
                  {group.label}
                </div>
                <div style={{ height: 1, flex: 1, background: 'var(--line)' }} />
                <div style={{ fontSize: 11, color: 'var(--dim2)' }}>{group.count} logged</div>
              </div>
              <MatchGrid>
                {group.matches.map((m) => (
                  <MatchRow key={m.id} match={m} onOpen={onOpen} onToggle={onToggle} />
                ))}
              </MatchGrid>
            </div>
          ))}

          {history && history.groups.length === 0 && (
            <EmptyNote padding={36}>Nothing logged here yet.</EmptyNote>
          )}

          {history && history.shown < history.total && (
            <EmptyNote padding={20}>
              Showing the latest {history.shown} of {history.total}. Export has every one of them.
            </EmptyNote>
          )}
        </>
      )}
    </div>
  );
}
