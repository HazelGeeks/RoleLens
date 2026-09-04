import {
  assertJobsStorageScope,
  getJobsStorageKey,
  GUEST_JOBS_STORAGE_KEY,
} from "@/lib/job-cache-scope";
import {
  getJobsFromStorage,
  LEGACY_JOBS_STORAGE_KEY,
  saveJobsToStorage,
  type LocalJobPosting,
} from "@/lib/local-jobs";
import type {
  CreatePersistentJobInput,
  PersistentJob,
  PersistentJobPatch,
  PersistentJobMeta,
} from "@/lib/persistence/types";
import { getActiveAuthSessionUserId } from "@/lib/auth-client";

const USER_ID_KEY = "rolelens.persistence.userId";
const DEVICE_ID_KEY = "rolelens.persistence.deviceId";
const TOKEN_KEY = "rolelens.persistence.token";
export const LOCAL_JOBS_CLAIMED_EVENT = "rolelens:local-jobs-claimed";

export type LocalJobsClaimedDetail = {
  claimed: number;
  failed: number;
};

async function fetchPersistence(input: string, init: RequestInit) {
  const scope = getJobsStorageKey();
  const response = await fetch(input, init);
  assertJobsStorageScope(scope);
  return response;
}

export function toPersistentJobMeta(job: LocalJobPosting): PersistentJobMeta {
  return {
    source: job.source,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    seniority: job.seniority,
    workAuthorizationNote: job.workAuthorizationNote,
    descriptionRaw: job.descriptionRaw,
    extractedSkills: job.extractedSkills,
    fitScore: job.fitScore,
    fitBreakdown: job.fitBreakdown,
    statusHistory: job.statusHistory,
    publishedAt: job.publishedAt,
    lastStatusChangedAt: job.lastStatusChangedAt,
  };
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function createFallbackHistory(
  status: LocalJobPosting["status"],
  changedAt: string,
) {
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
  if (response.status === 409)
    throw new Error(
      "This posting changed on another device. Review the latest version and retry your change.",
    );

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

  for (const note of existing?.notes ?? []) {
    if (
      !notes.some(
        (saved) =>
          saved.id === note.id ||
          saved.id === `${job.id}:${note.id}` ||
          (saved.content === note.content &&
            saved.createdAt === note.createdAt),
      )
    )
      notes.push(note);
  }
  const meta =
    job.meta ?? (existing ? toPersistentJobMeta(existing) : undefined);
  const merged: LocalJobPosting = {
    id: fallbackId,
    persistentId: job.id,
    source: meta?.source ?? "MANUAL",
    sourceUrl: job.sourceUrl,
    company: job.company,
    title: job.title,
    location: job.location,
    remoteType: meta?.remoteType ?? "UNKNOWN",
    employmentType: meta?.employmentType,
    salaryMin: meta?.salaryMin,
    salaryMax: meta?.salaryMax,
    salaryCurrency: meta?.salaryCurrency,
    seniority: meta?.seniority,
    workAuthorizationNote: meta?.workAuthorizationNote,
    descriptionRaw: meta?.descriptionRaw || "",
    extractedSkills: meta?.extractedSkills || [],
    fitScore: meta?.fitScore ?? 0,
    fitBreakdown: meta?.fitBreakdown,
    status: job.status,
    nextAction: job.nextAction,
    followUpDate: job.followUpDate,
    publishedAt: meta?.publishedAt,
    lastStatusChangedAt: meta?.lastStatusChangedAt || job.updatedAt,
    statusHistory:
      meta?.statusHistory && meta.statusHistory.length > 0
        ? meta.statusHistory
        : createFallbackHistory(job.status, job.createdAt),
    tags: job.tags,
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

    const mapped =
      existing?.persistentId === persistent.id &&
      (existing.persistentVersion ?? 0) > persistent.version
        ? existing
        : toLocalJobFromPersistent(persistent, existing);
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
  const scope = getJobsStorageKey();
  const response = await fetchPersistence("/api/jobs", {
    method: "GET",
    cache: "no-store",
    headers: buildPersistenceHeaders(),
  });
  await ensureOkResponse(response);
  const payload = (await response.json()) as {
    ok: boolean;
    jobs: PersistentJob[];
  };
  assertJobsStorageScope(scope);

  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

export async function getPersistentJobClient(jobId: string) {
  const scope = getJobsStorageKey();
  const response = await fetchPersistence(
    `/api/jobs/${encodeURIComponent(jobId)}/`,
    {
      method: "GET",
      cache: "no-store",
      headers: buildPersistenceHeaders(),
    },
  );

  if (response.status === 404) return null;

  await ensureOkResponse(response);
  const payload = (await response.json()) as {
    ok: boolean;
    job: PersistentJob;
  };
  assertJobsStorageScope(scope);

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
    meta: toPersistentJobMeta(job),
    initialNotes: job.notes,
    clientRequestId: options?.clientRequestId ?? `local-job:${job.id}`,
  };
}

export async function createPersistentJobClient(
  input: CreatePersistentJobInput,
) {
  const scope = getJobsStorageKey();
  const response = await fetchPersistence("/api/jobs", {
    method: "POST",
    headers: buildPersistenceHeaders(),
    body: JSON.stringify(input),
  });
  await ensureOkResponse(response);
  const payload = (await response.json()) as {
    ok: boolean;
    job: PersistentJob;
  };
  assertJobsStorageScope(scope);
  return payload.job;
}

export async function patchPersistentJobClient(
  jobId: string,
  patch: PersistentJobPatch,
) {
  const scope = getJobsStorageKey();
  const response = await fetchPersistence(
    `/api/jobs/${encodeURIComponent(jobId)}/`,
    {
      method: "PATCH",
      headers: buildPersistenceHeaders(),
      body: JSON.stringify(patch),
    },
  );
  await ensureOkResponse(response);
  const payload = (await response.json()) as {
    ok: boolean;
    job: PersistentJob;
  };
  assertJobsStorageScope(scope);
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

  const setIfDifferent = <
    K extends keyof Extract<PersistentJobPatch, { op: "update" }>["changes"],
  >(
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
  setIfDifferent("location", job.location ?? null, base?.location ?? null);
  setIfDifferent("sourceUrl", job.sourceUrl ?? null, base?.sourceUrl ?? null);
  setIfDifferent(
    "nextAction",
    job.nextAction ?? null,
    base?.nextAction ?? null,
  );
  setIfDifferent(
    "followUpDate",
    job.followUpDate ?? null,
    base?.followUpDate ?? null,
  );

  const meta = toPersistentJobMeta(job);
  if (JSON.stringify(meta) !== JSON.stringify(base?.meta))
    patch.changes.meta = meta;

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
  const userId = getActiveAuthSessionUserId();
  if (!userId) return { claimed: 0, failed: 0 };
  const scope = getJobsStorageKey();
  // A failed list is not evidence that the account is empty.
  const persistentJobs = await listPersistentJobsClient();
  assertJobsStorageScope(scope);
  const ownedIds = new Set(persistentJobs.map((job) => job.id));
  const legacy = getJobsFromStorage(LEGACY_JOBS_STORAGE_KEY).filter(
    (job) => job.persistentId && ownedIds.has(job.persistentId),
  );
  const guestJobs = getJobsFromStorage(GUEST_JOBS_STORAGE_KEY);
  const localJobs = Array.from(
    new Map(
      [
        ...legacy,
        ...guestJobs.map((job) => ({
          ...job,
          persistentId: undefined,
          persistentVersion: undefined,
        })),
        ...getJobsFromStorage(),
      ].map((job) => [job.id, job]),
    ).values(),
  );
  const nextJobs = new Map(localJobs.map((job) => [job.id, job]));
  const claimedGuestIds = new Set<string>();
  let claimed = 0;
  let failed = 0;
  for (const job of localJobs) {
    assertJobsStorageScope(scope);
    try {
      let persistent = findMatchingPersistentJob(job, persistentJobs);
      if (persistent) {
        // Backfill legacy detail without replacing newer server-side tracking fields.
        if (!persistent.meta)
          persistent = await patchPersistentJobClient(persistent.id, {
            op: "update",
            expectedVersion: persistent.version,
            changes: { meta: toPersistentJobMeta(job) },
          });
        const missingNotes = job.notes.filter(
          (note) =>
            !persistent!.notes.some(
              (saved) =>
                saved.id === note.id ||
                saved.id === `${persistent!.id}:${note.id}` ||
                (saved.content === note.content &&
                  saved.createdAt === note.createdAt),
            ),
        );
        if (missingNotes.length)
          persistent = await patchPersistentJobClient(persistent.id, {
            op: "import-notes",
            expectedVersion: persistent.version,
            notes: missingNotes,
          });
      } else {
        persistent = await mirrorLocalJobToPersistence(
          { ...job, persistentId: undefined, persistentVersion: undefined },
          {
            clientRequestId: `account-claim:${job.id}`,
          },
        );
        persistentJobs.push(persistent);
      }
      assertJobsStorageScope(scope);
      const persistentIndex = persistentJobs.findIndex(
        (entry) => entry.id === persistent.id,
      );
      if (persistentIndex >= 0) persistentJobs[persistentIndex] = persistent;
      nextJobs.set(job.id, toLocalJobFromPersistent(persistent, job));
      claimedGuestIds.add(job.id);
      claimed += 1;
    } catch {
      assertJobsStorageScope(scope);
      failed += 1;
    }
  }
  assertJobsStorageScope(scope);
  // Retain any local records created while the claim was in flight.
  const latest = new Map(getJobsFromStorage().map((job) => [job.id, job]));
  for (const [id, job] of nextJobs) {
    const original = localJobs.find((entry) => entry.id === id);
    if (!latest.has(id) || latest.get(id)?.updatedAt === original?.updatedAt)
      latest.set(id, job);
  }
  saveJobsToStorage(
    mergeLocalWithPersistent(Array.from(latest.values()), persistentJobs),
  );
  const remainingGuests = getJobsFromStorage(GUEST_JOBS_STORAGE_KEY).filter(
    (job) => !claimedGuestIds.has(job.id),
  );
  saveJobsToStorage(remainingGuests, "sync", GUEST_JOBS_STORAGE_KEY);
  if (typeof window !== "undefined" && (claimed || failed))
    window.dispatchEvent(
      new CustomEvent<LocalJobsClaimedDetail>(LOCAL_JOBS_CLAIMED_EVENT, {
        detail: { claimed, failed },
      }),
    );
  return { claimed, failed };
}
