import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './lib/api.js';
import { animateScreen, installVisibilityGuard } from './lib/anim.js';
import { useTheme } from './lib/useTheme.js';
import { seasonIdFor } from './lib/format.js';

import { FollowPicker } from './components/FollowPicker.jsx';
import { CustomMatch } from './components/CustomMatch.jsx';
import { ExportModal } from './components/ExportModal.jsx';
import { Following } from './components/Following.jsx';
import { Header } from './components/Header.jsx';
import { History } from './components/History.jsx';
import { HomeFeed } from './components/HomeFeed.jsx';
import { MatchDetail } from './components/MatchDetail.jsx';
import { Onboarding } from './components/Onboarding.jsx';
import { QuickLog } from './components/QuickLog.jsx';
import { SearchScreen } from './components/SearchScreen.jsx';
import { Stats } from './components/Stats.jsx';
import { AdminScreen } from './components/AdminScreen.jsx';
import { Spinner } from './components/layout.jsx';
import { Toast } from './components/Toast.jsx';

/**
 * Application shell: session, the selected tab and season, and the data each screen needs.
 *
 * The one piece of shared machinery worth knowing about is applyMatch: every mutation
 * returns the updated match, and that single object is patched into whichever lists
 * currently hold it. Marking something watched on the Home tab therefore updates Search
 * and History too, without refetching any of them.
 */
export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useTheme();
  // A signed-in account with nothing followed has not been through the picker yet.
  const [needsPicker, setNeedsPicker] = useState(false);

  const [tab, setTab] = useState('home');
  const [season, setSeason] = useState(seasonIdFor(new Date()));
  const [seasons, setSeasons] = useState([]);

  const [feed, setFeed] = useState(null);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('All');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [teams, setTeams] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [filters, setFilters] = useState({ competitions: [], customCount: 0 });

  const [detail, setDetail] = useState(null);
  const [quick, setQuick] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);

  const mainRef = useRef(null);
  const toastTimer = useRef(null);

  const flash = useCallback((message, tone = 'accent') => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1900);
  }, []);

  const signedIn = useCallback((account, followCount) => {
    setUser(account);
    setNeedsPicker(followCount === 0);
  }, []);

  /* ---------------------------------------------------------------- session */

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setUser(r.user);
        setNeedsPicker(Boolean(r.user) && r.followCount === 0);
      })
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => installVisibilityGuard(() => mainRef.current), []);

  /* ------------------------------------------------------------------- data */

  const loadCore = useCallback(async () => {
    const [feedRes, seasonRes, teamRes, compRes, filterRes] = await Promise.all([
      api.feed(),
      api.seasons(),
      api.teams(),
      api.competitions(),
      api.filters(),
    ]);
    setFeed(feedRes);
    setSeasons(seasonRes.seasons);
    setTeams(teamRes.teams);
    setCompetitions(compRes.competitions);
    setFilters(filterRes);
  }, []);

  useEffect(() => {
    if (!user || needsPicker) return;
    loadCore().catch(() => flash('Could not load your data', 'negative'));
  }, [user, needsPicker, loadCore, flash]);

  // Stats drive the Home hero strip as well as the Stats tab, so they follow the season
  // selector regardless of which tab is open.
  useEffect(() => {
    if (!user || needsPicker) return;
    let live = true;
    api
      .stats(season)
      .then((s) => live && setStats(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user, needsPicker, season]);

  useEffect(() => {
    if (!user || tab !== 'history') return undefined;
    let live = true;
    setHistoryLoading(true);
    api
      .history({ season, filter: historyFilter })
      .then((h) => live && setHistory(h))
      .catch(() => {})
      .finally(() => live && setHistoryLoading(false));
    return () => {
      live = false;
    };
  }, [user, tab, season, historyFilter]);

  // Re-run the entrance whenever the visible screen changes.
  useEffect(() => {
    if (!user) return undefined;
    return animateScreen(mainRef.current);
  }, [user, tab, season, feed, stats, history, teams, competitions]);

  /* -------------------------------------------------------------- mutations */

  /** Patches one updated match into every list currently holding it. */
  const applyMatch = useCallback((match) => {
    const swap = (list) => list.map((m) => (m.id === match.id ? match : m));
    setFeed((f) => (f ? { ...f, upcoming: swap(f.upcoming), recent: swap(f.recent) } : f));
    setHistory((h) => (h ? { ...h, groups: h.groups.map((g) => ({ ...g, matches: swap(g.matches) })) } : h));
    setDetail((d) => (d && d.id === match.id ? match : d));
    setQuick((q) => (q && q.id === match.id ? match : q));
  }, []);

  /** Anything that changes the watched set invalidates the counts and the history list. */
  const refreshDerived = useCallback(() => {
    api.stats(season).then(setStats).catch(() => {});
    if (tab === 'history') {
      api.history({ season, filter: historyFilter }).then(setHistory).catch(() => {});
    }
    api.seasons().then((r) => setSeasons(r.seasons)).catch(() => {});
  }, [season, tab, historyFilter]);

  const setLog = useCallback(
    async (matchId, data) => {
      try {
        const res = await api.saveLog(matchId, data);
        applyMatch(res.match);
        refreshDerived();
        return res.match;
      } catch (err) {
        flash(err instanceof ApiError ? err.message : 'Could not save that', 'negative');
        throw err;
      }
    },
    [applyMatch, refreshDerived, flash],
  );

  const removeLog = useCallback(
    async (matchId) => {
      try {
        const res = await api.removeLog(matchId);
        applyMatch(res.match);
        refreshDerived();
        flash('Removed from history');
      } catch (err) {
        flash(err instanceof ApiError ? err.message : 'Could not remove that', 'negative');
      }
    },
    [applyMatch, refreshDerived, flash],
  );

  /**
   * The one-tap path. The match is logged immediately, then the quick sheet opens to catch
   * a rating and note — so dismissing the sheet still leaves it marked watched.
   */
  const toggleWatched = useCallback(
    async (match) => {
      if (match.log) return removeLog(match.id);
      try {
        const updated = await setLog(match.id, { rating: 0, note: '' });
        setQuick(updated);
      } catch {
        // setLog has already surfaced the failure.
      }
    },
    [removeLog, setLog],
  );

  const toggleFollow = useCallback(
    async (kind, id, following) => {
      const list = kind === 'team' ? setTeams : setCompetitions;
      // Optimistic: the button should respond instantly, and a failure re-syncs below.
      list((items) => items.map((i) => (i.id === id ? { ...i, following } : i)));
      try {
        await api.setFollow(kind, id, following);
        api.feed().then(setFeed).catch(() => {});
      } catch {
        list((items) => items.map((i) => (i.id === id ? { ...i, following: !following } : i)));
        flash('Could not update that follow', 'negative');
      }
    },
    [flash],
  );

  const addCustom = useCallback(
    async (form) => {
      const res = await api.addCustom({
        home: form.home,
        away: form.away,
        competition: form.competition,
        date: form.date,
        time: form.time,
        homeScore: form.homeScore,
        awayScore: form.awayScore,
        rating: form.rating,
        note: form.note,
      });
      setModal(null);
      await loadCore();
      refreshDerived();
      api.filters().then(setFilters).catch(() => {});
      flash('Custom match logged');
      return res.match;
    },
    [loadCore, refreshDerived, flash],
  );

  const deleteCustom = useCallback(
    async (matchId) => {
      try {
        await api.deleteCustom(matchId);
        setDetail(null);
        await loadCore();
        refreshDerived();
        flash('Custom match deleted');
      } catch (err) {
        flash(err instanceof ApiError ? err.message : 'Could not delete that', 'negative');
      }
    },
    [loadCore, refreshDerived, flash],
  );

  const openDetail = useCallback(async (match) => {
    setDetail(match);
    // The card may be from a cached list; refresh it so the sheet shows current data.
    api
      .match(match.id)
      .then((r) => setDetail((d) => (d && d.id === r.match.id ? r.match : d)))
      .catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setFeed(null);
    setStats(null);
    setHistory(null);
    setTab('home');
    setNeedsPicker(false);
  }, []);

  /* ----------------------------------------------------------------- render */

  if (booting) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spinner label="Starting" />
      </div>
    );
  }

  if (!user) {
    return <Onboarding onSignedIn={signedIn} />;
  }

  if (needsPicker) {
    return (
      <FollowPicker
        name={user.name}
        onDone={(count, failure) => {
          setNeedsPicker(false);
          if (failure) flash(failure, 'negative');
          else if (count) flash(`Following ${count} teams and competitions`);
        }}
      />
    );
  }

  const seasonLabel = season === 'all' ? 'All seasons' : season;
  const ready = feed && stats;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header
        user={user}
        tab={tab}
        onTab={setTab}
        theme={theme}
        onTheme={setTheme}
        season={season}
        seasons={seasons}
        onSeason={setSeason}
        onOpenExport={() => setModal('export')}
        onOpenCustom={() => setModal('custom')}
        onOpenAdmin={() => setTab('admin')}
        onLogout={logout}
      />

      <div ref={mainRef} style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 16px 80px' }}>
        {tab === 'admin' && <AdminScreen onClose={() => setTab('home')} onFlash={flash} />}

        {!ready && tab !== 'admin' && <Spinner label="Loading your season" />}

        {ready && tab === 'home' && (
          <HomeFeed
            feed={feed}
            stats={stats}
            seasonLabel={seasonLabel}
            onOpen={openDetail}
            onToggle={toggleWatched}
          />
        )}

        {ready && tab === 'search' && (
          <SearchScreen
            season={season}
            filters={filters}
            onOpen={openDetail}
            onToggle={toggleWatched}
            onOpenCustom={() => setModal('custom')}
          />
        )}

        {ready && tab === 'following' && (
          <Following teams={teams} competitions={competitions} onToggleFollow={toggleFollow} />
        )}

        {ready && tab === 'history' && (
          <History
            history={history}
            loading={historyLoading}
            filter={historyFilter}
            onFilter={setHistoryFilter}
            seasonLabel={seasonLabel}
            onOpen={openDetail}
            onToggle={toggleWatched}
            onOpenExport={() => setModal('export')}
          />
        )}

        {ready && tab === 'stats' && <Stats stats={stats} seasonLabel={seasonLabel} />}
      </div>

      {detail && (
        <MatchDetail
          match={detail}
          onClose={() => setDetail(null)}
          onSetLog={setLog}
          onRemoveLog={removeLog}
          onDeleteCustom={deleteCustom}
        />
      )}

      {quick && (
        <QuickLog
          match={quick}
          onSkip={() => {
            setQuick(null);
            flash('Marked watched');
          }}
          onSave={async ({ rating, note }) => {
            await setLog(quick.id, { rating, note });
            setQuick(null);
            flash(rating || note ? 'Logged with your notes' : 'Marked watched');
          }}
          onOpenDetail={() => {
            const match = quick;
            setQuick(null);
            openDetail(match);
          }}
        />
      )}

      {modal === 'custom' && <CustomMatch onClose={() => setModal(null)} onSave={addCustom} />}
      {modal === 'export' && (
        <ExportModal seasons={seasons} season={season} onClose={() => setModal(null)} />
      )}

      <Toast message={toast?.message} tone={toast?.tone} />
    </div>
  );
}
