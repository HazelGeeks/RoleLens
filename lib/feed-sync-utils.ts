import { calculateFitScore, extractSkills } from "@/lib/fit-score";
import type { FeedImportDiagnostics, ImportedFeedJob } from "@/lib/feed-types";
import type { LocalJobPosting } from "@/lib/local-jobs";

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

export const DEFAULT_RECOVERY_GUIDE = [
  "Production: run the Python Scrape Now workflow so it posts crawler output to /api/jobs/ingest and stores the latest snapshot in D1.",
  "Confirm ROLELENS_CRON_SECRET matches the deployed CRON_SECRET for D1 ingestion.",
  "Restart next dev (local) after env changes or redeploy the target environment (Cloudflare).",
  "Call /api/jobs/import, then retry Sync All Feeds in the Jobs page.",
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

function hashToId(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  return `auto-${Math.abs(hash).toString(16)}`;
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

function shouldResetLegacyImportedSaveStatus(existing: LocalJobPosting | undefined) {
  if (!existing) return false;
  if (existing.status !== "SAVE") return false;
  if (existing.statusHistory.length !== 1) return false;

  const [initialHistory] = existing.statusHistory;
  if (!initialHistory) return false;
  if (initialHistory.status !== "SAVE") return false;

  return (initialHistory.note || "")
    .toLowerCase()
    .includes("imported from external feed");
}

function buildImportedDefaultStatusState(
  existing: LocalJobPosting | undefined,
  now: string,
) {
  if (!shouldResetLegacyImportedSaveStatus(existing)) {
    return {
      status: existing?.status || "NONE",
      lastStatusChangedAt: existing?.lastStatusChangedAt || now,
      statusHistory: existing?.statusHistory || [
        {
          id: crypto.randomUUID(),
          status: "NONE",
          changedAt: now,
          note: "Imported from external feed",
        },
      ],
    };
  }

  return {
    status: "NONE" as const,
    lastStatusChangedAt: now,
    statusHistory: [
      {
        id: crypto.randomUUID(),
        status: "NONE" as const,
        changedAt: now,
        note: "Imported from external feed",
      },
    ],
  };
}

export function normalizeDiagnostics(
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

export function toImportIdentity(input: {
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

export function isAutoImportedJob(job: LocalJobPosting) {
  return job.tags.some((tag) => {
    const normalized = normalizeKey(tag);
    return AUTO_IMPORT_TAG_PREFIXES.some((prefix) =>
      normalized.startsWith(prefix),
    );
  });
}

export function resolveStableId(job: ImportedFeedJob) {
  const seed =
    job.sourceUrl ||
    `${job.source}:${job.company}:${job.title}:${job.externalId}`;
  return hashToId(seed);
}

export function mergeImportedJob(
  imported: ImportedFeedJob,
  existingJobs: LocalJobPosting[],
): {
  merged: LocalJobPosting;
  existing: LocalJobPosting | undefined;
} {
  const stableId = resolveStableId(imported);
  const existing = findExistingJob(existingJobs, imported, stableId);
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
  const tags = Array.from(new Set([...(existing?.tags || []), ...imported.tags]));
  const importedDefaultStatusState = buildImportedDefaultStatusState(existing, now);

  return {
    existing,
    merged: {
      id: existing?.id || stableId,
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
      status: importedDefaultStatusState.status,
      nextAction: existing?.nextAction,
      followUpDate: existing?.followUpDate,
      publishedAt: imported.publishedAt || existing?.publishedAt,
      lastStatusChangedAt: importedDefaultStatusState.lastStatusChangedAt,
      statusHistory: importedDefaultStatusState.statusHistory,
      tags: normalizeTagsForPersistence(tags),
      notes: existing?.notes || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    },
  };
}

export function resolveImportedSourceCount(snapshot: {
  jobs: ImportedFeedJob[];
  sourceCount: number;
  importedSourceCount?: number;
}) {
  if (
    typeof snapshot.importedSourceCount === "number" &&
    Number.isFinite(snapshot.importedSourceCount) &&
    snapshot.importedSourceCount >= 0
  ) {
    return snapshot.importedSourceCount;
  }

  const uniqueSourceLabels = new Set(
    snapshot.jobs.map((job) => (job.sourceLabel || job.source).trim()),
  );
  if (uniqueSourceLabels.size > 0) {
    return uniqueSourceLabels.size;
  }

  return snapshot.sourceCount;
}
