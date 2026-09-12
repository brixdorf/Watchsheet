import { MatchRow } from './MatchRow.jsx';
import { SectionHeading, MatchGrid, EmptyNote } from './layout.jsx';

/**
 * Home: a stat strip, then what is coming up and what just played, both drawn only from
 * the teams and competitions the user follows.
 *
 * Each of those two is split again: the sides you follow, then the rest of the competitions
 * you follow. The server decides which half a match belongs to and sends them already in
 * that order, so this only has to find where the boundary falls.
 */
/**
 * One half of a feed section. The second heading is omitted entirely when there is nothing
 * under it, so an account that follows only teams never sees an empty "Also on".
 */
function Group({ title, sub, meta, matches, empty, onOpen, onToggle, last }) {
  if (!matches.length && !empty) return null;
  return (
    <>
      <SectionHeading title={title} sub={sub} meta={meta} />
      <MatchGrid style={{ marginBottom: last ? 0 : 30 }}>
        {matches.map((m) => (
          <MatchRow key={m.id} match={m} onOpen={onOpen} onToggle={onToggle} />
        ))}
        {!matches.length && empty && <EmptyNote>{empty}</EmptyNote>}
      </MatchGrid>
    </>
  );
}

export function HomeFeed({ feed, stats, seasonLabel, onOpen, onToggle }) {
  const mine = (list) => list.filter((m) => m.followedTeam);
  const rest = (list) => list.filter((m) => !m.followedTeam);
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
      sub: stats?.count ? `${stats.goalsPerMatch.toFixed(2)} per match` : 'nothing logged yet',
    },
    {
      icon: 'ph-fill ph-star',
      label: 'Average rating',
      value: stats?.averageRating ? stats.averageRating.toFixed(1) : '0.0',
      sub: stats?.rated ? `${stats.rated} of ${stats.count} rated` : 'nothing rated yet',
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))',
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

      <Group
        title="Coming up"
        sub="The sides you follow"
        meta={`${mine(feed.upcoming).length} fixtures`}
        matches={mine(feed.upcoming)}
        empty={rest(feed.upcoming).length ? undefined : 'Nothing scheduled. Follow a few more sides on the Following tab.'}
        onOpen={onOpen}
        onToggle={onToggle}
      />
      <Group
        title="Also on"
        sub={`Elsewhere in the ${feed.followCount} teams and competitions you follow`}
        meta={`${rest(feed.upcoming).length} fixtures`}
        matches={rest(feed.upcoming)}
        onOpen={onOpen}
        onToggle={onToggle}
      />

      <Group
        title="Just played"
        sub="Tick off what you actually watched"
        meta={`${feed.untagged} untagged`}
        matches={mine(feed.recent)}
        empty={rest(feed.recent).length ? undefined : 'Nothing has finished yet. Once fixtures sync they will land here.'}
        onOpen={onOpen}
        onToggle={onToggle}
        last={!rest(feed.recent).length}
      />
      <Group
        title="Also played"
        sub="From the competitions you follow"
        meta={`${rest(feed.recent).length} matches`}
        matches={rest(feed.recent)}
        onOpen={onOpen}
        onToggle={onToggle}
        last
      />
    </div>
  );
}
