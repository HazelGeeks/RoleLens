import type {
  CreatePersistentJobInput,
  PatchPersistentJobResult,
  PersistentJob,
  PersistentJobPatch,
} from "@/lib/persistence/types";

const userJobStore = new Map<string, Map<string, PersistentJob>>();
const createRequestIndex = new Map<string, Map<string, string>>();

type PatchArgs = {
  userId: string;
  jobId: string;
  operation: PersistentJobPatch;
  actor: string;
  deviceId: string;
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

function buildNote(content: string, actor: string) {
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

export async function listPersistentJobs(
  userId: string,
): Promise<PersistentJob[]> {
  const bucket = getUserBucket(userId);
  return Array.from(bucket.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((job) => clone(job));
}

export async function getPersistentJob(
  userId: string,
  jobId: string,
): Promise<PersistentJob | undefined> {
  const bucket = getUserBucket(userId);
  const found = bucket.get(jobId);
  return found ? clone(found) : undefined;
}

export async function createPersistentJob(args: {
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
  const job: PersistentJob = {
    id: crypto.randomUUID(),
    userId: args.userId,
    company: args.input.company,
    title: args.input.title,
    location: args.input.location,
    sourceUrl: args.input.sourceUrl,
    status: args.input.status || "SAVE",
    nextAction: args.input.nextAction,
    followUpDate: args.input.followUpDate,
    tags: normalizeTags(args.input.tags),
    notes: args.input.initialNote
      ? [buildNote(args.input.initialNote, args.actor)]
      : [],
    createdAt: now,
    updatedAt: now,
    updatedByDevice: args.deviceId,
    version: 1,
  };

  bucket.set(job.id, job);
  if (requestId) requestBucket.set(requestId, job.id);

  return clone(job);
}

export async function patchPersistentJob(
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

  let next = clone(current);

  if (args.operation.op === "update") {
    if (
      hasOwn(args.operation.changes, "company") &&
      args.operation.changes.company
    ) {
      next.company = args.operation.changes.company;
    }
    if (
      hasOwn(args.operation.changes, "title") &&
      args.operation.changes.title
    ) {
      next.title = args.operation.changes.title;
    }
    if (hasOwn(args.operation.changes, "location")) {
      next.location = args.operation.changes.location;
    }
    if (hasOwn(args.operation.changes, "sourceUrl")) {
      next.sourceUrl = args.operation.changes.sourceUrl;
    }
    if (hasOwn(args.operation.changes, "nextAction")) {
      next.nextAction = args.operation.changes.nextAction;
    }
    if (hasOwn(args.operation.changes, "followUpDate")) {
      next.followUpDate = args.operation.changes.followUpDate;
    }
    if (hasOwn(args.operation.changes, "tags")) {
      next.tags = normalizeTags(args.operation.changes.tags);
    }
  }

  if (args.operation.op === "status") {
    next.status = args.operation.status;
    if (args.operation.note) {
      next.notes = [buildNote(args.operation.note, args.actor), ...next.notes];
    }
  }

  if (args.operation.op === "note") {
    next.notes = [buildNote(args.operation.content, args.actor), ...next.notes];
  }

  next = withVersioning(next, args.deviceId);
  bucket.set(next.id, next);

  return {
    ok: true,
    job: clone(next),
  };
}

export function resetPersistentStoreForTests() {
  userJobStore.clear();
  createRequestIndex.clear();
}
