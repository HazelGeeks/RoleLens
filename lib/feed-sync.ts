import { calculateFitScore, extractSkills } from "@/lib/fit-score";
import type {
  FeedImportDiagnostics,
  FeedImportSnapshot,
  FeedSourceResult,
  ImportedFeedJob,
} from "@/lib/feed-types";
import {
  getJobsFromStorage,
  saveJobsToStorage,
  type LocalJobPosting,
} from "@/lib/local-jobs";

const LAST_SYNC_KEY = "rolelens.feed.lastSyncAt";
const LAST_SYNC_DATE_KEY = "rolelens.feed.lastSyncDate";
const LAST_SYNC_RESULT_KEY = "rolelens.feed.lastSyncResult";

const EMPTY_DIAGNOSTICS: FeedImportDiagnostics = {
  ats: {
    greenhouseBoardCount: 0,
    leverCompanyCount: 0,
    configuredSourceCount: 0,
  },
  rss: {
    linkedinConfigured: false,
    indeedConfigured: false,
    thirdConfigured: false,
    configuredSourceCount: 0,
  },
  sourceCount: 0,
};

const DEFAULT_RECOVERY_GUIDE = [
  "Set at least one source in Cloudflare Pages Variables and Secrets for both Production and Preview.",
  "Use ATS variables (GREENHOUSE_BOARD_TOKENS or LEVER_COMPANIES) or RSS fallback URLs.",
  "Save variables and redeploy the target environment.",
  "Call /api/jobs/import?refresh=1, then retry Sync Sources in the Jobs page.",
];

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function hashToId(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  return `auto-${Math.abs(hash).toString(16)}`;
}

function resolveStableId(job: ImportedFeedJob) {
  const seed =
    job.sourceUrl ||
    `${job.source}:${job.company}:${job.title}:${job.externalId}`;
  return hashToId(seed);
}

function findExistingJob(
  existingJobs: LocalJobPosting[],
  imported: ImportedFeedJob,
  stableId: string,
) {
  if (imported.sourceUrl) {
    const byUrl = existingJobs.find(
      (job) =>
        normalizeKey(job.sourceUrl || "") ===
        normalizeKey(imported.sourceUrl || ""),
    );
    if (byUrl) return byUrl;
  }

  const byId = existingJobs.find((job) => job.id === stableId);
  if (byId) return byId;

  return existingJobs.find(
    (job) =>
      job.source === imported.source &&
      normalizeKey(job.company) === normalizeKey(imported.company) &&
      normalizeKey(job.title) === normalizeKey(imported.title),
  );
}

function mergeImportedJob(
  imported: ImportedFeedJob,
  existing: LocalJobPosting | undefined,
): LocalJobPosting {
  const now = new Date().toISOString();
  const fitBreakdown = calculateFitScore({
    title: imported.title,
    descriptionRaw: imported.descriptionRaw,
    seniority: imported.seniority,
    workAuthorizationNote: imported.workAuthorizationNote,
  });

  const skills = Array.from(
    new Set([
      ...(existing?.extractedSkills || []),
      ...extractSkills(imported.descriptionRaw),
      ...imported.extractedSkills,
    ]),
  );
  const tags = Array.from(
    new Set([...(existing?.tags || []), ...imported.tags]),
  );

  return {
    id: existing?.id || resolveStableId(imported),
    source: imported.source,
    sourceUrl: imported.sourceUrl || existing?.sourceUrl,
    company: imported.company || existing?.company || "Unknown Company",
    title: imported.title || existing?.title || "Unknown Role",
    location: imported.location || existing?.location,
    remoteType: imported.remoteType || existing?.remoteType || "UNKNOWN",
    employmentType: imported.employmentType || existing?.employmentType,
    salaryMin: imported.salaryMin ?? existing?.salaryMin,
    salaryMax: imported.salaryMax ?? existing?.salaryMax,
    salaryCurrency:
      imported.salaryCurrency || existing?.salaryCurrency || "CAD",
    seniority: imported.seniority || existing?.seniority,
    workAuthorizationNote:
      imported.workAuthorizationNote || existing?.workAuthorizationNote,
    descriptionRaw: imported.descriptionRaw || existing?.descriptionRaw || "",
    extractedSkills: skills,
    fitScore: fitBreakdown.overall,
    fitBreakdown,
    status: existing?.status || "SAVED",
    nextAction: existing?.nextAction,
    followUpDate: existing?.followUpDate,
    lastStatusChangedAt: existing?.lastStatusChangedAt || now,
    statusHistory: existing?.statusHistory || [
      {
        id: crypto.randomUUID(),
        status: "SAVED",
        changedAt: now,
        note: "Imported from external feed",
      },
    ],
    tags,
    notes: existing?.notes || [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export type SyncJobsFromFeedsResult = {
  added: number;
  updated: number;
  totalImported: number;
  sourceCount: number;
  cached: boolean;
  errors: FeedImportSnapshot["errors"];
  sourceResults: FeedSourceResult[];
  diagnostics: FeedImportDiagnostics;
  recoveryGuide: string[];
  syncedAt: string;
};

export type FeedSyncSummary = {
  syncedAt: string;
  sourceCount: number;
  totalImported: number;
  added: number;
  updated: number;
  errors: FeedImportSnapshot["errors"];
  sourceResults: FeedSourceResult[];
  diagnostics: FeedImportDiagnostics;
  recoveryGuide: string[];
};

export async function syncJobsFromFeeds(options?: {
  refresh?: boolean;
}): Promise<SyncJobsFromFeedsResult> {
  const params = new URLSearchParams();
  if (options?.refresh) params.set("refresh", "1");

  const query = params.toString();
  const response = await fetch(`/api/jobs/import${query ? `?${query}` : ""}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Feed sync failed with status ${response.status}`);
  }

  const payload = (await response.json()) as FeedImportSnapshot & {
    cached?: boolean;
  };
  const sourceResults = Array.isArray(payload.sourceResults)
    ? payload.sourceResults
    : [];
  const diagnostics = payload.diagnostics ?? {
    ...EMPTY_DIAGNOSTICS,
    sourceCount: payload.sourceCount,
  };
  const recoveryGuide =
    Array.isArray(payload.recoveryGuide) && payload.recoveryGuide.length > 0
      ? payload.recoveryGuide
      : DEFAULT_RECOVERY_GUIDE;
  const existingJobs = getJobsFromStorage();
  const nextMap = new Map(existingJobs.map((job) => [job.id, job]));

  let added = 0;
  let updated = 0;

  for (const imported of payload.jobs) {
    const stableId = resolveStableId(imported);
    const existing = findExistingJob(existingJobs, imported, stableId);
    const merged = mergeImportedJob(imported, existing);
    nextMap.set(merged.id, merged);

    if (existing) updated += 1;
    else added += 1;
  }

  const mergedJobs = Array.from(nextMap.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  saveJobsToStorage(mergedJobs);

  const today = new Date().toISOString().slice(0, 10);
  const syncedAt = new Date().toISOString();

  const summary: FeedSyncSummary = {
    syncedAt,
    sourceCount: payload.sourceCount,
    totalImported: payload.jobs.length,
    added,
    updated,
    errors: payload.errors,
    sourceResults,
    diagnostics,
    recoveryGuide,
  };

  window.localStorage.setItem(LAST_SYNC_KEY, syncedAt);
  window.localStorage.setItem(LAST_SYNC_DATE_KEY, today);
  window.localStorage.setItem(LAST_SYNC_RESULT_KEY, JSON.stringify(summary));

  return {
    added,
    updated,
    totalImported: payload.jobs.length,
    sourceCount: payload.sourceCount,
    cached: payload.cached === true,
    errors: payload.errors,
    sourceResults,
    diagnostics,
    recoveryGuide,
    syncedAt,
  };
}

export function getLastFeedSyncAt() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_SYNC_KEY);
}

export function getLastFeedSyncSummary(): FeedSyncSummary | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(LAST_SYNC_RESULT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<FeedSyncSummary>;
    if (
      !parsed ||
      typeof parsed.syncedAt !== "string" ||
      typeof parsed.sourceCount !== "number" ||
      typeof parsed.totalImported !== "number" ||
      !Array.isArray(parsed.errors) ||
      !Array.isArray(parsed.sourceResults) ||
      typeof parsed.diagnostics !== "object" ||
      parsed.diagnostics == null ||
      !Array.isArray(parsed.recoveryGuide)
    ) {
      return null;
    }

    return {
      syncedAt: parsed.syncedAt,
      sourceCount: parsed.sourceCount,
      totalImported: parsed.totalImported,
      added: typeof parsed.added === "number" ? parsed.added : 0,
      updated: typeof parsed.updated === "number" ? parsed.updated : 0,
      errors: parsed.errors,
      sourceResults: parsed.sourceResults,
      diagnostics: parsed.diagnostics as FeedImportDiagnostics,
      recoveryGuide: parsed.recoveryGuide,
    };
  } catch {
    return null;
  }
}

export function shouldAutoSyncToday() {
  if (typeof window === "undefined") return false;
  const today = new Date().toISOString().slice(0, 10);
  return window.localStorage.getItem(LAST_SYNC_DATE_KEY) !== today;
}
