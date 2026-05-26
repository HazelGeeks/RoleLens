import type { FeedImportError, FeedSourceResult } from "@/lib/feed-types";
import { type FeedPlatform, parseFeedPlatform } from "@/lib/feed-platform";
import type { JobSource } from "@/lib/local-jobs";
import {
  saveScrapedFeedSnapshot,
  type ScrapedFeedSnapshotPayload,
} from "@/lib/scraped-feed-store";
import sourceCatalog from "@/python/scraper/sources.sites.json";

const DEFAULT_TIMEOUT_SECONDS = 20;
const DEFAULT_LIMIT_PER_SOURCE = 120;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 5;

const ROLE_HINT_RE =
  /(engineer|developer|frontend|front-end|backend|back-end|full\s*stack|software|ios|android|designer|design|data|analyst|scientist|ml|ai|devops|sre|qa|test|product|pm|intern|개발자|엔지니어|프론트엔드|백엔드|데이터|디자이너|인턴)/i;
const JOB_HINT_RE =
  /(job|jobs|career|careers|position|opening|hiring|recruit|apply|채용|공고|모집|직무|포지션)/i;
const NAV_NOISE_RE =
  /(login|log-in|sign[\s_-]?in|sign[\s_-]?up|join|register|privacy|terms|help|support|about|home|skip to|cookie|mypage|회원가입|로그인|이용약관|개인정보|고객센터|문의|공지|메인)/i;
const URL_NOISE_RE =
  /([/?&]utm_|\/categories\/|\/category\/|\/career-services\/|\/job-seekers\/|\/find-your-plan|\/post-a-remote-job|\/listing_ads\/|\/remote-job-rss-feed|\/remote-work-hiring-guide|\/top-trending-remote-jobs)/i;

const PLATFORM_MARKERS: Record<Exclude<FeedPlatform, "all">, string[]> = {
  indeed: ["indeed"],
  linkedin: ["linkedin"],
  saramin: ["saramin", "사람인", "jumpit.saramin", "hiring.saramin"],
  jobkorea: ["jobkorea", "jobkorea.co.kr"],
};

const SOURCE_VALUES: JobSource[] = [
  "LINKEDIN",
  "INDEED",
  "SARAMIN",
  "JOBKOREA",
  "MANUAL",
];

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

type RawSource = {
  name?: unknown;
  url?: unknown;
  company?: unknown;
  source_type?: unknown;
};

type ScrapeSource = {
  name: string;
  url: string;
  company: string;
  sourceType: JobSource;
};

type AnchorEntry = {
  href: string;
  text: string;
};

export type ScrapedFeedCrawlOptions = {
  platform?: FeedPlatform;
  sourceUrls?: string[];
  includeDefaultCatalog?: boolean;
  timeoutSeconds?: number;
  limitPerSource?: number;
};

export type ScrapedFeedCrawlSnapshot = ScrapedFeedSnapshotPayload & {
  platform: FeedPlatform;
};

export type ScrapedFeedCrawlRun = {
  snapshot: ScrapedFeedCrawlSnapshot;
  saved: Awaited<ReturnType<typeof saveScrapedFeedSnapshot>>;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseSourceType(value: string): JobSource {
  const normalized = value.trim().toUpperCase();
  return SOURCE_VALUES.includes(normalized as JobSource)
    ? (normalized as JobSource)
    : "MANUAL";
}

function normalizeHttpUrl(value: string) {
  if (!value) return undefined;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function slugify(value: string) {
  const lowered = value.toLowerCase().trim();
  const dashed = lowered.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return dashed || "source";
}

function toDisplayNameFromSlug(value: string) {
  const parts = value.split("-").filter(Boolean);
  if (parts.length === 0) return value;
  return parts
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeCompanyToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isBoardCompanyLabel(value: string) {
  return BOARD_COMPANY_LABELS.has(normalizeCompanyToken(value));
}

function inferCompanyFromLinkedinUrl(sourceUrl: string) {
  const match = sourceUrl.match(/\/jobs\/view\/[^/?#]*-at-([a-z0-9-]+)-\d+/i);
  if (!match) return undefined;

  const inferred = toDisplayNameFromSlug(match[1]!.toLowerCase());
  return isBoardCompanyLabel(inferred) ? undefined : inferred;
}

function inferCompanyFromTitle(title: string) {
  const match = title.match(/\bat\s+([^|,·•]+)$/i);
  if (!match) return undefined;

  const candidate = cleanText(match[1] || "");
  if (!candidate) return undefined;
  if (candidate.length < 2 || candidate.length > 80) return undefined;
  if (isBoardCompanyLabel(candidate)) return undefined;
  return candidate;
}

function inferCompany(source: ScrapeSource, title: string, sourceUrl: string) {
  if (source.sourceType === "LINKEDIN") {
    const fromUrl = inferCompanyFromLinkedinUrl(sourceUrl);
    if (fromUrl) return fromUrl;
  }

  const fromTitle = inferCompanyFromTitle(title);
  if (fromTitle) return fromTitle;
  return undefined;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => {
      const parsed = Number.parseInt(code, 10);
      if (!Number.isFinite(parsed)) return _;
      return String.fromCodePoint(parsed);
    })
    .replace(/&#x([a-f0-9]+);/gi, (_, code: string) => {
      const parsed = Number.parseInt(code, 16);
      if (!Number.isFinite(parsed)) return _;
      return String.fromCodePoint(parsed);
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function cleanText(value: string) {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function isHttpUrl(value: string) {
  return !!normalizeHttpUrl(value);
}

function shouldKeepLink(title: string, href: string) {
  if (!title && !href) return false;
  if (title.length > 200) return false;

  const normalizedTitle = title.toLowerCase();
  let searchableHref = href.toLowerCase();
  try {
    const parsed = new URL(href);
    searchableHref = `${parsed.pathname} ${parsed.search}`.toLowerCase();
  } catch {
    searchableHref = href.toLowerCase();
  }

  if (NAV_NOISE_RE.test(normalizedTitle) || NAV_NOISE_RE.test(searchableHref)) {
    return false;
  }
  if (URL_NOISE_RE.test(searchableHref)) {
    return false;
  }
  if (normalizedTitle.length < 2) {
    return false;
  }

  return ROLE_HINT_RE.test(normalizedTitle) || JOB_HINT_RE.test(searchableHref);
}

function isLikelyJobUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.toLowerCase();
  const query = parsed.search.toLowerCase();
  const pathAndQuery = `${path}?${query}`;

  if (URL_NOISE_RE.test(pathAndQuery)) {
    return false;
  }

  if (host.includes("linkedin.com")) {
    return path.includes("/jobs/view/");
  }
  if (host.includes("indeed.")) {
    return path.includes("/viewjob") || query.includes("jk=");
  }
  if (host.includes("jobkorea.co.kr")) {
    return path.includes("/recruit/gi_read/");
  }
  if (host.includes("saramin.co.kr")) {
    return path.includes("/zf_user/jobs/relay/view") || path.includes("/zf_user/jobs/view");
  }
  if (host.includes("weworkremotely.com")) {
    if (!path.includes("/remote-jobs/")) return false;
    return !path.replace(/\/+$/, "").endsWith("/remote-jobs");
  }

  return true;
}

function parseAnchors(html: string) {
  const anchors: AnchorEntry[] = [];
  const pattern =
    /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(pattern)) {
    const href = (match[1] || match[2] || match[3] || "").trim();
    if (!href) continue;

    const text = cleanText(stripTags(match[4] || ""));
    anchors.push({ href, text });
  }

  return anchors;
}

function normalizeSourceNameFromUrl(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host || "source";
  } catch {
    return "source";
  }
}

function normalizeSources(rawCatalog: unknown, extraUrls: string[]) {
  const normalized: ScrapeSource[] = [];

  if (Array.isArray(rawCatalog)) {
    for (const entry of rawCatalog) {
      const source = entry as RawSource;
      const name = asString(source?.name);
      const url = normalizeHttpUrl(asString(source?.url));
      if (!name || !url) continue;

      normalized.push({
        name,
        url,
        company: asString(source?.company) || name,
        sourceType: parseSourceType(asString(source?.source_type)),
      });
    }
  }

  for (const rawUrl of extraUrls) {
    const url = normalizeHttpUrl(rawUrl.trim());
    if (!url) continue;

    const name = normalizeSourceNameFromUrl(url);
    normalized.push({
      name,
      url,
      company: name,
      sourceType: "MANUAL",
    });
  }

  const byUrl = new Map<string, ScrapeSource>();
  for (const source of normalized) {
    byUrl.set(source.url.toLowerCase(), source);
  }
  return Array.from(byUrl.values());
}

function sourceMatchesPlatform(source: ScrapeSource, platform: FeedPlatform) {
  if (platform === "all") return true;

  const markers = PLATFORM_MARKERS[platform];
  if (!markers) return false;

  const searchable = `${source.sourceType} ${source.name} ${source.company} ${source.url}`.toLowerCase();
  return markers.some((marker) => searchable.includes(marker));
}

function filterSourcesByPlatform(sources: ScrapeSource[], platform: FeedPlatform) {
  return sources.filter((source) => sourceMatchesPlatform(source, platform));
}

function hashToId(seed: string) {
  let first = 0x811c9dc5;
  let second = 0x01000193;

  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x27d4eb2d);
  }

  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9,ko;q=0.8",
        "cache-control": "no-cache",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function crawlSource(source: ScrapeSource, timeoutMs: number, limitPerSource: number) {
  const label = `PythonScraper:${source.name}`;
  let response: Response;

  try {
    response = await fetchWithTimeout(source.url, timeoutMs);
  } catch (error) {
    const message =
      error instanceof Error
        ? `Scrape request failed: ${error.message}`
        : "Scrape request failed";

    return {
      jobs: [] as Record<string, unknown>[],
      result: {
        source: label,
        ok: false,
        importedJobs: 0,
        message,
      } satisfies FeedSourceResult,
      error: {
        source: label,
        message,
      } satisfies FeedImportError,
    };
  }

  if (!response.ok) {
    const message = `Scrape request failed (${response.status})`;
    return {
      jobs: [] as Record<string, unknown>[],
      result: {
        source: label,
        ok: false,
        importedJobs: 0,
        message,
      } satisfies FeedSourceResult,
      error: {
        source: label,
        message,
      } satisfies FeedImportError,
    };
  }

  const html = await response.text();
  const anchors = parseAnchors(html);

  const jobs: Record<string, unknown>[] = [];
  const seenUrls = new Set<string>();
  const nowIso = new Date().toISOString();
  const sourceSlug = slugify(source.name);

  for (const anchor of anchors) {
    if (jobs.length >= limitPerSource) break;

    const href = anchor.href.trim();
    const hrefLower = href.toLowerCase();
    if (
      hrefLower.startsWith("#") ||
      hrefLower.startsWith("javascript:") ||
      hrefLower.startsWith("mailto:") ||
      hrefLower.startsWith("tel:")
    ) {
      continue;
    }

    let absoluteUrl = "";
    try {
      absoluteUrl = new URL(href, source.url).toString();
    } catch {
      continue;
    }

    if (!isHttpUrl(absoluteUrl)) continue;
    if (!isLikelyJobUrl(absoluteUrl)) continue;

    const title = cleanText(anchor.text);
    if (!title) continue;
    if (!shouldKeepLink(title, absoluteUrl)) continue;

    const urlKey = absoluteUrl.toLowerCase();
    if (seenUrls.has(urlKey)) continue;
    seenUrls.add(urlKey);

    const digest = hashToId(`${sourceSlug}|${absoluteUrl}|${title}`);

    const job: Record<string, unknown> = {
      externalId: `py:${sourceSlug}:${digest}`,
      source: source.sourceType,
      sourceLabel: label,
      sourceUrl: absoluteUrl,
      title,
      descriptionRaw: `Scraped link from ${source.url}`,
      publishedAt: nowIso,
      tags: ["python-scraper", sourceSlug, "cloudflare-scraper"],
    };

    const inferredCompany = inferCompany(source, title, absoluteUrl);
    if (inferredCompany) {
      job.company = inferredCompany;
    }

    jobs.push(job);
  }

  return {
    jobs,
    result: {
      source: label,
      ok: true,
      importedJobs: jobs.length,
    } satisfies FeedSourceResult,
    error: null,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  if (items.length === 0) return [] as R[];

  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from(
    {
      length: Math.min(Math.max(1, concurrency), items.length),
    },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index] as T, index);
      }
    },
  );

  await Promise.all(runners);
  return results;
}

export async function crawlScrapedFeedSources(
  options: ScrapedFeedCrawlOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<ScrapedFeedCrawlSnapshot> {
  const platform = parseFeedPlatform(options.platform || "all");
  const timeoutSeconds =
    options.timeoutSeconds ??
    parsePositiveInteger(env.SCRAPED_FEED_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS);
  const limitPerSource =
    options.limitPerSource ??
    parsePositiveInteger(env.SCRAPED_FEED_LIMIT_PER_SOURCE, DEFAULT_LIMIT_PER_SOURCE);
  const concurrency = Math.min(
    MAX_CONCURRENCY,
    parsePositiveInteger(env.SCRAPED_FEED_CRAWL_CONCURRENCY, DEFAULT_CONCURRENCY),
  );

  const defaultCatalog = options.includeDefaultCatalog === false ? [] : sourceCatalog;
  const configuredSources = normalizeSources(defaultCatalog, options.sourceUrls || []);
  const sources = filterSourcesByPlatform(configuredSources, platform);

  const crawled = await mapWithConcurrency(sources, concurrency, async (source) =>
    crawlSource(source, timeoutSeconds * 1000, limitPerSource),
  );

  const jobs: Record<string, unknown>[] = [];
  const sourceResults: FeedSourceResult[] = [];
  const errors: FeedImportError[] = [];

  for (const entry of crawled) {
    jobs.push(...entry.jobs);
    sourceResults.push(entry.result);
    if (entry.error) errors.push(entry.error);
  }

  return {
    generatedAt: new Date().toISOString(),
    platform,
    sourceCount: sourceResults.length,
    jobs,
    sourceResults,
    errors,
  };
}

export async function crawlAndSaveScrapedFeedSnapshot(
  options: ScrapedFeedCrawlOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<ScrapedFeedCrawlRun> {
  const snapshot = await crawlScrapedFeedSources(options, env);
  const saved = await saveScrapedFeedSnapshot(snapshot, env);
  return {
    snapshot,
    saved,
  };
}
