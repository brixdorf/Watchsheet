import { useEffect, useRef, useState } from 'react';
import { fmtDateLong, fmtTime, tzName } from '../lib/format.js';
import { pulseScore } from '../lib/anim.js';
import { Crest } from './Crest.jsx';
import { Modal } from './Modal.jsx';
import { Stars, ratingText } from './Stars.jsx';
import { isUpcoming } from './MatchRow.jsx';
import { Eyebrow } from './layout.jsx';

/** The full match sheet: scoreline, facts, watched toggle, then rating and note. */
export function MatchDetail({ match, onClose, onSetLog, onRemoveLog, onDeleteCustom }) {
  const [note, setNote] = useState(match.log?.note ?? '');
  const [saved, setSaved] = useState(false);
  const rootRef = useRef(null);

  // A different match in the same sheet (via the quick-log "open full detail") needs the
  // draft to follow it rather than keep the previous match's text.
  useEffect(() => {
    setNote(match.log?.note ?? '');
    setSaved(false);
  }, [match.id, match.log?.note]);

  const watched = Boolean(match.log);
  const rating = match.log?.rating ?? 0;
  const upcoming = isUpcoming(match);

  const facts = [
    { k: 'Date', v: fmtDateLong(match.kickoff) },
    { k: 'Kick-off', v: `${fmtTime(match.kickoff)} ${tzName()}` },
    { k: 'Season', v: match.season },
    { k: 'Competition', v: match.competition.name },
  ];

  const setRating = (value) => {
    onSetLog(match.id, { rating: value, note });
    pulseScore(rootRef.current);
  };

  return (
    <Modal onClose={onClose} maxWidth={540} padded={false}>
      <div ref={rootRef}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '13px 15px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <i className="ph ph-trophy" style={{ fontSize: 16, color: 'var(--dim)' }} />
            <div
              style={{
                fontSize: 11.5,
                letterSpacing: '.05em',
                textTransform: 'uppercase',
                color: 'var(--dim)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {match.competition.name}
              {match.isCustom ? ' · custom' : match.round ? ` · ${match.round}` : ''}
            </div>
          </div>
          <button
            type="button"
            className="ws-chip"
            aria-label="Close"
            onClick={onClose}
            style={{ width: 32, height: 32, flex: 'none', borderRadius: 9, display: 'grid', placeItems: 'center', fontSize: 15 }}
          >
            <i className="ph-bold ph-x" />
          </button>
        </div>

        <div
          style={{
            padding: '22px 18px',
            background: 'radial-gradient(90% 120% at 50% 0%, var(--accent-soft), transparent 65%)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
            <TeamBlock side={match.home} />
            <div style={{ textAlign: 'center' }}>
              <div
                data-anim="score"
                style={{
                  fontSize: 44,
                  fontWeight: 800,
                  letterSpacing: '-.05em',
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {match.homeScore == null ? fmtTime(match.kickoff) : `${match.homeScore} – ${match.awayScore}`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6 }}>
                {upcoming ? `Kick-off ${fmtDateLong(match.kickoff)}` : statusLine(match)}
              </div>
            </div>
            <TeamBlock side={match.away} />
          </div>
        </div>

        <div style={{ padding: '0 18px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
            {facts.map((f) => (
              <div key={f.k} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 11, padding: '10px 11px' }}>
                <div style={{ fontSize: 9.5, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--dim2)', marginBottom: 3 }}>
                  {f.k}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{f.v}</div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => (watched ? onRemoveLog(match.id) : onSetLog(match.id, { rating: 0, note: '' }))}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
              padding: 14,
              borderRadius: 13,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 15,
              background: watched ? 'var(--card2)' : 'var(--accent)',
              color: watched ? 'var(--accent-txt)' : 'var(--accent-ink)',
              border: '1px solid var(--accent)',
            }}
          >
            <i className={watched ? 'ph-fill ph-check-circle' : 'ph ph-eye'} style={{ fontSize: 19 }} />
            {watched ? 'Watched' : upcoming ? 'Mark watched anyway' : 'Mark as watched'}
          </button>

          {watched && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
                <Eyebrow style={{ marginBottom: 0 }}>Rating (optional)</Eyebrow>
                <button
                  type="button"
                  className="ws-quiet"
                  onClick={() => setRating(0)}
                  style={{ fontSize: 11.5, color: 'var(--dim2)' }}
                >
                  clear
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}>
                <Stars value={rating} onChange={setRating} size={40} />
                <div style={{ fontSize: 12, color: 'var(--dim)', marginLeft: 6 }}>{ratingText(rating)}</div>
              </div>

              <Eyebrow>Note (optional)</Eyebrow>
              <textarea
                className="ws-field ws-field--card ws-field--note"
                rows={3}
                value={note}
                onChange={(e) => { setNote(e.target.value); setSaved(false); }}
                placeholder="Bad game, great pie."
                style={{ borderRadius: 12, resize: 'vertical', fontFamily: 'inherit' }}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => (match.isCustom ? onDeleteCustom(match.id) : onRemoveLog(match.id))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--neg)',
                    fontSize: 13,
                    cursor: 'pointer',
                    padding: '8px 0',
                  }}
                >
                  <i className="ph ph-trash" style={{ fontSize: 15 }} />
                  {match.isCustom ? 'Delete custom match' : 'Remove from history'}
                </button>
                <button
                  type="button"
                  onClick={() => { onSetLog(match.id, { rating, note }); setSaved(true); }}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 11,
                    border: 'none',
                    background: 'var(--card2)',
                    color: 'var(--fg)',
                    fontWeight: 600,
                    fontSize: 13.5,
                    cursor: 'pointer',
                  }}
                >
                  {saved ? 'Saved' : 'Save note'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function TeamBlock({ side }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, textAlign: 'center' }}>
      <Crest crest={side.crest} short={side.short} color={side.color} name={side.name} size={52} radius={15} fontSize={15} />
      <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>{side.name}</div>
    </div>
  );
}

function statusLine(match) {
  if (match.status === 'live') return 'In progress';
  if (match.status === 'postponed') return 'Postponed';
  if (match.status === 'cancelled') return 'Cancelled';
  if (match.homeScore == null) return 'No result recorded';
  return 'Full time';
}
