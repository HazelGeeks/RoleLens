import {
  getJobsFromStorage,
  saveJobsToStorage,
  type LocalJobPosting,
} from "@/lib/local-jobs";
import type {
  CreatePersistentJobInput,
  PersistentJob,
  PersistentJobPatch,
} from "@/lib/persistence/types";
import { getActiveAuthSessionUserId } from "@/lib/auth-client";

const USER_ID_KEY = "rolelens.persistence.userId";
const DEVICE_ID_KEY = "rolelens.persistence.deviceId";
const TOKEN_KEY = "rolelens.persistence.token";

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function createFallbackHistory(status: LocalJobPosting["status"], changedAt: string) {
  return [
    {
      id: crypto.randomUUID(),
      status,
      changedAt,
      note: "Imported from persistence",
    },
  ];
}

function getIdentity() {
  if (typeof window === "undefined") {
    return {
      userId: "server-user",
      deviceId: "server-device",
    };
  }

  const activeSessionUserId = getActiveAuthSessionUserId();
  let userId: string;
  if (activeSessionUserId) {
    userId = `account-${activeSessionUserId}`;
  } else {
    const cachedUserId = window.localStorage.getItem(USER_ID_KEY);
    userId = cachedUserId || `local-user-${crypto.randomUUID()}`;
    if (!cachedUserId) {
      window.localStorage.setItem(USER_ID_KEY, userId);
    }
  }

  let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `web-${crypto.randomUUID()}`;
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return { userId, deviceId };
}

export function buildPersistenceHeaders() {
  const { userId, deviceId } = getIdentity();
  const headers = new Headers({
    "content-type": "application/json",
    "x-rolelens-user": userId,
    "x-rolelens-device": deviceId,
  });

  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem(TOKEN_KEY)?.trim();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }

  return headers;
}

function sameTags(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].map((tag) => tag.toLowerCase()).sort();
  const sortedRight = [...right].map((tag) => tag.toLowerCase()).sort();
  return sortedLeft.every((tag, index) => tag === sortedRight[index]);
}

function findMatchingPersistentJob(
  localJob: LocalJobPosting,
  persistentJobs: PersistentJob[],
) {
  if (localJob.persistentId) {
    const byPersistentId = persistentJobs.find(
      (job) => job.id === localJob.persistentId,
    );
    if (byPersistentId) return byPersistentId;
  }

  if (localJob.sourceUrl) {
    const bySourceUrl = persistentJobs.find(
      (job) =>
        job.sourceUrl &&
        normalizeKey(job.sourceUrl) === normalizeKey(localJob.sourceUrl || ""),
    );
    if (bySourceUrl) return bySourceUrl;
  }

  return persistentJobs.find(
    (job) =>
      normalizeKey(job.company) === normalizeKey(localJob.company) &&
      normalizeKey(job.title) === normalizeKey(localJob.title),
  );
}

async function ensureOkResponse(response: Response) {
  if (response.ok) return;

  let details = "";
  try {
    const payload = (await response.json()) as { message?: string };
    if (payload?.message) details = `: ${payload.message}`;
  } catch {
    details = "";
  }

  throw new Error(`Persistence request failed (${response.status})${details}`);
}

export function isPersistenceNotFoundError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes("Persistence request failed (404)");
}

export function toLocalJobFromPersistent(
  job: PersistentJob,
  existing?: LocalJobPosting,
): LocalJobPosting {
  const fallbackId = existing?.id ?? `db-${job.id}`;
  const notes = job.notes.map((note) => ({
    id: note.id,
    content: note.content,
    createdAt: note.createdAt,
  }));

  const merged: LocalJobPosting = {
    id: fallbackId,
    persistentId: job.id,
    source: existing?.source ?? "MANUAL",
    sourceUrl: job.sourceUrl || existing?.sourceUrl,
    company: job.company,
    title: job.title,
    location: job.location || existing?.location,
    remoteType: existing?.remoteType ?? "UNKNOWN",
    employmentType: existing?.employmentType,
    salaryMin: existing?.salaryMin,
    salaryMax: existing?.salaryMax,
    salaryCurrency: existing?.salaryCurrency,
    seniority: existing?.seniority,
    workAuthorizationNote: existing?.workAuthorizationNote,
    descriptionRaw: existing?.descriptionRaw || "",
    extractedSkills: existing?.extractedSkills || [],
    fitScore: existing?.fitScore ?? 0,
    fitBreakdown: existing?.fitBreakdown,
    status: job.status,
    nextAction: job.nextAction,
    followUpDate: job.followUpDate,
    publishedAt: existing?.publishedAt,
    lastStatusChangedAt: existing?.lastStatusChangedAt || job.updatedAt,
    statusHistory:
      existing?.statusHistory && existing.statusHistory.length > 0
        ? existing.statusHistory
        : createFallbackHistory(job.status, job.createdAt),
    tags: Array.from(new Set([...(existing?.tags || []), ...job.tags])),
    notes,
    createdAt: existing?.createdAt || job.createdAt,
    updatedAt: job.updatedAt,
    persistentVersion: job.version,
  };

  return merged;
}

export function mergeLocalWithPersistent(
  localJobs: LocalJobPosting[],
  persistentJobs: PersistentJob[],
) {
  const byPersistentId = new Map(
    localJobs
      .filter((job) => !!job.persistentId)
      .map((job) => [job.persistentId as string, job]),
  );
  const bySourceUrl = new Map(
    localJobs
      .filter((job) => !!job.sourceUrl)
      .map((job) => [normalizeKey(job.sourceUrl as string), job]),
  );
  const byMeta = new Map(
    localJobs.map((job) => [
      `meta:${normalizeKey(job.company)}|${normalizeKey(job.title)}`,
      job,
    ]),
  );

  const consumedLocalIds = new Set<string>();
  const merged = new Map<string, LocalJobPosting>();

  for (const persistent of persistentJobs) {
    const existingByPersistentId = byPersistentId.get(persistent.id);
    const existingBySourceUrl = persistent.sourceUrl
      ? bySourceUrl.get(normalizeKey(persistent.sourceUrl))
      : undefined;
    const existingByMeta = byMeta.get(
      `meta:${normalizeKey(persistent.company)}|${normalizeKey(persistent.title)}`,
    );

    const existing =
      existingByPersistentId || existingBySourceUrl || existingByMeta;
    if (existing) consumedLocalIds.add(existing.id);

    const mapped = toLocalJobFromPersistent(persistent, existing);
    merged.set(mapped.id, mapped);
  }

  for (const local of localJobs) {
    if (consumedLocalIds.has(local.id)) continue;
    merged.set(local.id, local);
  }

  return Array.from(merged.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export async function listPersistentJobsClient() {
  const response = await fetch("/api/jobs", {
    method: "GET",
    cache: "no-store",
    headers: buildPersistenceHeaders(),
  });
  await ensureOkResponse(response);
  const payload = (await response.json()) as {
    ok: boolean;
    jobs: PersistentJob[];
  };

  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

export async function getPersistentJobClient(jobId: string) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    cache: "no-store",
    headers: buildPersistenceHeaders(),
  });

  if (response.status === 404) return null;

  await ensureOkResponse(response);
  const payload = (await response.json()) as {
    ok: boolean;
    job: PersistentJob;
  };

  return payload.job;
}

function toPersistentCreateInput(
  job: LocalJobPosting,
  options?: {
    clientRequestId?: string;
  },
): CreatePersistentJobInput {
  return {
    company: job.company,
    title: job.title,
    location: job.location,
    sourceUrl: job.sourceUrl,
    status: job.status,
    nextAction: job.nextAction,
    followUpDate: job.followUpDate,
    tags: job.tags,
    clientRequestId: options?.clientRequestId ?? `local-job:${job.id}`,
  };
}

export async function createPersistentJobClient(input: CreatePersistentJobInput) {
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: buildPersistenceHeaders(),
    body: JSON.stringify(input),
  });
  await ensureOkResponse(response);
  const payload = (await response.json()) as { ok: boolean; job: PersistentJob };
  return payload.job;
}

export async function patchPersistentJobClient(
  jobId: string,
  patch: PersistentJobPatch,
) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    headers: buildPersistenceHeaders(),
    body: JSON.stringify(patch),
  });
  await ensureOkResponse(response);
  const payload = (await response.json()) as { ok: boolean; job: PersistentJob };
  return payload.job;
}

function buildUpdatePatch(
  job: LocalJobPosting,
  base: PersistentJob | null,
): Extract<PersistentJobPatch, { op: "update" }> | null {
  const patch: Extract<PersistentJobPatch, { op: "update" }> = {
    op: "update",
    expectedVersion: base?.version ?? job.persistentVersion,
    changes: {},
  };

  const setIfDifferent = <K extends keyof Extract<PersistentJobPatch, { op: "update" }>["changes"]>(
    key: K,
    nextValue: Extract<PersistentJobPatch, { op: "update" }>["changes"][K],
    baseValue: Extract<PersistentJobPatch, { op: "update" }>["changes"][K],
  ) => {
    if (nextValue !== baseValue) {
      patch.changes[key] = nextValue;
    }
  };

  setIfDifferent("company", job.company, base?.company);
  setIfDifferent("title", job.title, base?.title);
  setIfDifferent("location", job.location, base?.location);
  setIfDifferent("sourceUrl", job.sourceUrl, base?.sourceUrl);
  setIfDifferent("nextAction", job.nextAction, base?.nextAction);
  setIfDifferent("followUpDate", job.followUpDate, base?.followUpDate);

  const baseTags = base?.tags || [];
  if (!sameTags(baseTags, job.tags)) {
    patch.changes.tags = job.tags;
  }

  return Object.keys(patch.changes).length > 0 ? patch : null;
}

export async function mirrorLocalJobToPersistence(
  job: LocalJobPosting,
  options?: {
    clientRequestId?: string;
  },
) {
  if (job.persistentId) {
    const patch = buildUpdatePatch(job, null);
    if (!patch) {
      throw new Error("Cannot mirror job: missing patch data.");
    }

    const updated = await patchPersistentJobClient(job.persistentId, patch);
    if (updated.status === job.status) return updated;

    return patchPersistentJobClient(updated.id, {
      op: "status",
      expectedVersion: updated.version,
      status: job.status,
    });
  }

  const created = await createPersistentJobClient(
    toPersistentCreateInput(job, options),
  );
  const patch = buildUpdatePatch(job, created);

  let latest = created;
  if (patch) {
    patch.expectedVersion = created.version;
    latest = await patchPersistentJobClient(created.id, patch);
  }

  if (latest.status !== job.status) {
    latest = await patchPersistentJobClient(latest.id, {
      op: "status",
      expectedVersion: latest.version,
      status: job.status,
    });
  }

  return latest;
}

export async function claimLocalJobsForActiveSession() {
  if (!getActiveAuthSessionUserId()) {
    return {
      claimed: 0,
      failed: 0,
    };
  }

  const localJobs = getJobsFromStorage();
  if (localJobs.length === 0) {
    return {
      claimed: 0,
      failed: 0,
    };
  }

  const nextJobs = new Map(localJobs.map((job) => [job.id, job]));
  let persistentJobs: PersistentJob[] = [];
  let claimed = 0;
  let failed = 0;

  try {
    persistentJobs = await listPersistentJobsClient();
  } catch {
    persistentJobs = [];
  }

  for (const job of localJobs) {
    try {
      const existingPersistent = findMatchingPersistentJob(job, persistentJobs);
      if (existingPersistent) {
        nextJobs.set(job.id, toLocalJobFromPersistent(existingPersistent, job));
        claimed += 1;
        continue;
      }

      const portableJob = {
        ...job,
        persistentId: undefined,
        persistentVersion: undefined,
      };
      const persistent = await mirrorLocalJobToPersistence(portableJob, {
        clientRequestId: `account-claim:${job.id}`,
      });
      persistentJobs = [persistent, ...persistentJobs];
      nextJobs.set(job.id, toLocalJobFromPersistent(persistent, job));
      claimed += 1;
    } catch {
      failed += 1;
    }
  }

  saveJobsToStorage(Array.from(nextJobs.values()), "sync");

  return {
    claimed,
    failed,
  };
}
