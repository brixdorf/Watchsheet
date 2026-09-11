import { countdown, fmtDateShort, fmtTime } from '../lib/format.js';
import { Crest } from './Crest.jsx';

/**
 * The match card, ported from MatchRow.dc.html.
 *
 * Presentation is derived here rather than on the server, exactly as the design's row()
 * method did: the losing side dims, the tag reads "in 3h" / "Full time" / "Watched", and
 * the button flips to a filled tick once logged.
 */

export function isUpcoming(match, now = Date.now()) {
  return match.status === 'scheduled' && match.kickoff > now;
}

function Side({ side, tone }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '24px minmax(0,1fr) auto', gap: 10, alignItems: 'center' }}>
      <Crest crest={side.crest} short={side.short} color={side.color} name={side.name} size={24} radius={7} />
      <div
        style={{
          fontSize: 14.5,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: tone,
        }}
      >
        {side.name}
      </div>
      <div
        style={{
          fontFamily: 'Barlow, system-ui, sans-serif',
          fontSize: 17,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 12,
          textAlign: 'right',
          color: tone,
        }}
      >
        {side.score ?? ''}
      </div>
    </div>
  );
}

export function MatchRow({ match, onOpen, onToggle }) {
  const now = Date.now();
  const upcoming = isUpcoming(match, now);
  const watched = Boolean(match.log);
  const hs = match.homeScore;
  const as = match.awayScore;

  // The winning side keeps full contrast; the losing side steps back.
  const toneFor = (which) => {
    if (hs == null || as == null || hs === as) return 'var(--fg)';
    const won = which === 'home' ? hs > as : as > hs;
    return won ? 'var(--fg)' : 'var(--dim)';
  };

  const tag = watched ? 'Watched' : upcoming ? countdown(match.kickoff, now) : statusTag(match);
  const tagColor = upcoming || watched ? 'var(--accent-txt)' : 'var(--dim2)';
  const hasMeta = watched && (match.log.rating > 0 || match.log.note);

  return (
    <div
      className="ws-card ws-match"
      onClick={() => onOpen(match)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(match);
        }
      }}
      data-anim="row"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', padding: 13 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div
          style={{
            fontFamily: 'Barlow, system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '.09em',
            textTransform: 'uppercase',
            color: 'var(--dim2)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {match.competition.short || match.competition.name}
        </div>
        <div
          style={{
            fontFamily: 'Barlow, system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '.07em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: tagColor,
          }}
        >
          {tag}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <Side side={{ ...match.home, score: hs }} tone={toneFor('home')} />
        <Side side={{ ...match.away, score: as }} tone={toneFor('away')} />
      </div>

      {hasMeta && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            paddingTop: 10,
            borderTop: '1px dashed var(--line)',
          }}
        >
          {match.log.rating > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--accent-txt)', fontSize: 12.5 }}>
              <i className="ph-fill ph-star" />
              <span style={{ fontFamily: 'Barlow, system-ui, sans-serif', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {match.log.rating}/5
              </span>
            </div>
          )}
          {match.log.note && (
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--dim)',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              “{match.log.note}”
            </div>
          )}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginTop: 'auto',
          paddingTop: 11,
          borderTop: '1px solid var(--line)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {fmtDateShort(match.kickoff)}
          </div>
          <div
            style={{
              fontFamily: 'Barlow, system-ui, sans-serif',
              fontSize: 12.5,
              fontWeight: 500,
              color: 'var(--dim)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmtTime(match.kickoff)}
          </div>
        </div>
        <button
          type="button"
          title={watched ? 'Remove from history' : 'Mark watched'}
          aria-label={watched ? 'Remove from history' : 'Mark watched'}
          className="ws-pop ws-tap"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(match);
          }}
          style={{
            width: 38,
            height: 38,
            flex: 'none',
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            fontSize: 18,
            background: watched ? 'var(--accent)' : 'var(--card2)',
            color: watched ? 'var(--accent-ink)' : 'var(--dim)',
            border: `1px solid ${watched ? 'var(--accent)' : 'var(--line)'}`,
          }}
        >
          <i className={watched ? 'ph-fill ph-check-circle' : 'ph ph-eye'} />
        </button>
      </div>
    </div>
  );
}

function statusTag(match) {
  if (match.status === 'live') return 'live';
  if (match.status === 'postponed') return 'postponed';
  if (match.status === 'cancelled') return 'cancelled';
  // A finished match with no score means the provider has not settled it yet, which is a
  // wait rather than a result. Saying "no result" made it read like a goalless draw.
  if (match.homeScore == null) return 'awaiting result';
  return 'Full time';
}
