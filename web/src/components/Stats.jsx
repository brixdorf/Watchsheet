import { DAYS, MONTHS } from '../lib/format.js';
import { Crest } from './Crest.jsx';
import { Spinner } from './layout.jsx';

/**
 * The Stats tab. Numbers come from /api/stats, which runs over the whole watched set;
 * the copy — including the "stats nobody asked for" block — is written here.
 */
export function Stats({ stats, seasonLabel }) {
  if (!stats) return <Spinner label="Crunching numbers" />;

  const bigStats = [
    { label: 'Matches watched', value: stats.count, sub: 'the honest total', color: 'var(--fg)' },
    {
      label: 'Current week streak',
      value: stats.currentStreak,
      sub: `longest was ${stats.longestStreak}`,
      color: 'var(--accent-txt)',
    },
    {
      label: 'Goals witnessed',
      value: stats.goals,
      sub: stats.count ? `${stats.goalsPerMatch.toFixed(2)} a game` : '—',
      color: 'var(--fg)',
    },
    {
      label: 'Average rating',
      value: stats.averageRating ? stats.averageRating.toFixed(1) : '—',
      sub: `${stats.rated} matches rated`,
      color: 'var(--fg)',
    },
  ];

  const peak = Math.max(1, ...stats.monthly.map((m) => m.n));
  const hours = Math.floor(stats.minutes / 60);
  const days = Math.floor(hours / 24);
  const gapFrom = stats.gapFrom ? new Date(stats.gapFrom) : null;

  const silly = [
    {
      icon: 'ph-fill ph-moon-stars',
      label: 'Insomniac index',
      value: stats.night,
      sub: 'kick-offs at 21:00 or later. Sleep is for people without a backlog.',
    },
    {
      icon: 'ph-fill ph-hourglass',
      label: '0–0s endured',
      value: stats.nils,
      sub: stats.nils ? `that is ${stats.nils * 115} minutes of nothing` : 'you have been lucky',
    },
    {
      icon: 'ph-fill ph-armchair',
      label: 'Sofa marathon',
      value: `${stats.maxDay} in a day`,
      sub: 'your personal record for consecutive grass',
    },
    {
      icon: 'ph-fill ph-heart-break',
      label: 'Heartbreak tax',
      value: stats.heartbreak,
      sub: stats.topTeamName ? `times you watched ${stats.topTeamName} lose. On purpose.` : 'nothing to mourn yet',
    },
    { icon: 'ph-fill ph-lightning', label: 'Chaos merchant', value: stats.chaos, sub: 'matches with five goals or more' },
    {
      icon: 'ph-fill ph-bed',
      label: 'Longest dry spell',
      value: `${stats.gapDays} days`,
      sub: gapFrom
        ? `starting ${DAYS[gapFrom.getDay()]} ${gapFrom.getDate()} ${MONTHS[gapFrom.getMonth()]}`
        : '—',
    },
    {
      icon: 'ph-fill ph-clock',
      label: 'Grass hours',
      value: days > 0 ? `${days}d ${hours - days * 24}h` : `${hours}h`,
      sub: 'staring at a rectangle of turf',
    },
    {
      icon: 'ph-fill ph-compass',
      label: 'Neutral watches',
      value: stats.neutral,
      sub: 'games with no dog in the fight',
    },
    {
      icon: 'ph-fill ph-skull',
      label: 'Harshest verdict',
      value: stats.worst ? `${stats.worst.home}–${stats.worst.away}` : '—',
      sub: stats.worst ? `${stats.worst.rating}/5 — you were not kind` : 'you have rated nothing yet',
    },
  ];

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em' }}>The numbers</div>
      <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 18 }}>
        {seasonLabel} · {stats.count} matches watched · {stats.rated} rated
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        {bigStats.map((s) => (
          <div key={s.label} data-anim="row" className="ws-card" style={{ padding: 15, borderRadius: 15 }}>
            <div style={{ fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 8 }}>
              {s.label}
            </div>
            <div
              data-anim="num"
              style={{
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: '-.04em',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                color: s.color,
              }}
            >
              {s.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 5 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="ws-card" style={{ padding: '16px 16px 12px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Matches watched per month</div>
          <div style={{ fontSize: 11, color: 'var(--dim2)' }}>peak {peak} in a month</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 120 }}>
          {stats.monthly.map((b) => (
            <div key={b.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--dim2)' }}>{b.n || ''}</div>
              <div
                data-anim="bar"
                style={{
                  width: '100%',
                  borderRadius: '5px 5px 2px 2px',
                  background: b.n === peak && b.n > 0 ? 'var(--accent)' : 'var(--line2)',
                  height: Math.max(3, Math.round((b.n / peak) * 88)),
                }}
              />
              <div style={{ fontSize: 9.5, color: 'var(--dim2)', textTransform: 'uppercase' }}>{b.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 12 }}>
        <TopList title="Most-watched teams" rows={stats.topTeams} />
        <TopList title="Most-watched competitions" rows={stats.topCompetitions} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '22px 0 12px' }}>
        <i className="ph-fill ph-ghost" style={{ fontSize: 18, color: 'var(--accent-txt)' }} />
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>Stats nobody asked for</div>
        <div style={{ height: 1, flex: 1, background: 'var(--line)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))', gap: 10 }}>
        {silly.map((s) => (
          <div
            key={s.label}
            data-anim="row"
            className="ws-card"
            style={{ padding: 14, borderRadius: 15, display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className={s.icon} style={{ fontSize: 17, color: 'var(--accent-txt)' }} />
              <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-.01em' }}>{s.label}</div>
            </div>
            <div
              data-anim="num"
              style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}
            >
              {s.value}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.35 }}>{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopList({ title, rows }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="ws-card" style={{ padding: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rows.map((r) => (
          <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '26px minmax(0,1fr) auto', gap: 10, alignItems: 'center' }}>
            <Crest crest={r.crest} short={r.short} color={r.color} name={r.name} size={26} radius={8} fontSize={9} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.name}
              </div>
              <div style={{ height: 4, borderRadius: 3, background: 'var(--card2)', marginTop: 5 }}>
                <div style={{ height: 4, borderRadius: 3, background: 'var(--accent)', width: `${Math.round((r.n / max) * 100)}%` }} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>{r.n}</div>
          </div>
        ))}
        {rows.length === 0 && <div style={{ fontSize: 13, color: 'var(--dim)' }}>Nothing logged yet.</div>}
      </div>
    </div>
  );
}
