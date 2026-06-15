import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedImportSnapshot } from "@/lib/feed-types";

vi.mock("@/lib/feed-snapshot-cache", () => ({
  readFeedSnapshotFromCache: vi.fn(),
  writeFeedSnapshotToCache: vi.fn(),
}));

vi.mock("@/lib/feed-snapshot-store", () => ({
  readLatestFeedSnapshotFromD1: vi.fn(),
}));

import {
  readFeedSnapshotFromCache,
  writeFeedSnapshotToCache,
} from "@/lib/feed-snapshot-cache";
import { readLatestFeedSnapshotFromD1 } from "@/lib/feed-snapshot-store";
import { GET } from "./route";

const mockedReadFeedSnapshotFromCache = vi.mocked(readFeedSnapshotFromCache);
const mockedWriteFeedSnapshotToCache = vi.mocked(writeFeedSnapshotToCache);
const mockedReadLatestFeedSnapshotFromD1 = vi.mocked(readLatestFeedSnapshotFromD1);

const ORIGINAL_IMPORT_PUBLIC_RATE_LIMIT_PER_MIN =
  process.env.IMPORT_PUBLIC_RATE_LIMIT_PER_MIN;
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

function buildSnapshot(): FeedImportSnapshot {
  return {
    generatedAt: "2026-04-13T00:00:00.000Z",
    sourceCount: 2,
    importedSourceCount: 2,
    jobs: [
      {
        externalId: "indeed-1",
        source: "INDEED",
        sourceLabel: "PythonScraper:Indeed",
        sourceUrl: "https://www.indeed.com/viewjob?jk=1",
        company: "Indeed Co",
        title: "Frontend Engineer",
        location: "Vancouver",
        descriptionRaw: "React TypeScript",
        extractedSkills: ["React"],
        tags: ["python-scraper"],
      },
      {
        externalId: "linkedin-1",
        source: "LINKEDIN",
        sourceLabel: "PythonScraper:LinkedIn",
        sourceUrl: "https://www.linkedin.com/jobs/view/1",
        company: "LinkedIn Co",
        title: "Backend Engineer",
        location: "Toronto",
        descriptionRaw: "Node APIs",
        extractedSkills: ["Node"],
        tags: ["python-scraper"],
      },
    ],
    errors: [],
    sourceResults: [
      {
        source: "PythonScraper:Indeed",
        ok: true,
        importedJobs: 1,
      },
      {
        source: "PythonScraper:LinkedIn",
        ok: true,
        importedJobs: 1,
      },
    ],
    diagnostics: {
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
        scrapedFeedConfigured: true,
        configuredSourceCount: 1,
      },
      sourceCount: 2,
    },
    recoveryGuide: ["retry"],
  };
}

describe("/api/jobs/import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.IMPORT_PUBLIC_RATE_LIMIT_PER_MIN = "60";
    process.env.CRON_SECRET = "test-cron-secret";
    mockedReadLatestFeedSnapshotFromD1.mockResolvedValue(null);
    mockedReadFeedSnapshotFromCache.mockResolvedValue(null);
    mockedWriteFeedSnapshotToCache.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (ORIGINAL_IMPORT_PUBLIC_RATE_LIMIT_PER_MIN == null) {
      delete process.env.IMPORT_PUBLIC_RATE_LIMIT_PER_MIN;
    } else {
      process.env.IMPORT_PUBLIC_RATE_LIMIT_PER_MIN =
        ORIGINAL_IMPORT_PUBLIC_RATE_LIMIT_PER_MIN;
    }

    if (ORIGINAL_CRON_SECRET == null) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    }
  });

  it("serves the latest D1 snapshot for normal and refresh requests", async () => {
    const snapshot = buildSnapshot();
    mockedReadLatestFeedSnapshotFromD1.mockResolvedValue(snapshot);
    const request = new Request(
      "https://rolelens.pages.dev/api/jobs/import?refresh=1",
      {
        method: "GET",
      },
    );

    const response = await GET(request);
    const payload = (await response.json()) as {
      cached: boolean;
      cacheSource: string;
      platform: string;
      jobs: unknown[];
    };

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(true);
    expect(payload.cacheSource).toBe("d1");
    expect(payload.platform).toBe("all");
    expect(payload.jobs).toHaveLength(2);
    expect(mockedReadFeedSnapshotFromCache).not.toHaveBeenCalled();
    expect(mockedWriteFeedSnapshotToCache).toHaveBeenCalledWith(request, snapshot);
  });

  it("serves edge cache only when D1 has no snapshot", async () => {
    mockedReadFeedSnapshotFromCache.mockResolvedValue(buildSnapshot());
    const request = new Request("https://rolelens.pages.dev/api/jobs/import", {
      method: "GET",
    });

    const response = await GET(request);
    const payload = (await response.json()) as {
      cached: boolean;
      cacheSource: string;
      platform: string;
    };

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(true);
    expect(payload.cacheSource).toBe("edge");
    expect(payload.platform).toBe("all");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=15, s-maxage=60, stale-while-revalidate=60",
    );
  });

  it("filters platform-scoped imports from the D1 snapshot", async () => {
    mockedReadLatestFeedSnapshotFromD1.mockResolvedValue(buildSnapshot());
    const request = new Request(
      "https://rolelens.pages.dev/api/jobs/import?platform=indeed",
      {
        method: "GET",
      },
    );

    const response = await GET(request);
    const payload = (await response.json()) as {
      cached: boolean;
      platform: string;
      jobs: Array<{ source: string }>;
      importedSourceCount: number;
    };

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(true);
    expect(payload.platform).toBe("indeed");
    expect(payload.jobs).toHaveLength(1);
    expect(payload.jobs[0]?.source).toBe("INDEED");
    expect(payload.importedSourceCount).toBe(1);
    expect(mockedReadFeedSnapshotFromCache).not.toHaveBeenCalled();
    expect(mockedWriteFeedSnapshotToCache).not.toHaveBeenCalled();
  });

  it("returns a configuration snapshot when D1 and edge cache are empty", async () => {
    const request = new Request(
      "https://rolelens.pages.dev/api/jobs/import?refresh=1",
      {
        method: "GET",
      },
    );

    const response = await GET(request);
    const payload = (await response.json()) as {
      cached: boolean;
      sourceCount: number;
      errors: Array<{ source: string; message: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(false);
    expect(payload.sourceCount).toBe(0);
    expect(payload.errors[0]?.source).toBe("d1");
    expect(payload.errors[0]?.message).toContain("No D1-ingested");
  });

  it("rate-limits anonymous callers", async () => {
    process.env.IMPORT_PUBLIC_RATE_LIMIT_PER_MIN = "1";

    const request = () =>
      new Request("https://rolelens.pages.dev/api/jobs/import", {
        method: "GET",
        headers: {
          "x-forwarded-for": "203.0.113.77",
        },
      });

    const first = await GET(request());
    const second = await GET(request());
    const secondPayload = (await second.json()) as {
      ok: boolean;
      message: string;
    };

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(secondPayload.ok).toBe(false);
    expect(secondPayload.message).toContain("Rate limit exceeded");
    expect(mockedReadLatestFeedSnapshotFromD1).toHaveBeenCalledTimes(1);
  });
});
