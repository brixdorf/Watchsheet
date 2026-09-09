/**
 * The 1–5 rating control. Clicking the star you are already on clears the rating, which is
 * how the design behaved: ratings stay genuinely optional.
 */
export function Stars({ value = 0, onChange, size = 40, flex = false }) {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => {
        const on = value >= i;
        return (
          <button
            key={i}
            type="button"
            aria-label={`${i} star${i === 1 ? '' : 's'}`}
            aria-pressed={on}
            onClick={() => onChange(value === i ? 0 : i)}
            className="ws-pop"
            style={{
              ...(flex ? { flex: 1, height: size } : { width: size, height: size }),
              borderRadius: 11,
              border: '1px solid var(--line)',
              background: 'var(--card)',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              fontSize: Math.round(size * 0.47),
              color: on ? 'var(--accent-txt)' : 'var(--dim2)',
            }}
          >
            <i className={on ? 'ph-fill ph-star' : 'ph ph-star'} />
          </button>
        );
      })}
    </>
  );
}

export const ratingText = (rating) => (rating ? `${rating} / 5` : 'unrated');
