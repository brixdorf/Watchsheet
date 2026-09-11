import { useState } from 'react';
import { fmtDateShort, fmtTime } from '../lib/format.js';
import { Crest } from './Crest.jsx';
import { Modal } from './Modal.jsx';
import { Stars, ratingText } from './Stars.jsx';
import { Eyebrow } from './layout.jsx';

/**
 * The sheet that appears the moment a match is ticked off.
 *
 * The match is already logged by the time this opens, and Skip keeps it that way. This exists
 * only to catch a rating and a note while they are still fresh, which is why both are
 * optional and neither blocks.
 */
export function QuickLog({ match, onSkip, onSave, onOpenDetail }) {
  const [rating, setRating] = useState(match.log?.rating ?? 0);
  const [note, setNote] = useState(match.log?.note ?? '');

  return (
    <Modal onClose={onSkip} maxWidth={420} padded={false}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 18px 0' }}>
        <i className="ph-fill ph-check-circle" style={{ fontSize: 20, color: 'var(--accent-txt)' }} />
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>Marked watched</div>
      </div>

      <div style={{ padding: '12px 18px 18px' }}>
        <div
          className="ws-card"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)',
            gap: 10,
            alignItems: 'center',
            padding: 13,
            borderRadius: 14,
            marginBottom: 6,
          }}
        >
          <MiniSide side={match.home} />
          <div
            data-anim="score"
            style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
          >
            {match.homeScore == null ? 'v' : `${match.homeScore} – ${match.awayScore}`}
          </div>
          <MiniSide side={match.away} />
        </div>

        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--dim2)',
            textAlign: 'center',
            marginBottom: 18,
          }}
        >
          {match.competition.name} · {fmtDateShort(match.kickoff)} · {fmtTime(match.kickoff)}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
          <Eyebrow style={{ marginBottom: 0, fontSize: 11, fontWeight: 600 }}>Rating (optional)</Eyebrow>
          <div style={{ fontSize: 12, color: 'var(--dim2)' }}>{ratingText(rating)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <Stars value={rating} onChange={setRating} size={44} flex />
        </div>

        <Eyebrow style={{ fontSize: 11, fontWeight: 600, marginBottom: 9 }}>Note (optional)</Eyebrow>
        <textarea
          className="ws-field ws-field--card ws-field--note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Bad game, great pie."
          style={{ borderRadius: 12, resize: 'vertical', fontFamily: 'inherit', marginBottom: 16 }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="ws-quiet"
            onClick={onSkip}
            style={{ flex: 1, padding: 13, borderRadius: 12, border: '1px solid var(--line)', fontWeight: 600, fontSize: 14.5 }}
          >
            Skip
          </button>
          <button
            type="button"
            className="ws-primary"
            onClick={() => onSave({ rating, note })}
            style={{ flex: 2, padding: 13, borderRadius: 12, fontSize: 14.5 }}
          >
            Save log
          </button>
        </div>
        <button
          type="button"
          className="ws-quiet"
          onClick={onOpenDetail}
          style={{ width: '100%', marginTop: 8, padding: 9, borderRadius: 10, fontSize: 13 }}
        >
          Open full match detail
        </button>
      </div>
    </Modal>
  );
}

function MiniSide({ side }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, textAlign: 'center', minWidth: 0 }}>
      <Crest crest={side.crest} short={side.short} color={side.color} name={side.name} size={34} radius={10} fontSize={11} />
      <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2 }}>{side.name}</div>
    </div>
  );
}
