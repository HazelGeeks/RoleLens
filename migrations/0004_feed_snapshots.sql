CREATE TABLE IF NOT EXISTS feed_import_snapshots (
  key TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feed_import_snapshots_generated
  ON feed_import_snapshots (generated_at DESC);
