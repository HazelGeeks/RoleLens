CREATE TABLE IF NOT EXISTS scraped_feed_snapshots (
  id TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  source_count INTEGER NOT NULL,
  job_count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scraped_feed_snapshots_imported
  ON scraped_feed_snapshots (imported_at DESC);

CREATE TABLE IF NOT EXISTS scraped_feed_snapshot_chunks (
  snapshot_id TEXT NOT NULL REFERENCES scraped_feed_snapshots(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  payload_chunk TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_scraped_feed_snapshot_chunks_snapshot
  ON scraped_feed_snapshot_chunks (snapshot_id, chunk_index);
