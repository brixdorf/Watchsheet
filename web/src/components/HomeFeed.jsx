import { MatchRow } from './MatchRow.jsx';
import { SectionHeading, MatchGrid, EmptyNote } from './layout.jsx';

/**
 * Home: a stat strip, then what is coming up and what just played — both drawn only from
 * the teams and competitions the user follows.
 */
export function HomeFeed({ feed, stats, seasonLabel, onOpen, onToggle }) {
  const heroStats = [
    {
      icon: 'ph-fill ph-eye',
      label: 'Watched',
      value: stats?.count ?? 0,
      sub: seasonLabel === 'All seasons' ? 'all seasons' : `in ${seasonLabel}`,
    },
    {
      icon: 'ph-fill ph-fire',
      label: 'Week streak',
      value: stats?.currentStreak ?? 0,
      sub: stats?.currentStreak ? 'weeks in a row' : 'log one to start',
    },
    {
      icon: 'ph-fill ph-soccer-ball',
      label: 'Goals seen',
      value: stats?.goals ?? 0,
      sub: stats?.count ? `${stats.goalsPerMatch.toFixed(2)} per match` : '—',
    },
    {
      icon: 'ph-fill ph-star',
      label: 'Average rating',
      value: stats?.averageRating ? stats.averageRating.toFixed(1) : '—',
      sub: stats?.rated ? `${stats.rated} of ${stats.count} rated` : 'nothing rated yet',
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
          gap: 10,
          marginBottom: 26,
        }}
      >
        {heroStats.map((s) => (
          <div key={s.label} data-anim="row" className="ws-card" style={{ padding: 14, borderRadius: 15 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 10,
                letterSpacing: '.07em',
                textTransform: 'uppercase',
                color: 'var(--dim)',
                marginBottom: 9,
              }}
            >
              <i className={s.icon} style={{ fontSize: 13, color: 'var(--accent-txt)' }} />
              {s.label}
            </div>
            <div
              data-anim="num"
              style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
            >
              {s.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <SectionHeading
        title="Coming up"
        sub={`From the ${feed.followCount} teams and competitions you follow`}
        meta={`${feed.upcoming.length} fixtures`}
      />
      <MatchGrid style={{ marginBottom: 30 }}>
        {feed.upcoming.map((m) => (
          <MatchRow key={m.id} match={m} onOpen={onOpen} onToggle={onToggle} />
        ))}
        {feed.upcoming.length === 0 && (
          <EmptyNote>Nothing scheduled. Follow a few more sides on the Following tab.</EmptyNote>
        )}
      </MatchGrid>

      <SectionHeading
        title="Just played"
        sub="Tick off what you actually watched"
        meta={`${feed.untagged} untagged`}
      />
      <MatchGrid>
        {feed.recent.map((m) => (
          <MatchRow key={m.id} match={m} onOpen={onOpen} onToggle={onToggle} />
        ))}
        {feed.recent.length === 0 && (
          <EmptyNote>Nothing has finished yet. Once fixtures sync they will land here.</EmptyNote>
        )}
      </MatchGrid>
    </div>
  );
}
