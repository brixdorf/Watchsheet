import { useState } from 'react';
import { colorFor, ink } from '../lib/format.js';

/**
 * A team or competition badge.
 *
 * The design had no crests available and always drew a coloured monogram. Real crests
 * exist now, so they lead — but the monogram stays as the fallback for anything without
 * one, and for images that fail to load. Its colour is the club's brand colour where we
 * seeded one, and a hash of the name otherwise, so it is at least stable.
 */
export function Crest({ crest, short, color, name, size = 24, radius = 7, fontSize }) {
  const [failed, setFailed] = useState(false);
  const showImage = crest && !failed;

  const base = {
    width: size,
    height: size,
    borderRadius: radius,
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
  };

  if (showImage) {
    return (
      <div style={{ ...base, background: 'var(--card2)' }}>
        <img
          src={crest}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '82%', height: '82%', objectFit: 'contain' }}
        />
      </div>
    );
  }

  const fill = color || colorFor(name || short);
  return (
    <div
      style={{
        ...base,
        background: fill,
        color: ink(fill),
        fontFamily: 'Barlow, system-ui, sans-serif',
        fontWeight: 800,
        fontSize: fontSize ?? Math.max(9, Math.round(size * 0.42)),
        letterSpacing: '.01em',
      }}
    >
      {short || '?'}
    </div>
  );
}
