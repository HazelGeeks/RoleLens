import { extractJobDraft } from "@/lib/job-extraction";
import type { EmploymentType, JobSource } from "@/lib/local-jobs";
import type { FeedImportSnapshot, ImportedFeedJob } from "@/lib/feed-types";

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
const DEFAULT_ROLE_KEYWORDS = [
  "frontend",
  "front-end",
  "front end",
  "react",
  "typescript",
  "web ui",
  "ui engineer",
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

function splitCsv(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toDisplayNameFromSlug(value: string) {
  return value
    .split(/[-_\s]+/)
    .map((chunk) => (chunk ? chunk[0].toUpperCase() + chunk.slice(1) : chunk))
    .join(" ");
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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string) {
  return normalizeWhitespace(value.replace(/<[^>]+>/g, " "));
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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
    upper === "COMPANY_SITE" ||
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

function inferCompanyFromTitle(title: string) {
  const parts = title.split(" - ").map((part) => normalizeWhitespace(part));
  if (parts.length < 2) return undefined;

  const roleHint =
    /(engineer|developer|designer|manager|lead|architect|frontend|back[ -]?end|full[ -]?stack|intern)/i;
  const first = parts[0];
  const last = parts[parts.length - 1];

  if (roleHint.test(first) && !roleHint.test(last)) return last;
  if (!roleHint.test(first) && roleHint.test(last)) return first;
  return undefined;
}

function normalizeImportedItem(
  item: ParsedFeedItem,
  source: FeedSourceConfig,
): ImportedFeedJob {
  const safeTitle = cleanFeedTitle(item.title, source.key);
  const cleanDescription = stripHtml(item.description ?? "");
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
  const thirdSourceType =
    parseSource(env.THIRD_ALERT_SOURCE_TYPE) ?? "COMPANY_SITE";

  const candidates: Array<Omit<FeedSourceConfig, "url"> & { url?: string }> = [
    {
      key: "linkedin",
      source: "LINKEDIN",
      label: "LinkedIn",
      url: env.LINKEDIN_ALERT_FEED_URL,
      defaultCompany: env.LINKEDIN_DEFAULT_COMPANY,
    },
    {
      key: "indeed",
      source: "INDEED",
      label: "Indeed",
      url: env.INDEED_ALERT_FEED_URL,
      defaultCompany: env.INDEED_DEFAULT_COMPANY,
    },
    {
      key: "third",
      source: thirdSourceType,
      label: env.THIRD_ALERT_SOURCE_LABEL || "Third Source",
      url: env.THIRD_ALERT_FEED_URL,
      defaultCompany: env.THIRD_DEFAULT_COMPANY,
    },
  ];

  return candidates
    .filter(
      (candidate): candidate is FeedSourceConfig =>
        typeof candidate.url === "string" && candidate.url.trim().length > 0,
    )
    .map((candidate) => ({
      ...candidate,
      url: candidate.url.trim(),
    }));
}

function toAtsSourceConfig(env: NodeJS.ProcessEnv): AtsSourceConfig[] {
  const greenhouse = splitCsv(env.GREENHOUSE_BOARD_TOKENS).map(
    (boardToken) => ({
      provider: "GREENHOUSE" as const,
      key: `gh:${boardToken}`,
      label: `Greenhouse:${boardToken}`,
      boardToken,
      companyName: toDisplayNameFromSlug(boardToken),
    }),
  );

  const lever = splitCsv(env.LEVER_COMPANIES).map((companySlug) => ({
    provider: "LEVER" as const,
    key: `lever:${companySlug}`,
    label: `Lever:${companySlug}`,
    companySlug,
    companyName: toDisplayNameFromSlug(companySlug),
  }));

  return [...greenhouse, ...lever];
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
    source: "COMPANY_SITE",
    sourceLabel: input.sourceLabel,
    sourceUrl: input.sourceUrl,
    company: input.companyName,
    title: input.title,
    location: draft.location || input.location,
    remoteType: draft.remoteType,
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
      const location = asString(locationRecord?.name);
      const sourceUrl = asString(data.absolute_url);
      const content = stripHtml(asString(data.content) || "");
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
        [stripHtml(asString(data.description) || ""), lists]
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

async function fetchAndParseAtsSource(
  source: AtsSourceConfig,
): Promise<ImportedFeedJob[]> {
  if (source.provider === "GREENHOUSE") {
    return fetchGreenhouseSource(source);
  }

  return fetchLeverSource(source);
}

export async function collectFeedJobs(
  env: NodeJS.ProcessEnv = process.env,
): Promise<FeedImportSnapshot> {
  const feedSources = toFeedSourceConfig(env);
  const atsSources = toAtsSourceConfig(env);
  const errors: FeedImportSnapshot["errors"] = [];
  const roleKeywords = parseKeywordList(
    env.TARGET_ROLE_KEYWORDS,
    DEFAULT_ROLE_KEYWORDS,
  );
  const locationKeywords = parseKeywordList(
    env.TARGET_LOCATION_KEYWORDS,
    DEFAULT_LOCATION_KEYWORDS,
  );

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
    ];

  if (tasks.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      sourceCount: 0,
      jobs: [],
      errors: [
        {
          source: "configuration",
          message:
            "No sources configured. Set GREENHOUSE_BOARD_TOKENS / LEVER_COMPANIES or LINKEDIN_ALERT_FEED_URL / INDEED_ALERT_FEED_URL / THIRD_ALERT_FEED_URL.",
        },
      ],
    };
  }

  const jobs = (
    await Promise.all(
      tasks.map(async (task) => {
        try {
          return await task.run();
        } catch (error) {
          errors.push({
            source: task.label,
            message:
              error instanceof Error
                ? error.message
                : "Unknown feed import error",
          });
          return [];
        }
      }),
    )
  ).flat();

  const filteredJobs = jobs.filter((job) =>
    isRelevantImportedJob(job, roleKeywords, locationKeywords),
  );

  return {
    generatedAt: new Date().toISOString(),
    sourceCount: tasks.length,
    jobs: dedupeImportedJobs(filteredJobs),
    errors,
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

export async function readFeedSnapshotFromCache(
  request: Request,
): Promise<FeedImportSnapshot | null> {
  const cache = await getFeedCache();
  if (!cache) return null;

  try {
    const cached = await cache.match(cacheKeyFromRequest(request));
    if (!cached) return null;
    return (await cached.json()) as FeedImportSnapshot;
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
