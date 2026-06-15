import type {
  FeedImportDiagnostics,
  FeedImportError,
  FeedImportSnapshot,
  FeedSourceResult,
  ImportedFeedJob,
} from "@/lib/feed-types";

const DEFAULT_ROLE_KEYWORDS = [
  "frontend",
  "front-end",
  "front end",
  "react",
  "typescript",
  "web ui",
  "ui engineer",
  "backend",
  "back-end",
  "software engineer",
  "blockchain",
  "web3",
];

const DEFAULT_LOCATION_KEYWORDS = [
  "canada",
  "toronto",
  "vancouver",
  "montreal",
  "ottawa",
  "korea",
  "seoul",
  "대한민국",
  "한국",
  "서울",
];

const DEFAULT_RECOVERY_GUIDE = [
  "Production: post a normalized feed snapshot to /api/jobs/ingest so D1 stores the latest snapshot.",
  "Confirm the ingest client uses CRON_SECRET or SYNC_ADMIN_SECRET for D1 ingestion.",
  "Restart next dev (local) after env changes or redeploy the target environment (Cloudflare).",
  "Call /api/jobs/import, then retry Sync All Feeds in the Jobs page.",
];

function splitCsv(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function asString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : undefined;
}

function parseKeywordList(value: string | undefined, fallback: string[]) {
  const custom = splitCsv(value).map((keyword) => keyword.toLowerCase());
  if (custom.length > 0) return custom;
  return fallback;
}

function matchesAnyKeyword(text: string, keywords: string[]) {
  if (keywords.length === 0) return true;
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function buildFeedImportDiagnostics(
  sourceCount: number,
  pythonScrapedConfigured: boolean,
): FeedImportDiagnostics {
  return {
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
      scrapedFeedConfigured: pythonScrapedConfigured,
      configuredSourceCount: pythonScrapedConfigured ? 1 : 0,
    },
    sourceCount,
  };
}

function normalizeImportedFeedJob(
  job: Partial<ImportedFeedJob>,
): ImportedFeedJob | null {
  if (!job || typeof job !== "object") return null;

  const title = asString(job.title);
  if (!title) return null;

  const sourceLabel = asString(job.sourceLabel) || "Python Scraper";
  const company =
    asString(job.company) ||
    asString(job.sourceLabel)?.replace(/^PythonScraper:/, "") ||
    "Unknown Company";
  const externalId =
    asString(job.externalId) ||
    asString(job.sourceUrl) ||
    `${company}:${title}`;

  return {
    externalId,
    source: job.source || "MANUAL",
    sourceLabel,
    sourceUrl: asString(job.sourceUrl),
    company,
    title,
    location: asString(job.location),
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: asString(job.salaryCurrency),
    seniority: asString(job.seniority),
    workAuthorizationNote: asString(job.workAuthorizationNote),
    descriptionRaw: asString(job.descriptionRaw) || title,
    extractedSkills: Array.isArray(job.extractedSkills)
      ? job.extractedSkills.filter(
          (skill): skill is string => typeof skill === "string",
        )
      : [],
    tags: Array.isArray(job.tags)
      ? job.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    publishedAt: asString(job.publishedAt),
  };
}

function dedupeImportedJobs(jobs: ImportedFeedJob[]) {
  const byKey = new Map<string, ImportedFeedJob>();

  for (const job of jobs) {
    const key = (job.sourceUrl || `${job.source}:${job.company}:${job.title}`)
      .trim()
      .toLowerCase();

    if (!key) continue;
    byKey.set(key, job);
  }

  return Array.from(byKey.values());
}

function isRelevantImportedJob(
  job: ImportedFeedJob,
  roleKeywords: string[],
  locationKeywords: string[],
) {
  const roleText = `${job.title} ${job.descriptionRaw} ${job.extractedSkills.join(" ")}`;
  if (!matchesAnyKeyword(roleText, roleKeywords)) return false;

  if (locationKeywords.length === 0) return true;
  const locationText = `${job.location || ""} ${job.title} ${job.descriptionRaw}`;
  return matchesAnyKeyword(locationText, locationKeywords);
}

export function buildFeedImportSnapshotFromImportedJobs(input: {
  generatedAt?: string;
  sourceCount: number;
  jobs: Array<Partial<ImportedFeedJob>>;
  errors?: FeedImportError[];
  sourceResults?: FeedSourceResult[];
  env?: NodeJS.ProcessEnv;
}): FeedImportSnapshot {
  const env = input.env || process.env;
  const roleKeywords = parseKeywordList(
    env.TARGET_ROLE_KEYWORDS,
    DEFAULT_ROLE_KEYWORDS,
  );
  const locationKeywords = parseKeywordList(
    env.TARGET_LOCATION_KEYWORDS,
    DEFAULT_LOCATION_KEYWORDS,
  );
  const normalizedJobs = input.jobs
    .map((job) => normalizeImportedFeedJob(job))
    .filter((job): job is ImportedFeedJob => Boolean(job));
  const filteredJobs = normalizedJobs.filter((job) =>
    isRelevantImportedJob(job, roleKeywords, locationKeywords),
  );
  const dedupedJobs = dedupeImportedJobs(filteredJobs);
  const importedSourceCount = new Set(
    dedupedJobs.map((job) => job.sourceLabel || job.source),
  ).size;

  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    sourceCount: input.sourceCount,
    importedSourceCount,
    jobs: dedupedJobs,
    errors: input.errors || [],
    sourceResults: input.sourceResults || [],
    diagnostics: buildFeedImportDiagnostics(input.sourceCount, true),
    recoveryGuide: DEFAULT_RECOVERY_GUIDE,
  };
}
