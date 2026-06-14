import type { FeedImportSnapshot } from "@/lib/feed-types";

const DEFAULT_D1_BINDING = "DB";
const LATEST_SNAPSHOT_KEY = "latest";

type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  run(): Promise<unknown>;
  first<T = unknown>(): Promise<T | null>;
};

type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
};

type SnapshotRow = {
  snapshotJson?: string;
  snapshot_json?: string;
};

function isD1DatabaseLike(value: unknown): value is D1DatabaseLike {
  if (!value || typeof value !== "object") return false;
  return typeof (value as { prepare?: unknown }).prepare === "function";
}

function getD1FromGlobalScope(bindingName: string): D1DatabaseLike | undefined {
  const scope = globalThis as Record<string, unknown> & {
    __env__?: Record<string, unknown>;
    __ENV__?: Record<string, unknown>;
  };

  const direct = scope[bindingName];
  if (isD1DatabaseLike(direct)) return direct;

  const lowerEnvCandidate = scope.__env__?.[bindingName];
  if (isD1DatabaseLike(lowerEnvCandidate)) return lowerEnvCandidate;

  const upperEnvCandidate = scope.__ENV__?.[bindingName];
  if (isD1DatabaseLike(upperEnvCandidate)) return upperEnvCandidate;

  return undefined;
}

async function getD1DatabaseFromContext(): Promise<D1DatabaseLike | undefined> {
  const bindingName =
    process.env.PERSISTENCE_D1_BINDING?.trim() || DEFAULT_D1_BINDING;

  try {
    const { getRequestContext } = await import("@cloudflare/next-on-pages");
    const context = getRequestContext();
    const env = context.env as Record<string, unknown> | undefined;
    const candidate = env?.[bindingName];
    if (isD1DatabaseLike(candidate)) {
      return candidate;
    }
  } catch {
    // Non-Cloudflare runtimes use process/global fallbacks.
  }

  return getD1FromGlobalScope(bindingName);
}

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
