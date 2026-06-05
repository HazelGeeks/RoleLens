import type {
  FeedImportDiagnostics,
  FeedImportSnapshot,
  FeedSourceResult,
} from "@/lib/feed-types";
import { getJobsFromStorage, saveJobsToStorage } from "@/lib/local-jobs";
import {
  buildPersistenceHeaders,
  mirrorLocalJobToPersistence,
  toLocalJobFromPersistent,
} from "@/lib/persistence-client";
import {
  type FeedPlatform,
  matchesFeedPlatform,
  parseFeedPlatform,
} from "@/lib/feed-platform";
import {
  DEFAULT_RECOVERY_GUIDE,
  isAutoImportedJob,
  mergeImportedJob,
  normalizeDiagnostics,
  resolveImportedSourceCount,
  toImportIdentity,
} from "@/lib/feed-sync-utils";

const LAST_SYNC_KEY = "rolelens.feed.lastSyncAt";
const LAST_SYNC_DATE_KEY = "rolelens.feed.lastSyncDate";
const LAST_SYNC_RESULT_KEY = "rolelens.feed.lastSyncResult";

export type SyncJobsFromFeedsResult = {
  added: number;
  updated: number;
  totalImported: number;
  sourceCount: number;
  importedSourceCount: number;
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
  importedSourceCount: number;
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
  platform?: FeedPlatform;
  persistToDb?: boolean;
}): Promise<SyncJobsFromFeedsResult> {
  const platform = parseFeedPlatform(options?.platform);
  const runActiveSync = options?.refresh === true || platform !== "all";
  const headers = buildPersistenceHeaders();
  let response = runActiveSync
    ? await fetch("/api/jobs/sync", {
        method: "POST",
        cache: "no-store",
        headers,
        body: JSON.stringify({
          platform,
        }),
      })
    : await fetch("/api/jobs/import", {
        method: "GET",
        cache: "no-store",
        headers,
      });

  if (!response.ok && runActiveSync && platform === "all" && response.status >= 500) {
    response = await fetch("/api/jobs/import", {
      method: "GET",
      cache: "no-store",
      headers,
    });
  }

  if (!response.ok) {
    let details = "";
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload?.message) {
        details = ": " + payload.message;
      }
    } catch {
      details = "";
    }

    throw new Error(`Feed sync failed with status ${response.status}${details}`);
  }

  const payload = (await response.json()) as FeedImportSnapshot & {
    cached?: boolean;
  };
  const importedSourceCount = resolveImportedSourceCount(payload);
  const sourceResults = Array.isArray(payload.sourceResults)
    ? payload.sourceResults
    : [];
  const diagnostics = normalizeDiagnostics(payload.diagnostics, payload.sourceCount);
  const recoveryGuide =
    Array.isArray(payload.recoveryGuide) && payload.recoveryGuide.length > 0
      ? payload.recoveryGuide
      : DEFAULT_RECOVERY_GUIDE;
  const incomingIdentities = new Set(
    payload.jobs.map((job) =>
      toImportIdentity({
        source: job.source,
        company: job.company,
        title: job.title,
        sourceUrl: job.sourceUrl,
      }),
    ),
  );
  const existingJobs = getJobsFromStorage();
  const shouldPruneStale = payload.errors.length === 0;
  const retainedJobs = existingJobs.filter((job) => {
    if (!isAutoImportedJob(job)) return true;
    if (!shouldPruneStale) return true;
    if (platform !== "all" && !matchesFeedPlatform(job, platform)) return true;

    return incomingIdentities.has(
      toImportIdentity({
        source: job.source,
        company: job.company,
        title: job.title,
        sourceUrl: job.sourceUrl,
      }),
    );
  });
  const nextMap = new Map(retainedJobs.map((job) => [job.id, job]));

  let added = 0;
  let updated = 0;
  const importedJobIds = new Set<string>();

  for (const imported of payload.jobs) {
    const { merged, existing } = mergeImportedJob(imported, retainedJobs);
    nextMap.set(merged.id, merged);
    importedJobIds.add(merged.id);

    if (existing) updated += 1;
    else added += 1;
  }

  let mergedJobs = Array.from(nextMap.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const persistenceErrors: FeedImportSnapshot["errors"] = [];

  if (options?.persistToDb !== false) {
    for (const job of mergedJobs.filter((entry) => importedJobIds.has(entry.id))) {
      try {
        const persistent = await mirrorLocalJobToPersistence(job);
        nextMap.set(job.id, toLocalJobFromPersistent(persistent, job));
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown error";
        persistenceErrors.push({
          source: "persistence",
          message: `Failed to write DB (${job.company} - ${job.title}): ${detail}`,
        });
      }
    }

    mergedJobs = Array.from(nextMap.values()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  saveJobsToStorage(mergedJobs);

  const today = new Date().toISOString().slice(0, 10);
  const syncedAt = new Date().toISOString();
  const errors = [...payload.errors, ...persistenceErrors];

  const summary: FeedSyncSummary = {
    syncedAt,
    sourceCount: payload.sourceCount,
    importedSourceCount,
    totalImported: payload.jobs.length,
    added,
    updated,
    errors,
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
    importedSourceCount,
    cached: payload.cached === true,
    errors,
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
      importedSourceCount:
        typeof parsed.importedSourceCount === "number" &&
        Number.isFinite(parsed.importedSourceCount)
          ? parsed.importedSourceCount
          : parsed.sourceCount,
      totalImported: parsed.totalImported,
      added: typeof parsed.added === "number" ? parsed.added : 0,
      updated: typeof parsed.updated === "number" ? parsed.updated : 0,
      errors: parsed.errors,
      sourceResults: parsed.sourceResults,
      diagnostics: normalizeDiagnostics(parsed.diagnostics, parsed.sourceCount),
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
