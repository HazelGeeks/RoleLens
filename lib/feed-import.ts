import { extractJobDraft } from "@/lib/job-extraction";
import type { EmploymentType, JobSource, RemoteType } from "@/lib/local-jobs";
import type {
  FeedImportError,
  FeedImportDiagnostics,
  FeedImportSnapshot,
  FeedSourceResult,
  ImportedFeedJob,
} from "@/lib/feed-types";
import {
  type FeedPlatform,
  matchesFeedPlatform,
  parseFeedPlatform,
} from "@/lib/feed-platform";
import {
  isScrapedLinkPlaceholderDescription,
  sanitizeJobDescription,
} from "@/lib/job-description";

type FeedSourceConfig = {
  key: string;
  source: JobSource;
  label: string;
  url: string;
  defaultCompany?: string;
};

type AtsSourceConfig =
  | {
      provider: "GREENHOUSE";
      key: string;
      label: string;
      boardToken: string;
      companyName: string;
    }
  | {
      provider: "LEVER";
      key: string;
      label: string;
      companySlug: string;
      companyName: string;
    }
  | {
      provider: "ASHBY";
      key: string;
      label: string;
      organizationSlug: string;
      companyName: string;
    }
  | {
      provider: "SMARTRECRUITERS";
      key: string;
      label: string;
      companyIdentifier: string;
      companyName: string;
    };

type PythonScrapedSourceConfig = {
  key: string;
  source: JobSource;
  label: string;
  url: string;
  defaultCompany?: string;
};

type CollectFeedJobsOptions = {
  requestUrl?: string;
  platform?: FeedPlatform;
};

type ParsedFeedItem = {
  title: string;
  link?: string;
  guid?: string;
  publishedAt?: string;
  description?: string;
};

const SNAPSHOT_CACHE_PATH = "/api/jobs/import/snapshot-cache";
const FEED_CACHE_NAME = "rolelens-feed-snapshot";
const SNAPSHOT_CACHE_MAX_AGE_MS = 15 * 60 * 1000;
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
  "Local dev: /api/jobs/import automatically falls back to /api/jobs/local-python-scraped-feed when PYTHON_SCRAPED_FEED_URL is empty.",
  "Production: run the Python Scrape Now workflow so it posts crawler output to /api/jobs/ingest and stores the latest snapshot in D1.",
  "Confirm ROLELENS_CRON_SECRET matches the deployed CRON_SECRET for D1 ingestion.",
  "Only set PYTHON_SCRAPED_FEED_URL when intentionally debugging direct JSON feed imports.",
  "Restart next dev (local) after env changes or redeploy the target environment (Cloudflare).",
  "Call /api/jobs/import, then retry Sync All Feeds (or a platform sync button) in the Jobs page.",
];

const ASHBY_JOB_BOARD_ENDPOINT =
  "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoard";
const ASHBY_JOB_BOARD_QUERY =
  "query ApiJobBoard($organizationHostedJobsPageName: String!) { jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) { teams { id name } jobPostings { id title locationName teamId workplaceType employmentType } } }";
const SMARTRECRUITERS_PAGE_LIMIT = 100;
const LOCAL_DEV_PYTHON_SCRAPED_FEED_PATH = "/api/jobs/local-python-scraped-feed";
const PYTHON_DESCRIPTION_FETCH_TIMEOUT_MS = 6000;
const PYTHON_DESCRIPTION_MAX_CHARS = 5000;
const PYTHON_DESCRIPTION_HYDRATION_LIMIT = 20;
const LOW_SIGNAL_DESCRIPTION_MARKERS = [
  "we use cookies",
  "linkedin and 3rd parties use essential and non-essential cookies",
  "join now",
  "sign in",
  "create your account",
  "accept cookies",
  "log in",
  "captcha",
  "access denied",
  "are you a human",
] as const;

function splitCsv(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeHttpUrl(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === ",") return undefined;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function buildFeedImportDiagnostics(
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

export function buildFeedImportSnapshotFromImportedJobs(input: {
  generatedAt?: string;
  sourceCount: number;
  jobs: ImportedFeedJob[];
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
  const filteredJobs = input.jobs.filter((job) =>
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : undefined;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asString(entry))
      .filter((entry): entry is string => !!entry);
  }

  const single = asString(value);
  if (!single) return [];
  return splitCsv(single);
}

function parseEmploymentType(value: unknown): EmploymentType | undefined {
  const normalized = asString(value)
    ?.replace(/([a-z])([A-Z])/g, "$1_$2")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) return undefined;

  const allowed = [
    "FULL_TIME",
    "PART_TIME",
    "CONTRACT",
    "TEMPORARY",
    "INTERNSHIP",
    "FREELANCE",
    "OTHER",
  ] as const;

  return allowed.includes(normalized as EmploymentType)
    ? (normalized as EmploymentType)
    : undefined;
}

function hashToId(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  return `py:${Math.abs(hash).toString(16)}`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCompanyToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const BOARD_COMPANY_LABELS = new Set([
  "linkedin",
  "indeed",
  "jobkorea",
  "saramin",
  "weworkremotely",
  "remoteok",
  "wanted",
  "rocketpunch",
  "remember",
  "remotive",
  "pythonscraper",
]);

function isBoardCompanyLabel(value: string) {
  return BOARD_COMPANY_LABELS.has(normalizeCompanyToken(value));
}

const NON_COMPANY_TOKENS_RE =
  /\b(full[ -]?time|part[ -]?time|contract|intern(?:ship)?|remote|anywhere|new york|vancouver|canada|usd|eur|krw|원격|모집|채용|가능자|경력)\b/i;

function isLikelyCompanyCandidate(value: string) {
  const candidate = normalizeWhitespace(value);
  if (candidate.length < 2 || candidate.length > 80) return false;
  if (candidate.split(/\s+/).length > 5) return false;
  if (isBoardCompanyLabel(candidate)) return false;
  if (/[,$€£₩%]/.test(candidate)) return false;
  if (/\d{2,}/.test(candidate)) return false;
  if (NON_COMPANY_TOKENS_RE.test(candidate)) return false;
  return true;
}

function stripHtml(value: string) {
  const decoded = decodeXmlEntities(value);
  return normalizeWhitespace(decoded.replace(/<[^>]+>/g, " "));
}

function htmlToReadableText(value: string) {
  const decoded = decodeXmlEntities(value);
  const withBreaks = decoded
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|tr|table|blockquote)>/gi, "\n")
    .replace(/<(p|div|section|article|li|ul|ol|h[1-6]|tr|table|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const lines = withBreaks
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  return lines.join("\n");
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    );
}

function clipDescription(value: string) {
  return value.slice(0, PYTHON_DESCRIPTION_MAX_CHARS).trim();
}

function isLikelySearchResultsUrl(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host.includes("linkedin.com")) {
      return path.includes("/jobs/search");
    }
    if (host.includes("indeed.")) {
      return path.includes("/jobs") && parsed.searchParams.has("q");
    }
    return false;
  } catch {
    return false;
  }
}

function isHighSignalDescription(value: string, title: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return false;
  if (normalized.length < 80) return false;
  if (normalized.split(/\s+/).length < 18) return false;
  if (/^https?:\/\//i.test(normalized)) return false;
  if (isScrapedLinkPlaceholderDescription(normalized)) return false;

  const lower = normalized.toLowerCase();
  const hasLowSignalMarker = LOW_SIGNAL_DESCRIPTION_MARKERS.some((marker) =>
    lower.includes(marker),
  );
  if (!hasLowSignalMarker) return true;

  const titleTokens = title
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .filter((token) => token.length >= 4);
  if (titleTokens.length === 0) return false;

  return titleTokens.some((token) => lower.includes(token));
}

function shouldHydratePythonDescription(
  value: string,
  title: string,
  sourceUrl: string | undefined,
) {
  if (!sourceUrl || isLikelySearchResultsUrl(sourceUrl)) return false;

  const description = sanitizeJobDescription(htmlToReadableText(value));
  if (!description) return true;
  if (isScrapedLinkPlaceholderDescription(description)) return true;

  const normalizedDescription = normalizeWhitespace(description).toLowerCase();
  const normalizedTitle = normalizeWhitespace(title).toLowerCase();
  if (normalizedDescription === normalizedTitle) return true;
  if (/^https?:\/\//i.test(normalizedDescription)) return true;
  if (description.length < 80) return true;
  if (description.split(/\s+/).length < 18) return true;

  return false;
}

async function fetchDescriptionFromSource(sourceUrl: string, title: string) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, PYTHON_DESCRIPTION_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        "user-agent": "RoleLensDescriptionHydrator/1.0 (+https://rolelens.pages.dev)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const contentType = response.headers.get("content-type")?.toLowerCase();
    if (contentType && !contentType.includes("text/html")) return undefined;
    const html = await response.text();
    const cleanedHtml = html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
    const text = htmlToReadableText(cleanedHtml);
    if (!isHighSignalDescription(text, title)) return undefined;
    return clipDescription(text);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function readFirstTag(block: string, tags: string[]) {
  for (const tag of tags) {
    const pattern = new RegExp(
      `<${escapeRegex(tag)}[^>]*>([\\s\\S]*?)<\/${escapeRegex(tag)}>`,
      "i",
    );
    const match = block.match(pattern);
    if (!match?.[1]) continue;
    return decodeXmlEntities(match[1]);
  }

  return undefined;
}

function readLink(block: string) {
  const atomHref = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
  if (atomHref) return decodeXmlEntities(atomHref);
  return readFirstTag(block, ["link"]);
}

function parseFeedItems(xml: string): ParsedFeedItem[] {
  const blocks = [
    ...(xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? []),
  ];
  const parsed: ParsedFeedItem[] = [];

  for (const block of blocks) {
    const title = normalizeWhitespace(
      stripHtml(readFirstTag(block, ["title"]) ?? ""),
    );
    if (!title) continue;

    parsed.push({
      title,
      link: readLink(block),
      guid: readFirstTag(block, ["guid", "id"]),
      publishedAt: readFirstTag(block, [
        "pubDate",
        "published",
        "updated",
        "dc:date",
      ]),
      description:
        readFirstTag(block, [
          "description",
          "summary",
          "content:encoded",
          "content",
        ]) ?? "",
    });
  }

  return parsed;
}

function normalizeDate(value: string | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function normalizeDateFromEpoch(value: number | undefined) {
  if (typeof value !== "number") return undefined;
  const epoch = value < 1_000_000_000_000 ? value * 1000 : value;
  const parsed = new Date(epoch);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function parseSource(value: string | undefined): JobSource | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (
    upper === "LINKEDIN" ||
    upper === "INDEED" ||
    upper === "SARAMIN" ||
    upper === "JOBKOREA" ||
    upper === "MANUAL"
  ) {
    return upper;
  }

  return undefined;
}

function cleanFeedTitle(title: string, sourceKey: string) {
  if (sourceKey === "linkedin") {
    return normalizeWhitespace(
      title.replace(/\s*[\-|\|]\s*linkedin(?:\s+jobs)?$/i, ""),
    );
  }

  if (sourceKey === "indeed") {
    return normalizeWhitespace(
      title.replace(/\s*[\-|\|]\s*indeed(?:\s+jobs)?$/i, ""),
    );
  }

  return normalizeWhitespace(title);
}

function inferEmploymentTypeFromCommitment(
  commitment: string | undefined,
): EmploymentType | undefined {
  if (!commitment) return undefined;
  const lower = commitment.toLowerCase();
  if (lower.includes("full")) return "FULL_TIME";
  if (lower.includes("part")) return "PART_TIME";
  if (lower.includes("contract")) return "CONTRACT";
  if (lower.includes("intern")) return "INTERNSHIP";
  if (lower.includes("temp")) return "TEMPORARY";
  if (lower.includes("freelance")) return "FREELANCE";
  return undefined;
}

function parseRemoteTypeFromWorkplace(
  value: string | undefined,
): RemoteType | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower.includes("remote")) return "REMOTE";
  if (lower.includes("hybrid")) return "HYBRID";
  if (lower.includes("site") || lower.includes("office")) return "ONSITE";
  return undefined;
}

function inferCompanyFromTitle(title: string) {
  const normalizedTitle = normalizeWhitespace(title);
  const atMatch = normalizedTitle.match(/\bat\s+([^|,·•]+)$/i);
  if (atMatch?.[1]) {
    const candidate = normalizeWhitespace(atMatch[1]);
    if (isLikelyCompanyCandidate(candidate)) {
      return candidate;
    }
  }

  const wwrInlineMatch = normalizedTitle.match(
    /\b\d{1,2}d\s+([A-Za-z][A-Za-z0-9&'. -]{1,60}?)(?=\s+(?:Remote|Anywhere|Full-Time|Part-Time|Contract|New York(?: City)?|Vancouver|Toronto|Calgary|Montreal|San Francisco|London|\$|[A-Z][a-z]+,\s*[A-Z]{2}))/,
  );
  if (wwrInlineMatch?.[1]) {
    const candidate = normalizeWhitespace(wwrInlineMatch[1]);
    if (isLikelyCompanyCandidate(candidate)) {
      return candidate;
    }
  }

  const parts = normalizedTitle.split(" - ").map((part) => normalizeWhitespace(part));
  if (parts.length < 2) return undefined;

  const roleHint =
    /(engineer|developer|designer|manager|lead|architect|frontend|back[ -]?end|full[ -]?stack|intern|개발자|엔지니어|디자이너)/i;
  const first = parts[0];
  const last = parts[parts.length - 1];

  if (roleHint.test(first) && !roleHint.test(last) && isLikelyCompanyCandidate(last)) {
    return last;
  }
  if (!roleHint.test(first) && roleHint.test(last) && isLikelyCompanyCandidate(first)) {
    return first;
  }
  return undefined;
}

function inferCompanyFromSourceUrl(sourceUrl: string | undefined) {
  if (!sourceUrl) return undefined;

  try {
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    if (host.includes("linkedin.com")) {
      const linkedinMatch = path.match(/\/jobs\/view\/[^/?#]*-at-([a-z0-9-]+)-\d+/i);
      if (linkedinMatch?.[1]) {
        const inferred = linkedinMatch[1]
          .split("-")
          .map((chunk) =>
            chunk.length > 0 ? chunk[0].toUpperCase() + chunk.slice(1) : chunk,
          )
          .join(" ");
        return isBoardCompanyLabel(inferred) ? undefined : inferred;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function normalizeScrapedCompany(input: {
  rawCompany: string | undefined;
  sourceLabel: string;
  sourceUrl: string | undefined;
}) {
  const company = input.rawCompany ? normalizeWhitespace(input.rawCompany) : undefined;
  if (!company) return undefined;

  if (isBoardCompanyLabel(company)) return undefined;

  const normalizedCompany = company.toLowerCase();
  const normalizedSourceLabel = input.sourceLabel.toLowerCase();
  if (normalizedSourceLabel.includes(normalizedCompany)) return undefined;

  try {
    if (input.sourceUrl) {
      const host = new URL(input.sourceUrl).hostname.toLowerCase();
      if (
        (host.includes("linkedin.com") && normalizedCompany === "linkedin") ||
        (host.includes("indeed.") && normalizedCompany === "indeed") ||
        (host.includes("jobkorea.") && normalizedCompany === "jobkorea") ||
        (host.includes("saramin.") && normalizedCompany === "saramin")
      ) {
        return undefined;
      }
    }
  } catch {
    // ignore malformed sourceUrl and keep evaluating the company candidate
  }

  return company;
}

function normalizeImportedItem(
  item: ParsedFeedItem,
  source: FeedSourceConfig,
): ImportedFeedJob {
  const safeTitle = cleanFeedTitle(item.title, source.key);
  const cleanDescription = htmlToReadableText(item.description ?? "");
  const descriptionRaw = cleanDescription || safeTitle;
  const extractionSeed = `${safeTitle}\n${descriptionRaw}`;
  const draft = extractJobDraft({
    sourceUrl: item.link,
    existingTitle: safeTitle,
    descriptionRaw: extractionSeed,
  });

  const company =
    draft.company ??
    inferCompanyFromTitle(safeTitle) ??
    source.defaultCompany ??
    "Unknown Company";
  const externalIdSeed =
    item.guid ?? item.link ?? `${source.key}:${company}:${safeTitle}`;
  const tags = Array.from(
    new Set([source.label.toLowerCase(), ...draft.tags]),
  ).filter(Boolean);

  return {
    externalId: externalIdSeed,
    source: source.source,
    sourceLabel: source.label,
    sourceUrl: item.link,
    company,
    title: safeTitle,
    location: draft.location,
    remoteType: draft.remoteType,
    employmentType: draft.employmentType,
    salaryMin: draft.salaryMin,
    salaryMax: draft.salaryMax,
    salaryCurrency: draft.salaryCurrency,
    seniority: draft.seniority,
    workAuthorizationNote: draft.workAuthorizationNote,
    descriptionRaw,
    extractedSkills: draft.extractedSkills,
    tags,
    publishedAt: normalizeDate(item.publishedAt),
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

function toFeedSourceConfig(env: NodeJS.ProcessEnv): FeedSourceConfig[] {
  void env;
  return [];
}

function toAtsSourceConfig(env: NodeJS.ProcessEnv): AtsSourceConfig[] {
  void env;
  return [];
}

function toPythonScrapedSourceConfig(
  env: NodeJS.ProcessEnv,
  options: CollectFeedJobsOptions,
): PythonScrapedSourceConfig | null {
  const configuredUrl = normalizeHttpUrl(env.PYTHON_SCRAPED_FEED_URL);
  const isProduction = env.NODE_ENV === "production";

  let url = configuredUrl;
  if (!url && options.requestUrl) {
    try {
      const requestBaseUrl = new URL(options.requestUrl);
      const isLocalRequest =
        requestBaseUrl.hostname === "localhost" ||
        requestBaseUrl.hostname === "127.0.0.1";

      if (!isProduction || isLocalRequest) {
        url = new URL(
          LOCAL_DEV_PYTHON_SCRAPED_FEED_PATH,
          requestBaseUrl,
        ).toString();
      }
    } catch {
      url = undefined;
    }
  }

  if (!url) return null;

  return {
    key: "python-scraped",
    source: parseSource(env.PYTHON_SCRAPED_SOURCE_TYPE) ?? "MANUAL",
    label: env.PYTHON_SCRAPED_SOURCE_LABEL || "Python Scraper",
    url,
    defaultCompany: env.PYTHON_SCRAPED_DEFAULT_COMPANY,
  };
}

async function fetchAndParseFeedSource(
  source: FeedSourceConfig,
): Promise<ImportedFeedJob[]> {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "RoleLensFeedImporter/1.0 (+https://rolelens.pages.dev)",
      accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.2",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Feed request failed (${response.status})`);
  }

  const xml = await response.text();
  const items = parseFeedItems(xml);
  return items.map((item) => normalizeImportedItem(item, source));
}

function mapAtsDraftToImported(input: {
  externalId: string;
  sourceUrl?: string;
  companyName: string;
  title: string;
  location?: string;
  remoteType?: RemoteType;
  descriptionRaw: string;
  publishedAt?: string;
  sourceLabel: string;
  tags: string[];
  employmentType?: EmploymentType;
}): ImportedFeedJob {
  const draft = extractJobDraft({
    sourceUrl: input.sourceUrl,
    existingTitle: input.title,
    descriptionRaw: input.descriptionRaw,
  });

  return {
    externalId: input.externalId,
    source: "MANUAL",
    sourceLabel: input.sourceLabel,
    sourceUrl: input.sourceUrl,
    company: input.companyName,
    title: input.title,
    location: draft.location || input.location,
    remoteType: draft.remoteType || input.remoteType,
    employmentType: draft.employmentType || input.employmentType,
    salaryMin: draft.salaryMin,
    salaryMax: draft.salaryMax,
    salaryCurrency: draft.salaryCurrency,
    seniority: draft.seniority,
    workAuthorizationNote: draft.workAuthorizationNote,
    descriptionRaw: input.descriptionRaw,
    extractedSkills: draft.extractedSkills,
    tags: Array.from(new Set([...input.tags, ...draft.tags])),
    publishedAt: input.publishedAt,
  };
}

type NormalizePythonScrapedItemOptions = {
  hydrateDescriptionFromSource: boolean;
};

async function normalizePythonScrapedItem(
  value: unknown,
  source: PythonScrapedSourceConfig,
  index: number,
  options: NormalizePythonScrapedItemOptions,
): Promise<ImportedFeedJob | null> {
  const raw = asRecord(value);
  if (!raw) return null;

  const title = asString(raw.title) || asString(raw.role);
  if (!title) return null;

  const sourceUrl = asString(raw.sourceUrl) || asString(raw.url);
  const sourceLabel = asString(raw.sourceLabel) || source.label;
  const sourceType = parseSource(asString(raw.source)) ?? source.source;
  const rawDescriptionCandidate =
    asString(raw.descriptionRaw) ||
    asString(raw.description) ||
    asString(raw.summary) ||
    title;
  const sourceDescription = htmlToReadableText(rawDescriptionCandidate) || title;
  const hydratedDescription =
    options.hydrateDescriptionFromSource &&
    sourceUrl &&
    shouldHydratePythonDescription(sourceDescription, title, sourceUrl)
      ? await fetchDescriptionFromSource(sourceUrl, title)
      : undefined;
  const descriptionRaw =
    sanitizeJobDescription(hydratedDescription) ||
    sanitizeJobDescription(sourceDescription);

  const draft = extractJobDraft({
    sourceUrl,
    existingTitle: title,
    descriptionRaw,
  });

  const companyCandidates = [
    asString(raw.company),
    draft.company,
    inferCompanyFromTitle(title),
    inferCompanyFromSourceUrl(sourceUrl),
    source.defaultCompany,
  ];
  let company: string | undefined;
  for (const candidate of companyCandidates) {
    const normalizedCompany = normalizeScrapedCompany({
      rawCompany: candidate,
      sourceLabel,
      sourceUrl,
    });
    if (!normalizedCompany) continue;
    company = normalizedCompany;
    break;
  }

  company ||= "Unknown Company";
  const externalId =
    asString(raw.externalId) ||
    asString(raw.id) ||
    hashToId(`${source.key}:${sourceUrl || title}:${index}`);
  const tags = Array.from(
    new Set([
      "python-scraper",
      source.key,
      ...asStringArray(raw.tags),
      ...draft.tags,
    ]),
  );

  return {
    externalId,
    source: sourceType,
    sourceLabel,
    sourceUrl,
    company,
    title,
    location: draft.location || asString(raw.location),
    remoteType: draft.remoteType,
    employmentType: draft.employmentType || parseEmploymentType(raw.employmentType),
    salaryMin: draft.salaryMin ?? asNumber(raw.salaryMin),
    salaryMax: draft.salaryMax ?? asNumber(raw.salaryMax),
    salaryCurrency: draft.salaryCurrency || asString(raw.salaryCurrency),
    seniority: draft.seniority || asString(raw.seniority),
    workAuthorizationNote:
      draft.workAuthorizationNote || asString(raw.workAuthorizationNote),
    descriptionRaw,
    extractedSkills: Array.from(
      new Set([...draft.extractedSkills, ...asStringArray(raw.extractedSkills)]),
    ),
    tags,
    publishedAt: normalizeDate(asString(raw.publishedAt)),
  };
}

async function fetchPythonScrapedSource(
  source: PythonScrapedSourceConfig,
): Promise<ImportedFeedJob[]> {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "RoleLensPythonScraper/1.0 (+https://rolelens.pages.dev)",
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Python scraped feed request failed (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  const root = asRecord(payload);
  const jobs = Array.isArray(root?.jobs) ? root.jobs : [];
  let hydrationBudget = PYTHON_DESCRIPTION_HYDRATION_LIMIT;

  const normalizedJobs = await Promise.all(
    jobs.map((item, index) => {
      const raw = asRecord(item);
      const descriptionCandidate =
        asString(raw?.descriptionRaw) ||
        asString(raw?.description) ||
        asString(raw?.summary) ||
        "";
      const itemSourceUrl = asString(raw?.sourceUrl) || asString(raw?.url);
      const itemTitle = asString(raw?.title) || asString(raw?.role) || "";
      const hydrateDescriptionFromSource =
        hydrationBudget > 0 &&
        !!itemSourceUrl &&
        shouldHydratePythonDescription(
          descriptionCandidate,
          itemTitle,
          itemSourceUrl,
        );
      if (hydrateDescriptionFromSource) hydrationBudget -= 1;

      return normalizePythonScrapedItem(item, source, index, {
        hydrateDescriptionFromSource,
      });
    }),
  );

  return normalizedJobs.filter((item): item is ImportedFeedJob => item !== null);
}

async function fetchGreenhouseSource(
  source: Extract<AtsSourceConfig, { provider: "GREENHOUSE" }>,
): Promise<ImportedFeedJob[]> {
  const response = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${source.boardToken}/jobs?content=true`,
    {
      headers: {
        "user-agent": "RoleLensFeedImporter/1.0 (+https://rolelens.pages.dev)",
        accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`ATS request failed (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  const root = asRecord(payload);
  const jobs = Array.isArray(root?.jobs) ? root.jobs : [];

  return jobs
    .map((job) => {
      const data = asRecord(job);
      if (!data) return null;

      const id = asString(data.id) || String(asNumber(data.id) ?? "");
      const title = asString(data.title);
      if (!id || !title) return null;

      const locationRecord = asRecord(data.location);
      const location = stripHtml(asString(locationRecord?.name) || "") || undefined;
      const sourceUrl = asString(data.absolute_url);
      const content = htmlToReadableText(asString(data.content) || "");
      const descriptionRaw = content || title;
      const publishedAt = normalizeDate(asString(data.updated_at));

      return mapAtsDraftToImported({
        externalId: `gh:${source.boardToken}:${id}`,
        sourceUrl,
        companyName: source.companyName,
        title,
        location,
        descriptionRaw,
        publishedAt,
        sourceLabel: source.label,
        tags: ["greenhouse", source.boardToken.toLowerCase()],
      });
    })
    .filter((item): item is ImportedFeedJob => item !== null);
}

async function fetchLeverSource(
  source: Extract<AtsSourceConfig, { provider: "LEVER" }>,
): Promise<ImportedFeedJob[]> {
  const response = await fetch(
    `https://api.lever.co/v0/postings/${source.companySlug}?mode=json`,
    {
      headers: {
        "user-agent": "RoleLensFeedImporter/1.0 (+https://rolelens.pages.dev)",
        accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`ATS request failed (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) return [];

  return payload
    .map((posting) => {
      const data = asRecord(posting);
      if (!data) return null;

      const id = asString(data.id);
      const title = asString(data.text);
      if (!id || !title) return null;

      const categories = asRecord(data.categories);
      const location = asString(categories?.location);
      const commitment = asString(categories?.commitment);

      const lists = Array.isArray(data.lists)
        ? data.lists
            .map((entry) => {
              const section = asRecord(entry);
              if (!section) return "";
              return `${asString(section.text) || ""} ${stripHtml(asString(section.content) || "")}`.trim();
            })
            .filter(Boolean)
            .join("\n")
        : "";

      const descriptionRaw =
        [htmlToReadableText(asString(data.description) || ""), lists]
          .filter(Boolean)
          .join("\n") || title;

      const sourceUrl = asString(data.hostedUrl) || asString(data.applyUrl);
      const publishedAt = normalizeDateFromEpoch(asNumber(data.createdAt));

      return mapAtsDraftToImported({
        externalId: `lever:${source.companySlug}:${id}`,
        sourceUrl,
        companyName: source.companyName,
        title,
        location,
        descriptionRaw,
        publishedAt,
        sourceLabel: source.label,
        tags: ["lever", source.companySlug.toLowerCase()],
        employmentType: inferEmploymentTypeFromCommitment(commitment),
      });
    })
    .filter((item): item is ImportedFeedJob => item !== null);
}

async function fetchAshbySource(
  source: Extract<AtsSourceConfig, { provider: "ASHBY" }>,
): Promise<ImportedFeedJob[]> {
  const response = await fetch(ASHBY_JOB_BOARD_ENDPOINT, {
    method: "POST",
    headers: {
      "user-agent": "RoleLensFeedImporter/1.0 (+https://rolelens.pages.dev)",
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      operationName: "ApiJobBoard",
      variables: {
        organizationHostedJobsPageName: source.organizationSlug,
      },
      query: ASHBY_JOB_BOARD_QUERY,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`ATS request failed (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const jobBoard = asRecord(data?.jobBoard);
  const teamRecords = Array.isArray(jobBoard?.teams) ? jobBoard.teams : [];
  const postingRecords = Array.isArray(jobBoard?.jobPostings)
    ? jobBoard.jobPostings
    : [];
  const teamNameById = new Map<string, string>();

  for (const team of teamRecords) {
    const teamRecord = asRecord(team);
    const teamId = asString(teamRecord?.id);
    const teamName = asString(teamRecord?.name);
    if (!teamId || !teamName) continue;
    teamNameById.set(teamId, teamName);
  }

  return postingRecords
    .map((posting) => {
      const data = asRecord(posting);
      if (!data) return null;

      const id = asString(data.id);
      const title = asString(data.title);
      if (!id || !title) return null;

      const location = asString(data.locationName);
      const teamName = teamNameById.get(asString(data.teamId) || "");
      const workplaceType = asString(data.workplaceType);
      const employmentType = asString(data.employmentType);
      const descriptionRaw =
        [
          title,
          teamName ? `Team: ${teamName}` : null,
          location ? `Location: ${location}` : null,
          workplaceType ? `Workplace: ${workplaceType}` : null,
        ]
          .filter(Boolean)
          .join("\n") || title;

      return mapAtsDraftToImported({
        externalId: `ashby:${source.organizationSlug}:${id}`,
        sourceUrl: `https://jobs.ashbyhq.com/${encodeURIComponent(
          source.organizationSlug,
        )}/${encodeURIComponent(id)}`,
        companyName: source.companyName,
        title,
        location,
        remoteType: parseRemoteTypeFromWorkplace(workplaceType),
        descriptionRaw,
        sourceLabel: source.label,
        tags: ["ashby", source.organizationSlug.toLowerCase()],
        employmentType: parseEmploymentType(employmentType),
      });
    })
    .filter((item): item is ImportedFeedJob => item !== null);
}

function parseSmartRecruitersLocation(
  locationRecord: Record<string, unknown> | null,
) {
  const fullLocation = asString(locationRecord?.fullLocation);
  if (fullLocation) return fullLocation;

  const parts = [
    asString(locationRecord?.city),
    asString(locationRecord?.region),
    asString(locationRecord?.country),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function parseSmartRecruitersRemoteType(
  locationRecord: Record<string, unknown> | null,
): RemoteType | undefined {
  if (asBoolean(locationRecord?.remote) === true) return "REMOTE";
  if (asBoolean(locationRecord?.hybrid) === true) return "HYBRID";
  return undefined;
}

async function fetchSmartRecruitersSource(
  source: Extract<AtsSourceConfig, { provider: "SMARTRECRUITERS" }>,
): Promise<ImportedFeedJob[]> {
  const imported: ImportedFeedJob[] = [];
  let offset = 0;
  let totalFound: number | undefined;

  while (true) {
    const endpoint = new URL(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(
        source.companyIdentifier,
      )}/postings`,
    );
    endpoint.searchParams.set("offset", String(offset));
    endpoint.searchParams.set("limit", String(SMARTRECRUITERS_PAGE_LIMIT));

    const response = await fetch(endpoint.toString(), {
      headers: {
        "user-agent": "RoleLensFeedImporter/1.0 (+https://rolelens.pages.dev)",
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`ATS request failed (${response.status})`);
    }

    const payload = (await response.json()) as unknown;
    const root = asRecord(payload);
    const content = Array.isArray(root?.content) ? root.content : [];
    totalFound = asNumber(root?.totalFound) ?? totalFound;
    if (content.length === 0) break;

    const mapped = content
      .map((posting) => {
        const data = asRecord(posting);
        if (!data) return null;

        const id = asString(data.id) || asString(data.uuid);
        const title = asString(data.name);
        if (!id || !title) return null;

        const locationRecord = asRecord(data.location);
        const location = parseSmartRecruitersLocation(locationRecord);
        const department = asString(asRecord(data.department)?.label);
        const sourceUrl = asString(data.ref);
        const descriptionRaw =
          [title, department, location].filter(Boolean).join("\n") || title;
        const employmentType =
          asString(asRecord(data.typeOfEmployment)?.label) ||
          asString(asRecord(data.typeOfEmployment)?.id);
        const companyName =
          asString(asRecord(data.company)?.name) || source.companyName;

        return mapAtsDraftToImported({
          externalId: `smartrecruiters:${source.companyIdentifier}:${id}`,
          sourceUrl,
          companyName,
          title,
          location,
          remoteType: parseSmartRecruitersRemoteType(locationRecord),
          descriptionRaw,
          publishedAt: normalizeDate(asString(data.releasedDate)),
          sourceLabel: source.label,
          tags: ["smartrecruiters", source.companyIdentifier.toLowerCase()],
          employmentType: parseEmploymentType(employmentType),
        });
      })
      .filter((item): item is ImportedFeedJob => item !== null);

    imported.push(...mapped);
    offset += content.length;
    if (totalFound != null && offset >= totalFound) break;
  }

  return imported;
}

async function fetchAndParseAtsSource(
  source: AtsSourceConfig,
): Promise<ImportedFeedJob[]> {
  if (source.provider === "GREENHOUSE") {
    return fetchGreenhouseSource(source);
  }

  if (source.provider === "LEVER") {
    return fetchLeverSource(source);
  }

  if (source.provider === "ASHBY") {
    return fetchAshbySource(source);
  }

  return fetchSmartRecruitersSource(source);
}

export async function collectFeedJobs(
  env: NodeJS.ProcessEnv = process.env,
  options: CollectFeedJobsOptions = {},
): Promise<FeedImportSnapshot> {
  const feedSources = toFeedSourceConfig(env);
  const atsSources = toAtsSourceConfig(env);
  const pythonScrapedSource = toPythonScrapedSourceConfig(env, options);
  const sourceCount =
    feedSources.length + atsSources.length + (pythonScrapedSource ? 1 : 0);
  const diagnostics = buildFeedImportDiagnostics(sourceCount, !!pythonScrapedSource);
  const errors: FeedImportSnapshot["errors"] = [];
  const sourceResults: FeedImportSnapshot["sourceResults"] = [];
  const roleKeywords = parseKeywordList(
    env.TARGET_ROLE_KEYWORDS,
    DEFAULT_ROLE_KEYWORDS,
  );
  const locationKeywords = parseKeywordList(
    env.TARGET_LOCATION_KEYWORDS,
    DEFAULT_LOCATION_KEYWORDS,
  );
  const platform = parseFeedPlatform(options.platform);

  const tasks: Array<{ label: string; run: () => Promise<ImportedFeedJob[]> }> =
    [
      ...feedSources.map((source) => ({
        label: source.label,
        run: () => fetchAndParseFeedSource(source),
      })),
      ...atsSources.map((source) => ({
        label: source.label,
        run: () => fetchAndParseAtsSource(source),
      })),
      ...(pythonScrapedSource
        ? [
            {
              label: pythonScrapedSource.label,
              run: () => fetchPythonScrapedSource(pythonScrapedSource),
            },
          ]
        : []),
    ];

  if (tasks.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      sourceCount: 0,
      importedSourceCount: 0,
      jobs: [],
      errors: [
        {
          source: "configuration",
          message:
            "No direct feed sources configured. Local dev: call via /api/jobs/import (uses local fallback) or set PYTHON_SCRAPED_FEED_URL in .env.local. Production should read D1-ingested snapshots from /api/jobs/import; run the Python Scrape Now workflow if D1 has no snapshot yet.",
        },
      ],
      sourceResults: [],
      diagnostics,
      recoveryGuide: DEFAULT_RECOVERY_GUIDE,
    };
  }

  const taskResults = await Promise.all(
    tasks.map(async (task) => {
      try {
        const imported = await task.run();
        return {
          source: task.label,
          imported:
            platform === "all"
              ? imported
              : imported.filter((job) => matchesFeedPlatform(job, platform)),
          totalImported: imported.length,
          error: null as string | null,
        };
      } catch (error) {
        return {
          source: task.label,
          imported: [] as ImportedFeedJob[],
          totalImported: 0,
          error:
            error instanceof Error
              ? error.message
              : "Unknown feed import error",
        };
      }
    }),
  );

  for (const result of taskResults) {
    if (result.error) {
      errors.push({
        source: result.source,
        message: result.error,
      });
      sourceResults.push({
        source: result.source,
        ok: false,
        importedJobs: 0,
        message: result.error,
      });
      continue;
    }

    sourceResults.push({
      source: result.source,
      ok: true,
      importedJobs: result.imported.length,
      message:
        platform === "all"
          ? undefined
          : `Platform filter (${platform}): ${result.imported.length}/${result.totalImported}`,
    });
  }

  const jobs = taskResults.flatMap((result) => result.imported);

  const filteredJobs = jobs.filter((job) =>
    isRelevantImportedJob(job, roleKeywords, locationKeywords),
  );
  const dedupedJobs = dedupeImportedJobs(filteredJobs);
  const importedSourceCount = new Set(
    dedupedJobs.map((job) => job.sourceLabel || job.source),
  ).size;

  return {
    generatedAt: new Date().toISOString(),
    sourceCount: tasks.length,
    importedSourceCount,
    jobs: dedupedJobs,
    errors,
    sourceResults,
    diagnostics,
    recoveryGuide: DEFAULT_RECOVERY_GUIDE,
  };
}

function cacheKeyFromRequest(request: Request) {
  return new Request(new URL(SNAPSHOT_CACHE_PATH, request.url).toString(), {
    method: "GET",
  });
}

async function getFeedCache() {
  if (typeof caches === "undefined") return null;

  try {
    return await caches.open(FEED_CACHE_NAME);
  } catch {
    return null;
  }
}

function isFreshFeedSnapshot(snapshot: FeedImportSnapshot) {
  const generatedAt = new Date(snapshot.generatedAt).getTime();
  if (!Number.isFinite(generatedAt)) return false;
  return Date.now() - generatedAt <= SNAPSHOT_CACHE_MAX_AGE_MS;
}

export async function readFeedSnapshotFromCache(
  request: Request,
): Promise<FeedImportSnapshot | null> {
  const cache = await getFeedCache();
  if (!cache) return null;

  try {
    const cached = await cache.match(cacheKeyFromRequest(request));
    if (!cached) return null;
    const snapshot = (await cached.json()) as FeedImportSnapshot;
    return isFreshFeedSnapshot(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

export async function writeFeedSnapshotToCache(
  request: Request,
  snapshot: FeedImportSnapshot,
) {
  const cache = await getFeedCache();
  if (!cache) return;

  try {
    await cache.put(
      cacheKeyFromRequest(request),
      new Response(JSON.stringify(snapshot), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, s-maxage=43200",
        },
      }),
    );
  } catch {
    // Ignore cache failures. Import still succeeds with direct response.
  }
}
