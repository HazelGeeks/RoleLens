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
