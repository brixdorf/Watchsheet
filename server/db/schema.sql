-- Watchsheet schema. Every statement is IF NOT EXISTS so migrate.js can run on every boot.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- One row per code issued. Kept after use so the resend cooldown can be enforced
-- from history rather than from memory.
CREATE TABLE IF NOT EXISTS otp_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  name        TEXT,
  code_hash   TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_at INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email, created_at DESC);

-- resolved: 0 = pending lookup, 1 = matched against the provider, -1 = looked up, no match.
-- Only resolved = 1 rows are exposed to the UI.
CREATE TABLE IF NOT EXISTS competitions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id  TEXT UNIQUE,
  name         TEXT NOT NULL,
  short        TEXT,
  display_name TEXT,
  country_code TEXT,
  country_name TEXT,
  logo_url     TEXT,
  seed_name    TEXT,
  country_hint TEXT,
  is_seed      INTEGER NOT NULL DEFAULT 0,
  resolved     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  -- Bulk-sync rotation state: which season we pull, how far through its pages we got,
  -- and when the last complete pass finished.
  provider_season   INTEGER,
  sync_cursor       INTEGER NOT NULL DEFAULT 0,
  sync_total        INTEGER,
  last_full_sync_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_comp_resolved ON competitions(resolved);
CREATE INDEX IF NOT EXISTS idx_comp_rotation ON competitions(resolved, last_full_sync_at);

CREATE TABLE IF NOT EXISTS teams (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id  TEXT UNIQUE,
  name         TEXT NOT NULL,
  short        TEXT,
  color        TEXT,
  logo_url     TEXT,
  country_code TEXT,
  seed_name    TEXT,
  is_national  INTEGER NOT NULL DEFAULT 0,
  is_seed      INTEGER NOT NULL DEFAULT 0,
  resolved     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_team_resolved ON teams(resolved);

-- Provider matches and user-authored custom matches share this table. Custom rows carry
-- owner_user_id and free-text names; provider rows carry provider_id and FK team ids.
CREATE TABLE IF NOT EXISTS matches (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id      TEXT UNIQUE,
  competition_id   INTEGER REFERENCES competitions(id) ON DELETE SET NULL,
  competition_name TEXT NOT NULL,
  home_team_id     INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  home_name        TEXT NOT NULL,
  away_team_id     INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  away_name        TEXT NOT NULL,
  kickoff_utc      INTEGER NOT NULL,
  home_score       INTEGER,
  away_score       INTEGER,
  status           TEXT NOT NULL DEFAULT 'scheduled',
  season           TEXT NOT NULL,
  round            TEXT,
  is_custom        INTEGER NOT NULL DEFAULT 0,
  owner_user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON matches(kickoff_utc);
CREATE INDEX IF NOT EXISTS idx_matches_comp    ON matches(competition_id, kickoff_utc);
CREATE INDEX IF NOT EXISTS idx_matches_season  ON matches(season);
CREATE INDEX IF NOT EXISTS idx_matches_home    ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away    ON matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_owner   ON matches(owner_user_id);

CREATE TABLE IF NOT EXISTS watch_logs (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  watched    INTEGER NOT NULL DEFAULT 1,
  rating     INTEGER NOT NULL DEFAULT 0,
  note       TEXT NOT NULL DEFAULT '',
  watched_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, match_id)
);
CREATE INDEX IF NOT EXISTS idx_logs_user ON watch_logs(user_id, watched);

CREATE TABLE IF NOT EXISTS follows (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('team', 'competition')),
  entity_id  INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_user ON follows(user_id);

-- One row per UTC day. remaining_reported mirrors x-ratelimit-requests-remaining and
-- is authoritative when it disagrees with our own count.
CREATE TABLE IF NOT EXISTS api_usage (
  day                TEXT PRIMARY KEY,
  requests           INTEGER NOT NULL DEFAULT 0,
  remaining_reported INTEGER,
  limit_reported     INTEGER,
  updated_at         INTEGER NOT NULL
);

-- A local copy of the provider's league catalog (~900 rows), filled page by page.
-- Caching it means a budget stop resumes at an offset instead of restarting, and
-- re-matching the seed list after an alias change costs nothing.
CREATE TABLE IF NOT EXISTS provider_leagues (
  provider_id  TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  country_code TEXT,
  country_name TEXT,
  logo_url     TEXT,
  seasons_json TEXT,
  fetched_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);
