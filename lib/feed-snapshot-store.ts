import type { FeedImportSnapshot } from "@/lib/feed-types";
import { getD1DatabaseFromContext } from "@/lib/d1";

const LATEST_SNAPSHOT_KEY = "latest";

type SnapshotRow = {
  snapshotJson?: string;
  snapshot_json?: string;
};

function parseSnapshot(value: string | undefined) {
  if (!value) return null;

  try {
    return JSON.parse(value) as FeedImportSnapshot;
  } catch {
    return null;
  }
}

export async function readLatestFeedSnapshotFromD1() {
  const db = await getD1DatabaseFromContext();
  if (!db) return null;

  const row = await db
    .prepare(
      `SELECT snapshot_json AS snapshotJson
       FROM feed_import_snapshots
       WHERE key = ?
       LIMIT 1`,
    )
    .bind(LATEST_SNAPSHOT_KEY)
    .first<SnapshotRow>();

  return parseSnapshot(row?.snapshotJson || row?.snapshot_json);
}

export async function writeLatestFeedSnapshotToD1(snapshot: FeedImportSnapshot) {
  const db = await getD1DatabaseFromContext();
  if (!db) return false;

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO feed_import_snapshots
        (key, generated_at, snapshot_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
        generated_at = excluded.generated_at,
        snapshot_json = excluded.snapshot_json,
        updated_at = excluded.updated_at`,
    )
    .bind(
      LATEST_SNAPSHOT_KEY,
      snapshot.generatedAt,
      JSON.stringify(snapshot),
      now,
      now,
    )
    .run();

  return true;
}
