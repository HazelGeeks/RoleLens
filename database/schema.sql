-- RoleLens canonical schema snapshot
-- Keep this file in sync whenever SQL query/schema changes are introduced.
-- Source baseline: migrations/0001_persistence.sql, 0002_auth.sql, 0003_goals.sql

CREATE TABLE IF NOT EXISTS persistent_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  source_url TEXT,
  status TEXT NOT NULL,
  next_action TEXT,
  follow_up_date TEXT,
  tags_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_device TEXT NOT NULL,
  version INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_persistent_jobs_user_updated
  ON persistent_jobs (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS persistent_job_notes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_persistent_job_notes_job_created
  ON persistent_job_notes (user_id, job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS persistent_job_create_requests (
  user_id TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS idx_persistent_create_requests_job
  ON persistent_job_create_requests (user_id, job_id);

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email
  ON auth_users (email);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
  ON auth_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
  ON auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS persistent_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  company TEXT NOT NULL,
  target_role TEXT,
  motivation TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_persistent_goals_user_updated
  ON persistent_goals (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS persistent_goal_followups (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES persistent_goals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  note TEXT NOT NULL,
  next_action_date TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_persistent_goal_followups_goal_created
  ON persistent_goal_followups (user_id, goal_id, created_at DESC);
