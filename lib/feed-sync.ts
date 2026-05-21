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

const LAST_SYNC_KEY = "rolelens.feed.lastSyncAt";
const LAST_SYNC_DATE_KEY = "rolelens.feed.lastSyncDate";
const LAST_SYNC_RESULT_KEY = "rolelens.feed.lastSyncResult";

const EMPTY_DIAGNOSTICS: FeedImportDiagnostics = {
  ats: {
    greenhouseBoardCount: 0,
    leverCompanyCount: 0,
    ashbyOrganizationCount: 0,
    smartRecruitersCompanyCount: 0,
    configuredSourceCount: 0,
  },
  rss: {
    linkedinConfigured: false,
    indeedConfigured: false,
    thirdConfigured: false,
    configuredSourceCount: 0,
  },
  python: {
    scrapedFeedConfigured: false,
    configuredSourceCount: 0,
  },
  sourceCount: 0,
};

const DEFAULT_RECOVERY_GUIDE = [
  "Local dev: /api/jobs/import automatically falls back to /api/jobs/local-python-scraped-feed when PYTHON_SCRAPED_FEED_URL is empty.",
  "To use a hosted crawler output locally, set PYTHON_SCRAPED_FEED_URL in .env.local.",
  "Cloudflare Pages: set PYTHON_SCRAPED_FEED_URL for both Production and Preview.",
  "Use PYTHON_SCRAPED_FEED_URL as the ingestion source in deployed environments.",
  "Restart next dev (local) after env changes or redeploy the target environment (Cloudflare).",
  "Call /api/jobs/import?refresh=1, then retry Sync All Feeds (or a platform sync button) in the Jobs page.",
];

const AUTO_IMPORT_TAG_PREFIXES = [
  "python-scraper",
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "linkedin",
  "indeed",
];
const PERSISTENCE_TAG_MAX_LENGTH = 32;
const PERSISTENCE_TAG_MAX_COUNT = 20;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeDiagnostics(
  value: unknown,
  fallbackSourceCount: number,
): FeedImportDiagnostics {
  const root = asRecord(value);
  const ats = asRecord(root?.ats);
  const rss = asRecord(root?.rss);
  const python = asRecord(root?.python);

  return {
    ats: {
      greenhouseBoardCount:
        asNumber(ats?.greenhouseBoardCount) ??
        EMPTY_DIAGNOSTICS.ats.greenhouseBoardCount,
      leverCompanyCount:
        asNumber(ats?.leverCompanyCount) ??
        EMPTY_DIAGNOSTICS.ats.leverCompanyCount,
      ashbyOrganizationCount:
        asNumber(ats?.ashbyOrganizationCount) ??
        EMPTY_DIAGNOSTICS.ats.ashbyOrganizationCount,
      smartRecruitersCompanyCount:
        asNumber(ats?.smartRecruitersCompanyCount) ??
        EMPTY_DIAGNOSTICS.ats.smartRecruitersCompanyCount,
      configuredSourceCount:
        asNumber(ats?.configuredSourceCount) ??
        EMPTY_DIAGNOSTICS.ats.configuredSourceCount,
    },
    rss: {
      linkedinConfigured:
        asBoolean(rss?.linkedinConfigured) ??
        EMPTY_DIAGNOSTICS.rss.linkedinConfigured,
      indeedConfigured:
        asBoolean(rss?.indeedConfigured) ??
        EMPTY_DIAGNOSTICS.rss.indeedConfigured,
      thirdConfigured:
        asBoolean(rss?.thirdConfigured) ??
        EMPTY_DIAGNOSTICS.rss.thirdConfigured,
      configuredSourceCount:
        asNumber(rss?.configuredSourceCount) ??
        EMPTY_DIAGNOSTICS.rss.configuredSourceCount,
    },
    python: {
      scrapedFeedConfigured:
        asBoolean(python?.scrapedFeedConfigured) ??
        EMPTY_DIAGNOSTICS.python.scrapedFeedConfigured,
      configuredSourceCount:
        asNumber(python?.configuredSourceCount) ??
        EMPTY_DIAGNOSTICS.python.configuredSourceCount,
    },
    sourceCount: asNumber(root?.sourceCount) ?? fallbackSourceCount,
  };
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTagForPersistence(value: string) {
  let normalized = value.trim();
  if (!normalized) return undefined;

  if (normalized.length > PERSISTENCE_TAG_MAX_LENGTH) {
    normalized = normalized
      .replace(/(?:[-_\s])search$/i, "")
      .replace(/[-_\s]+$/g, "")
      .trim();
  }

  if (normalized.length > PERSISTENCE_TAG_MAX_LENGTH) {
    normalized = normalized.slice(0, PERSISTENCE_TAG_MAX_LENGTH).trimEnd();
  }

  return normalized || undefined;
}

function normalizeTagsForPersistence(tags: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of tags) {
    const normalized = normalizeTagForPersistence(rawTag);
    if (!normalized) continue;
    const key = normalizeKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= PERSISTENCE_TAG_MAX_COUNT) break;
  }

  return result;
}

function toImportIdentity(input: {
  source: string;
  company: string;
  title: string;
  sourceUrl?: string;
}) {
  if (input.sourceUrl) {
    return `url:${normalizeKey(input.sourceUrl)}`;
  }

  return `meta:${normalizeKey(input.source)}|${normalizeKey(input.company)}|${normalizeKey(input.title)}`;
}

function isAutoImportedJob(job: LocalJobPosting) {
  return job.tags.some((tag) => {
    const normalized = normalizeKey(tag);
    return AUTO_IMPORT_TAG_PREFIXES.some((prefix) =>
      normalized.startsWith(prefix),
    );
  });
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
    status: existing?.status || "NONE",
    nextAction: existing?.nextAction,
    followUpDate: existing?.followUpDate,
    lastStatusChangedAt: existing?.lastStatusChangedAt || now,
    statusHistory: existing?.statusHistory || [
      {
        id: crypto.randomUUID(),
        status: "NONE",
        changedAt: now,
        note: "Imported from external feed",
      },
    ],
    tags: normalizeTagsForPersistence(tags),
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
  platform?: FeedPlatform;
  persistToDb?: boolean;
}): Promise<SyncJobsFromFeedsResult> {
  const params = new URLSearchParams();
  if (options?.refresh) params.set("refresh", "1");

  const platform = parseFeedPlatform(options?.platform);
  if (platform !== "all") {
    params.set("platform", platform);
  }

  const query = params.toString();
  const response = await fetch(`/api/jobs/import${query ? `?${query}` : ""}`, {
    method: "GET",
    cache: "no-store",
    headers: buildPersistenceHeaders(),
  });

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
    const stableId = resolveStableId(imported);
    const existing = findExistingJob(retainedJobs, imported, stableId);
    const merged = mergeImportedJob(imported, existing);
    nextMap.set(merged.id, merged);
    importedJobIds.add(merged.id);

    if (existing) updated += 1;
    else added += 1;
  }

  let mergedJobs = Array.from(nextMap.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  if (options?.persistToDb !== false) {
    for (const job of mergedJobs.filter((entry) => importedJobIds.has(entry.id))) {
      try {
        const persistent = await mirrorLocalJobToPersistence(job);
        nextMap.set(job.id, toLocalJobFromPersistent(persistent, job));
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown error";
        throw new Error(
          `Feed sync persisted locally but failed to write DB (${job.company} - ${job.title}): ${detail}`,
        );
      }
    }

    mergedJobs = Array.from(nextMap.values()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

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
