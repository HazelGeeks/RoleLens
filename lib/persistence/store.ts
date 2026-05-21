import type {
  CreatePersistentJobInput,
  PatchPersistentJobResult,
  PersistentJob,
  PersistentJobNote,
  PersistentJobPatch,
} from "@/lib/persistence/types";

const DEFAULT_D1_BINDING = "DB";

const userJobStore = new Map<string, Map<string, PersistentJob>>();
const createRequestIndex = new Map<string, Map<string, string>>();

type PatchArgs = {
  userId: string;
  jobId: string;
  operation: PersistentJobPatch;
  actor: string;
  deviceId: string;
};

type PersistenceBackend =
  | {
      kind: "memory";
    }
  | {
      kind: "d1";
      db: D1DatabaseLike;
    };

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

type JobRow = {
  id: string;
  userId: string;
  company: string;
  title: string;
  location: string | null;
  sourceUrl: string | null;
  status: PersistentJob["status"];
  nextAction: string | null;
  followUpDate: string | null;
  tagsJson: string;
  createdAt: string;
  updatedAt: string;
  updatedByDevice: string;
  version: number;
};

type NoteRow = {
  id: string;
  jobId: string;
  content: string;
  actor: string;
  createdAt: string;
};

type CreateRequestRow = {
  jobId: string;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getUserBucket(userId: string) {
  const existing = userJobStore.get(userId);
  if (existing) return existing;
  const created = new Map<string, PersistentJob>();
  userJobStore.set(userId, created);
  return created;
}

function getCreateRequestBucket(userId: string) {
  const existing = createRequestIndex.get(userId);
  if (existing) return existing;
  const created = new Map<string, string>();
  createRequestIndex.set(userId, created);
  return created;
}

function normalizeTags(tags: string[] | undefined) {
  if (!tags) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawTag of tags) {
    const trimmed = rawTag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function buildNote(content: string, actor: string): PersistentJobNote {
  return {
    id: crypto.randomUUID(),
    content,
    actor,
    createdAt: new Date().toISOString(),
  };
}

function withVersioning(job: PersistentJob, deviceId: string) {
  const now = new Date().toISOString();
  return {
    ...job,
    version: job.version + 1,
    updatedAt: now,
    updatedByDevice: deviceId,
  };
}

function hasOwn<T extends object>(value: T, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isD1DatabaseLike(value: unknown): value is D1DatabaseLike {
  if (!value || typeof value !== "object") return false;
  const maybeDb = value as { prepare?: unknown };
  return typeof maybeDb.prepare === "function";
}

function findD1InEnv(
  env: Record<string, unknown> | undefined,
  preferredName: string,
): D1DatabaseLike | undefined {
  if (!env) return undefined;

  const preferred = env[preferredName];
  if (isD1DatabaseLike(preferred)) return preferred;

  try {
    const hinted = Object.entries(env).find(
      ([key, value]) =>
        key.toLowerCase().includes("db") && isD1DatabaseLike(value),
    )?.[1];
    if (isD1DatabaseLike(hinted)) return hinted;
  } catch {
    // Ignore enumeration failures from runtime-provided env proxies.
  }

  try {
    const first = Object.values(env).find((value) => isD1DatabaseLike(value));
    if (isD1DatabaseLike(first)) return first;
  } catch {
    // Ignore enumeration failures from runtime-provided env proxies.
  }

  return undefined;
}

function getD1FromGlobalScope(bindingName: string): D1DatabaseLike | undefined {
  const scope = globalThis as Record<string, unknown> & {
    __env__?: Record<string, unknown>;
    __ENV__?: Record<string, unknown>;
  };

  const direct = scope[bindingName];
  if (isD1DatabaseLike(direct)) return direct;

  const lowerEnvCandidate = findD1InEnv(scope.__env__, bindingName);
  if (lowerEnvCandidate) return lowerEnvCandidate;

  const upperEnvCandidate = findD1InEnv(scope.__ENV__, bindingName);
  if (upperEnvCandidate) return upperEnvCandidate;

  return undefined;
}

async function getD1DatabaseFromContext(): Promise<D1DatabaseLike | undefined> {
  const bindingName =
    process.env.PERSISTENCE_D1_BINDING?.trim() || DEFAULT_D1_BINDING;

  try {
    const { getRequestContext } = await import("@cloudflare/next-on-pages");
    const context = getRequestContext();
    const env = context.env as Record<string, unknown> | undefined;
    const candidate = findD1InEnv(env, bindingName);
    if (candidate) {
      return candidate;
    }
  } catch {
    // Ignore context lookup errors; global binding fallback is checked below.
  }

  return getD1FromGlobalScope(bindingName);
}

async function resolvePersistenceBackend(): Promise<PersistenceBackend> {
  const configured = process.env.PERSISTENCE_BACKEND?.trim().toLowerCase();

  if (configured && configured !== "memory" && configured !== "d1") {
    throw new Error(
      `Invalid PERSISTENCE_BACKEND value: ${configured}. Expected memory or d1.`,
    );
  }

  if (configured === "memory") {
    return { kind: "memory" };
  }

  const db = await getD1DatabaseFromContext();

  if (configured !== "d1" && db) {
    return { kind: "d1", db };
  }

  if (configured !== "d1") {
    return { kind: "memory" };
  }

  if (!db) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "PERSISTENCE_BACKEND=d1 is configured but D1 binding is unavailable in this runtime; falling back to memory backend.",
      );
      return { kind: "memory" };
    }

    throw new Error(
      "PERSISTENCE_BACKEND=d1 is set, but no D1 binding is available in request context.",
    );
  }

  return { kind: "d1", db };
}

function parseTagsJson(raw: string, jobId: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid tags_json payload for persistent job ${jobId}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid tags_json payload for persistent job ${jobId}`);
  }

  return normalizeTags(
    parsed.filter((entry): entry is string => typeof entry === "string"),
  );
}

function toPersistentJob(row: JobRow, notes: PersistentJobNote[]): PersistentJob {
  return {
    id: row.id,
    userId: row.userId,
    company: row.company,
    title: row.title,
    location: row.location ?? undefined,
    sourceUrl: row.sourceUrl ?? undefined,
    status: row.status,
    nextAction: row.nextAction ?? undefined,
    followUpDate: row.followUpDate ?? undefined,
    tags: parseTagsJson(row.tagsJson, row.id),
    notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    updatedByDevice: row.updatedByDevice,
    version: row.version,
  };
}

function applyPatchOperation(
  current: PersistentJob,
  operation: PersistentJobPatch,
  actor: string,
) {
  const next = clone(current);
  let appendedNote: PersistentJobNote | undefined;

  if (operation.op === "update") {
    if (hasOwn(operation.changes, "company") && operation.changes.company) {
      next.company = operation.changes.company;
    }
    if (hasOwn(operation.changes, "title") && operation.changes.title) {
      next.title = operation.changes.title;
    }
    if (hasOwn(operation.changes, "location")) {
      next.location = operation.changes.location;
    }
    if (hasOwn(operation.changes, "sourceUrl")) {
      next.sourceUrl = operation.changes.sourceUrl;
    }
    if (hasOwn(operation.changes, "nextAction")) {
      next.nextAction = operation.changes.nextAction;
    }
    if (hasOwn(operation.changes, "followUpDate")) {
      next.followUpDate = operation.changes.followUpDate;
    }
    if (hasOwn(operation.changes, "tags")) {
      next.tags = normalizeTags(operation.changes.tags);
    }
  }

  if (operation.op === "status") {
    next.status = operation.status;
    if (operation.note) {
      appendedNote = buildNote(operation.note, actor);
      next.notes = [appendedNote, ...next.notes];
    }
  }

  if (operation.op === "note") {
    appendedNote = buildNote(operation.content, actor);
    next.notes = [appendedNote, ...next.notes];
  }

  return {
    next,
    appendedNote,
  };
}

async function listPersistentJobsInMemory(
  userId: string,
): Promise<PersistentJob[]> {
  const bucket = getUserBucket(userId);
  return Array.from(bucket.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((job) => clone(job));
}

async function getPersistentJobInMemory(
  userId: string,
  jobId: string,
): Promise<PersistentJob | undefined> {
  const bucket = getUserBucket(userId);
  const found = bucket.get(jobId);
  return found ? clone(found) : undefined;
}

async function createPersistentJobInMemory(args: {
  userId: string;
  deviceId: string;
  actor: string;
  input: CreatePersistentJobInput;
}): Promise<PersistentJob> {
  const bucket = getUserBucket(args.userId);
  const requestBucket = getCreateRequestBucket(args.userId);
  const requestId = args.input.clientRequestId?.trim();

  if (requestId) {
    const existingId = requestBucket.get(requestId);
    if (existingId) {
      const replayed = bucket.get(existingId);
      if (replayed) return clone(replayed);
    }
  }

  const now = new Date().toISOString();
  const initialNote = args.input.initialNote
    ? [buildNote(args.input.initialNote, args.actor)]
    : [];

  const job: PersistentJob = {
    id: crypto.randomUUID(),
    userId: args.userId,
    company: args.input.company,
    title: args.input.title,
    location: args.input.location,
    sourceUrl: args.input.sourceUrl,
    status: args.input.status || "NONE",
    nextAction: args.input.nextAction,
    followUpDate: args.input.followUpDate,
    tags: normalizeTags(args.input.tags),
    notes: initialNote,
    createdAt: now,
    updatedAt: now,
    updatedByDevice: args.deviceId,
    version: 1,
  };

  bucket.set(job.id, job);
  if (requestId) requestBucket.set(requestId, job.id);

  return clone(job);
}

async function patchPersistentJobInMemory(
  args: PatchArgs,
): Promise<PatchPersistentJobResult> {
  const bucket = getUserBucket(args.userId);
  const current = bucket.get(args.jobId);

  if (!current) {
    return {
      ok: false,
      reason: "NOT_FOUND",
    };
  }

  if (
    args.operation.expectedVersion != null &&
    args.operation.expectedVersion !== current.version
  ) {
    return {
      ok: false,
      reason: "VERSION_CONFLICT",
      current: clone(current),
    };
  }

  const { next } = applyPatchOperation(current, args.operation, args.actor);
  const versioned = withVersioning(next, args.deviceId);
  bucket.set(versioned.id, versioned);

  return {
    ok: true,
    job: clone(versioned),
  };
}

async function listNotesByJobIdInD1(
  db: D1DatabaseLike,
  userId: string,
): Promise<Map<string, PersistentJobNote[]>> {
  const result = await db
    .prepare(
      `SELECT id,
              job_id AS jobId,
              content,
              actor,
              created_at AS createdAt
         FROM persistent_job_notes
        WHERE user_id = ?
        ORDER BY created_at DESC`,
    )
    .bind(userId)
    .all<NoteRow>();

  const notesByJobId = new Map<string, PersistentJobNote[]>();

  for (const row of result.results) {
    const note: PersistentJobNote = {
      id: row.id,
      content: row.content,
      actor: row.actor,
      createdAt: row.createdAt,
    };

    const existing = notesByJobId.get(row.jobId);
    if (existing) {
      existing.push(note);
      continue;
    }

    notesByJobId.set(row.jobId, [note]);
  }

  return notesByJobId;
}

async function listNotesForJobInD1(
  db: D1DatabaseLike,
  userId: string,
  jobId: string,
): Promise<PersistentJobNote[]> {
  const result = await db
    .prepare(
      `SELECT id,
              job_id AS jobId,
              content,
              actor,
              created_at AS createdAt
         FROM persistent_job_notes
        WHERE user_id = ? AND job_id = ?
        ORDER BY created_at DESC`,
    )
    .bind(userId, jobId)
    .all<NoteRow>();

  return result.results.map((row) => ({
    id: row.id,
    content: row.content,
    actor: row.actor,
    createdAt: row.createdAt,
  }));
}

async function getCreateRequestJobIdInD1(
  db: D1DatabaseLike,
  userId: string,
  clientRequestId: string,
): Promise<string | undefined> {
  const row = await db
    .prepare(
      `SELECT job_id AS jobId
         FROM persistent_job_create_requests
        WHERE user_id = ? AND client_request_id = ?`,
    )
    .bind(userId, clientRequestId)
    .first<CreateRequestRow>();

  return row?.jobId;
}

async function getPersistentJobInD1(
  db: D1DatabaseLike,
  userId: string,
  jobId: string,
): Promise<PersistentJob | undefined> {
  const row = await db
    .prepare(
      `SELECT id,
              user_id AS userId,
              company,
              title,
              location,
              source_url AS sourceUrl,
              status,
              next_action AS nextAction,
              follow_up_date AS followUpDate,
              tags_json AS tagsJson,
              created_at AS createdAt,
              updated_at AS updatedAt,
              updated_by_device AS updatedByDevice,
              version
         FROM persistent_jobs
        WHERE user_id = ? AND id = ?`,
    )
    .bind(userId, jobId)
    .first<JobRow>();

  if (!row) return undefined;

  const notes = await listNotesForJobInD1(db, userId, jobId);
  return toPersistentJob(row, notes);
}

async function listPersistentJobsInD1(
  db: D1DatabaseLike,
  userId: string,
): Promise<PersistentJob[]> {
  const jobsResult = await db
    .prepare(
      `SELECT id,
              user_id AS userId,
              company,
              title,
              location,
              source_url AS sourceUrl,
              status,
              next_action AS nextAction,
              follow_up_date AS followUpDate,
              tags_json AS tagsJson,
              created_at AS createdAt,
              updated_at AS updatedAt,
              updated_by_device AS updatedByDevice,
              version
         FROM persistent_jobs
        WHERE user_id = ?
        ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<JobRow>();

  const notesByJobId = await listNotesByJobIdInD1(db, userId);

  return jobsResult.results.map((row) =>
    toPersistentJob(row, notesByJobId.get(row.id) ?? []),
  );
}

async function insertPersistentNoteInD1(
  db: D1DatabaseLike,
  userId: string,
  jobId: string,
  note: PersistentJobNote,
) {
  await db
    .prepare(
      `INSERT INTO persistent_job_notes
       (id, job_id, user_id, content, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(note.id, jobId, userId, note.content, note.actor, note.createdAt)
    .run();
}

function toNullableValue(value: string | undefined): string | null {
  return value ?? null;
}

function getChangedCount(result: { meta?: { changes?: number } }) {
  return result.meta?.changes ?? 0;
}

function isLikelyUniqueConstraintError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes("unique");
}

async function createPersistentJobInD1(args: {
  userId: string;
  deviceId: string;
  actor: string;
  input: CreatePersistentJobInput;
  db: D1DatabaseLike;
}): Promise<PersistentJob> {
  const requestId = args.input.clientRequestId?.trim();

  if (requestId) {
    const mappedJobId = await getCreateRequestJobIdInD1(
      args.db,
      args.userId,
      requestId,
    );
    if (mappedJobId) {
      const replayed = await getPersistentJobInD1(args.db, args.userId, mappedJobId);
      if (replayed) return replayed;
    }
  }

  const now = new Date().toISOString();
  const createdJobId = crypto.randomUUID();
  const tags = normalizeTags(args.input.tags);

  await args.db
    .prepare(
      `INSERT INTO persistent_jobs
       (id, user_id, company, title, location, source_url, status, next_action, follow_up_date, tags_json, created_at, updated_at, updated_by_device, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      createdJobId,
      args.userId,
      args.input.company,
      args.input.title,
      toNullableValue(args.input.location),
      toNullableValue(args.input.sourceUrl),
      args.input.status || "NONE",
      toNullableValue(args.input.nextAction),
      toNullableValue(args.input.followUpDate),
      JSON.stringify(tags),
      now,
      now,
      args.deviceId,
      1,
    )
    .run();

  if (args.input.initialNote) {
    await insertPersistentNoteInD1(args.db, args.userId, createdJobId, {
      id: crypto.randomUUID(),
      content: args.input.initialNote,
      actor: args.actor,
      createdAt: now,
    });
  }

  if (requestId) {
    try {
      await args.db
        .prepare(
          `INSERT INTO persistent_job_create_requests
           (user_id, client_request_id, job_id, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(args.userId, requestId, createdJobId, now)
        .run();
    } catch (error) {
      if (!isLikelyUniqueConstraintError(error)) {
        throw error;
      }

      const mappedJobId = await getCreateRequestJobIdInD1(
        args.db,
        args.userId,
        requestId,
      );

      if (!mappedJobId) {
        throw error;
      }

      await args.db
        .prepare(`DELETE FROM persistent_job_notes WHERE user_id = ? AND job_id = ?`)
        .bind(args.userId, createdJobId)
        .run();
      await args.db
        .prepare(`DELETE FROM persistent_jobs WHERE user_id = ? AND id = ?`)
        .bind(args.userId, createdJobId)
        .run();

      const replayed = await getPersistentJobInD1(args.db, args.userId, mappedJobId);
      if (replayed) return replayed;

      throw new Error(
        `Client request id ${requestId} already exists but mapped job ${mappedJobId} was not found.`,
      );
    }
  }

  const created = await getPersistentJobInD1(args.db, args.userId, createdJobId);
  if (!created) {
    throw new Error(`Failed to load created persistent job ${createdJobId}.`);
  }

  return created;
}

async function patchPersistentJobInD1(
  args: PatchArgs & { db: D1DatabaseLike },
): Promise<PatchPersistentJobResult> {
  const current = await getPersistentJobInD1(args.db, args.userId, args.jobId);

  if (!current) {
    return {
      ok: false,
      reason: "NOT_FOUND",
    };
  }

  if (
    args.operation.expectedVersion != null &&
    args.operation.expectedVersion !== current.version
  ) {
    return {
      ok: false,
      reason: "VERSION_CONFLICT",
      current,
    };
  }

  const { next, appendedNote } = applyPatchOperation(
    current,
    args.operation,
    args.actor,
  );

  const now = new Date().toISOString();
  const nextVersion = current.version + 1;

  const statement = args.db.prepare(
    args.operation.expectedVersion != null
      ? `UPDATE persistent_jobs
           SET company = ?,
               title = ?,
               location = ?,
               source_url = ?,
               status = ?,
               next_action = ?,
               follow_up_date = ?,
               tags_json = ?,
               version = ?,
               updated_at = ?,
               updated_by_device = ?
         WHERE user_id = ?
           AND id = ?
           AND version = ?`
      : `UPDATE persistent_jobs
           SET company = ?,
               title = ?,
               location = ?,
               source_url = ?,
               status = ?,
               next_action = ?,
               follow_up_date = ?,
               tags_json = ?,
               version = ?,
               updated_at = ?,
               updated_by_device = ?
         WHERE user_id = ?
           AND id = ?`,
  );

  const values: unknown[] = [
    next.company,
    next.title,
    toNullableValue(next.location),
    toNullableValue(next.sourceUrl),
    next.status,
    toNullableValue(next.nextAction),
    toNullableValue(next.followUpDate),
    JSON.stringify(normalizeTags(next.tags)),
    nextVersion,
    now,
    args.deviceId,
    args.userId,
    args.jobId,
  ];

  if (args.operation.expectedVersion != null) {
    values.push(args.operation.expectedVersion);
  }

  const updateResult = await statement.bind(...values).run();
  if (getChangedCount(updateResult) !== 1) {
    if (args.operation.expectedVersion != null) {
      const latest = await getPersistentJobInD1(args.db, args.userId, args.jobId);
      if (!latest) {
        return {
          ok: false,
          reason: "NOT_FOUND",
        };
      }

      return {
        ok: false,
        reason: "VERSION_CONFLICT",
        current: latest,
      };
    }

    return {
      ok: false,
      reason: "NOT_FOUND",
    };
  }

  if (appendedNote) {
    await insertPersistentNoteInD1(args.db, args.userId, args.jobId, appendedNote);
  }

  const updated = await getPersistentJobInD1(args.db, args.userId, args.jobId);
  if (!updated) {
    throw new Error(`Failed to load updated persistent job ${args.jobId}.`);
  }

  return {
    ok: true,
    job: updated,
  };
}

export async function listPersistentJobs(
  userId: string,
): Promise<PersistentJob[]> {
  const backend = await resolvePersistenceBackend();
  if (backend.kind === "d1") {
    return listPersistentJobsInD1(backend.db, userId);
  }

  return listPersistentJobsInMemory(userId);
}

export async function getPersistentJob(
  userId: string,
  jobId: string,
): Promise<PersistentJob | undefined> {
  const backend = await resolvePersistenceBackend();
  if (backend.kind === "d1") {
    return getPersistentJobInD1(backend.db, userId, jobId);
  }

  return getPersistentJobInMemory(userId, jobId);
}

export async function createPersistentJob(args: {
  userId: string;
  deviceId: string;
  actor: string;
  input: CreatePersistentJobInput;
}): Promise<PersistentJob> {
  const backend = await resolvePersistenceBackend();
  if (backend.kind === "d1") {
    return createPersistentJobInD1({
      ...args,
      db: backend.db,
    });
  }

  return createPersistentJobInMemory(args);
}

export async function patchPersistentJob(
  args: PatchArgs,
): Promise<PatchPersistentJobResult> {
  const backend = await resolvePersistenceBackend();
  if (backend.kind === "d1") {
    return patchPersistentJobInD1({
      ...args,
      db: backend.db,
    });
  }

  return patchPersistentJobInMemory(args);
}

export function resetPersistentStoreForTests() {
  userJobStore.clear();
  createRequestIndex.clear();
}
