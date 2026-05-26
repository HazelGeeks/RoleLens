const DEFAULT_D1_BINDING = "DB";
const DEFAULT_RETENTION_COUNT = 3;
const MAX_CHUNK_SIZE_BYTES = 500_000;

type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  run(): Promise<{
    meta?: {
      changes?: number;
    };
  }>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
};

type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
};

type SnapshotRow = {
  id: string;
  generatedAt: string;
  importedAt: string;
  sourceCount: number;
  jobCount: number;
};

type ChunkRow = {
  chunkIndex: number;
  payloadChunk: string;
};

export type ScrapedFeedSnapshotPayload = {
  generatedAt: string;
  sourceCount: number;
  jobs: unknown[];
  sourceResults: unknown[];
  errors: unknown[];
};

export type StoredScrapedFeedSnapshot = ScrapedFeedSnapshotPayload & {
  snapshotId: string;
  importedAt: string;
};

type SaveResult = {
  snapshotId: string;
  importedAt: string;
  generatedAt: string;
  sourceCount: number;
  jobCount: number;
};

let memorySnapshot: StoredScrapedFeedSnapshot | null = null;
const ensuredDbs = new WeakSet<object>();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isD1DatabaseLike(value: unknown): value is D1DatabaseLike {
  if (!value || typeof value !== "object") return false;
  const maybeDb = value as { prepare?: unknown };
  return typeof maybeDb.prepare === "function";
}

function getD1BindingName(env: NodeJS.ProcessEnv) {
  const configured = env.SCRAPED_FEED_D1_BINDING?.trim();
  if (configured) return configured;

  const persistenceBinding = env.PERSISTENCE_D1_BINDING?.trim();
  if (persistenceBinding) return persistenceBinding;

  return DEFAULT_D1_BINDING;
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

async function getD1Database(env: NodeJS.ProcessEnv): Promise<D1DatabaseLike | undefined> {
  const bindingName = getD1BindingName(env);

  try {
    const { getRequestContext } = await import("@cloudflare/next-on-pages");
    const context = getRequestContext();
    const runtimeEnv = context.env as Record<string, unknown> | undefined;
    const candidate = runtimeEnv?.[bindingName];
    if (isD1DatabaseLike(candidate)) return candidate;
  } catch {
    // Ignore context lookup errors. Fallback to global scope below.
  }

  return getD1FromGlobalScope(bindingName);
}

async function ensureScrapedFeedTables(db: D1DatabaseLike) {
  const key = db as unknown as object;
  if (ensuredDbs.has(key)) return;

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS scraped_feed_snapshots (
         id TEXT PRIMARY KEY,
         generated_at TEXT NOT NULL,
         imported_at TEXT NOT NULL,
         source_count INTEGER NOT NULL,
         job_count INTEGER NOT NULL
       )`,
    )
    .run();

  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_scraped_feed_snapshots_imported
         ON scraped_feed_snapshots (imported_at DESC)`,
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS scraped_feed_snapshot_chunks (
         snapshot_id TEXT NOT NULL REFERENCES scraped_feed_snapshots(id) ON DELETE CASCADE,
         chunk_index INTEGER NOT NULL,
         payload_chunk TEXT NOT NULL,
         PRIMARY KEY (snapshot_id, chunk_index)
       )`,
    )
    .run();

  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_scraped_feed_snapshot_chunks_snapshot
         ON scraped_feed_snapshot_chunks (snapshot_id, chunk_index)`,
    )
    .run();

  ensuredDbs.add(key);
}

function normalizeIsoDate(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function normalizePayload(input: unknown): ScrapedFeedSnapshotPayload {
  const root = asRecord(input);
  const now = new Date().toISOString();
  const jobs = Array.isArray(root?.jobs) ? root.jobs : [];
  const sourceResults = Array.isArray(root?.sourceResults) ? root.sourceResults : [];
  const errors = Array.isArray(root?.errors) ? root.errors : [];
  const sourceCountFromInput = asNumber(root?.sourceCount);

  return {
    generatedAt: normalizeIsoDate(asString(root?.generatedAt), now),
    sourceCount: sourceCountFromInput ?? sourceResults.length,
    jobs,
    sourceResults,
    errors,
  };
}

function splitIntoChunks(value: string, chunkSize: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks.length > 0 ? chunks : [""];
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

async function pruneOldSnapshots(
  db: D1DatabaseLike,
  keepCount: number,
  latestSnapshotId: string,
) {
  const retainRows = await db
    .prepare(
      `SELECT id
         FROM scraped_feed_snapshots
        ORDER BY imported_at DESC
        LIMIT ?`,
    )
    .bind(keepCount)
    .all<{ id: string }>();

  const retainIds = new Set(retainRows.results.map((row) => row.id));
  retainIds.add(latestSnapshotId);

  const existingRows = await db
    .prepare(`SELECT id FROM scraped_feed_snapshots`)
    .all<{ id: string }>();

  for (const row of existingRows.results) {
    if (retainIds.has(row.id)) continue;
    await db
      .prepare(`DELETE FROM scraped_feed_snapshot_chunks WHERE snapshot_id = ?`)
      .bind(row.id)
      .run();
    await db
      .prepare(`DELETE FROM scraped_feed_snapshots WHERE id = ?`)
      .bind(row.id)
      .run();
  }
}

export async function saveScrapedFeedSnapshot(
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SaveResult> {
  const payload = normalizePayload(input);
  const serializedPayload = JSON.stringify(payload);
  const chunks = splitIntoChunks(serializedPayload, MAX_CHUNK_SIZE_BYTES);
  const importedAt = new Date().toISOString();
  const snapshotId = crypto.randomUUID();
  const db = await getD1Database(env);

  if (!db) {
    memorySnapshot = {
      snapshotId,
      importedAt,
      ...payload,
    };

    return {
      snapshotId,
      importedAt,
      generatedAt: payload.generatedAt,
      sourceCount: payload.sourceCount,
      jobCount: payload.jobs.length,
    };
  }

  await ensureScrapedFeedTables(db);

  await db
    .prepare(
      `INSERT INTO scraped_feed_snapshots
       (id, generated_at, imported_at, source_count, job_count)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      snapshotId,
      payload.generatedAt,
      importedAt,
      payload.sourceCount,
      payload.jobs.length,
    )
    .run();

  for (let index = 0; index < chunks.length; index += 1) {
    await db
      .prepare(
        `INSERT INTO scraped_feed_snapshot_chunks
         (snapshot_id, chunk_index, payload_chunk)
         VALUES (?, ?, ?)`,
      )
      .bind(snapshotId, index, chunks[index] as string)
      .run();
  }

  const retentionCount = parsePositiveInteger(
    env.SCRAPED_FEED_RETENTION_COUNT,
    DEFAULT_RETENTION_COUNT,
  );
  await pruneOldSnapshots(db, retentionCount, snapshotId);

  return {
    snapshotId,
    importedAt,
    generatedAt: payload.generatedAt,
    sourceCount: payload.sourceCount,
    jobCount: payload.jobs.length,
  };
}

export async function readLatestScrapedFeedSnapshot(
  env: NodeJS.ProcessEnv = process.env,
): Promise<StoredScrapedFeedSnapshot | null> {
  const db = await getD1Database(env);
  if (!db) return memorySnapshot;

  await ensureScrapedFeedTables(db);

  const latest = await db
    .prepare(
      `SELECT id,
              generated_at AS generatedAt,
              imported_at AS importedAt,
              source_count AS sourceCount,
              job_count AS jobCount
         FROM scraped_feed_snapshots
        ORDER BY imported_at DESC
        LIMIT 1`,
    )
    .first<SnapshotRow>();

  if (!latest) return null;

  const chunkRows = await db
    .prepare(
      `SELECT chunk_index AS chunkIndex,
              payload_chunk AS payloadChunk
         FROM scraped_feed_snapshot_chunks
        WHERE snapshot_id = ?
        ORDER BY chunk_index ASC`,
    )
    .bind(latest.id)
    .all<ChunkRow>();

  if (chunkRows.results.length === 0) return null;

  const serializedPayload = chunkRows.results
    .map((row) => row.payloadChunk)
    .join("");
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(serializedPayload);
  } catch {
    return null;
  }

  const normalized = normalizePayload(parsedPayload);

  return {
    snapshotId: latest.id,
    importedAt: latest.importedAt,
    generatedAt: normalized.generatedAt,
    sourceCount: normalized.sourceCount,
    jobs: normalized.jobs,
    sourceResults: normalized.sourceResults,
    errors: normalized.errors,
  };
}
