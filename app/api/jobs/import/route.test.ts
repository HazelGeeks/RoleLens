import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/feed-import", () => ({
  collectFeedJobs: vi.fn(),
  readFeedSnapshotFromCache: vi.fn(),
  writeFeedSnapshotToCache: vi.fn(),
}));

vi.mock("@/lib/scraped-feed-crawler", () => ({
  crawlAndSaveScrapedFeedSnapshot: vi.fn(),
}));

import {
  collectFeedJobs,
  readFeedSnapshotFromCache,
  writeFeedSnapshotToCache,
} from "@/lib/feed-import";
import { crawlAndSaveScrapedFeedSnapshot } from "@/lib/scraped-feed-crawler";
import { GET } from "./route";

const mockedCollectFeedJobs = vi.mocked(collectFeedJobs);
const mockedReadFeedSnapshotFromCache = vi.mocked(readFeedSnapshotFromCache);
const mockedWriteFeedSnapshotToCache = vi.mocked(writeFeedSnapshotToCache);
const mockedCrawlAndSaveScrapedFeedSnapshot = vi.mocked(
  crawlAndSaveScrapedFeedSnapshot,
);

const ORIGINAL_ALLOW_PUBLIC_FEED_REFRESH = process.env.ALLOW_PUBLIC_FEED_REFRESH;
const ORIGINAL_IMPORT_PUBLIC_RATE_LIMIT_PER_MIN =
  process.env.IMPORT_PUBLIC_RATE_LIMIT_PER_MIN;
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_PYTHON_SCRAPED_FEED_BACKEND =
  process.env.PYTHON_SCRAPED_FEED_BACKEND;

describe("/api/jobs/import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ALLOW_PUBLIC_FEED_REFRESH = "1";
    process.env.IMPORT_PUBLIC_RATE_LIMIT_PER_MIN = "60";
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.PYTHON_SCRAPED_FEED_BACKEND = "d1";
    mockedReadFeedSnapshotFromCache.mockResolvedValue(null);
    mockedWriteFeedSnapshotToCache.mockResolvedValue(undefined);
    mockedCrawlAndSaveScrapedFeedSnapshot.mockResolvedValue({
      snapshot: {
        generatedAt: "2026-04-13T00:00:00.000Z",
        platform: "all",
        sourceCount: 1,
        jobs: [],
        errors: [],
        sourceResults: [],
      },
      saved: {
        snapshotId: "snapshot-1",
        importedAt: "2026-04-13T00:00:01.000Z",
        generatedAt: "2026-04-13T00:00:00.000Z",
        sourceCount: 1,
        jobCount: 0,
      },
    });
    mockedCollectFeedJobs.mockResolvedValue({
      generatedAt: "2026-04-13T00:00:00.000Z",
      sourceCount: 0,
      jobs: [],
      errors: [
        {
          source: "configuration",
          message: "No sources configured",
        },
      ],
      sourceResults: [],
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
          scrapedFeedConfigured: false,
          configuredSourceCount: 0,
        },
        sourceCount: 0,
      },
      recoveryGuide: ["Set env vars and retry"],
    });
  });

  afterAll(() => {
    if (ORIGINAL_ALLOW_PUBLIC_FEED_REFRESH == null) {
      delete process.env.ALLOW_PUBLIC_FEED_REFRESH;
    } else {
      process.env.ALLOW_PUBLIC_FEED_REFRESH = ORIGINAL_ALLOW_PUBLIC_FEED_REFRESH;
    }

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

    if (ORIGINAL_PYTHON_SCRAPED_FEED_BACKEND == null) {
      delete process.env.PYTHON_SCRAPED_FEED_BACKEND;
    } else {
      process.env.PYTHON_SCRAPED_FEED_BACKEND =
        ORIGINAL_PYTHON_SCRAPED_FEED_BACKEND;
    }
  });

  it("includes diagnostics fields in refresh response", async () => {
    const request = new Request(
      "https://rolelens.pages.dev/api/jobs/import?refresh=1",
      {
        method: "GET",
      },
    );

    const response = await GET(request);
    const payload = (await response.json()) as {
      diagnostics: {
        sourceCount: number;
      };
      recoveryGuide: string[];
      cached: boolean;
      platform: string;
    };

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(false);
    expect(payload.platform).toBe("all");
    expect(payload.diagnostics.sourceCount).toBe(0);
    expect(payload.recoveryGuide.length).toBeGreaterThan(0);
    expect(mockedCollectFeedJobs).toHaveBeenCalledWith(process.env, {
      requestUrl: request.url,
      platform: "all",
    });
  });

  it("supports platform-scoped imports without using snapshot cache", async () => {
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
    };

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(false);
    expect(payload.platform).toBe("indeed");
    expect(mockedReadFeedSnapshotFromCache).not.toHaveBeenCalled();
    expect(mockedWriteFeedSnapshotToCache).not.toHaveBeenCalled();
    expect(mockedCollectFeedJobs).toHaveBeenCalledWith(process.env, {
      requestUrl: request.url,
      platform: "indeed",
    });
  });

  it("rejects manual refresh when public refresh is disabled", async () => {
    delete process.env.ALLOW_PUBLIC_FEED_REFRESH;

    const request = new Request(
      "https://rolelens.pages.dev/api/jobs/import?refresh=1",
      {
        method: "GET",
      },
    );

    const response = await GET(request);
    const payload = (await response.json()) as {
      ok: boolean;
      message: string;
    };

    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.message).toContain("Manual feed refresh is disabled");
    expect(mockedCollectFeedJobs).not.toHaveBeenCalled();
  });

  it("allows manual refresh when sync secret is provided", async () => {
    delete process.env.ALLOW_PUBLIC_FEED_REFRESH;

    const request = new Request(
      "https://rolelens.pages.dev/api/jobs/import?refresh=1",
      {
        method: "GET",
        headers: {
          "x-cron-secret": "test-cron-secret",
        },
      },
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockedCollectFeedJobs).toHaveBeenCalledTimes(1);
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
    expect(mockedCollectFeedJobs).toHaveBeenCalledTimes(1);
  });

  it("auto-bootstraps d1 snapshot when refresh hits missing snapshot error", async () => {
    mockedCollectFeedJobs
      .mockResolvedValueOnce({
        generatedAt: "2026-04-13T00:00:00.000Z",
        sourceCount: 1,
        jobs: [],
        errors: [
          {
            source: "Python Scraper",
            message:
              "D1 scraped feed snapshot is missing. Trigger /api/jobs/scraped-feed/sync or /api/jobs/cron first.",
          },
        ],
        sourceResults: [
          {
            source: "Python Scraper",
            ok: false,
            importedJobs: 0,
            message:
              "D1 scraped feed snapshot is missing. Trigger /api/jobs/scraped-feed/sync or /api/jobs/cron first.",
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
          sourceCount: 1,
        },
        recoveryGuide: ["retry"],
      })
      .mockResolvedValueOnce({
        generatedAt: "2026-04-13T00:00:02.000Z",
        sourceCount: 1,
        jobs: [
          {
            externalId: "py:test:1",
            source: "MANUAL",
            sourceLabel: "Python Scraper",
            company: "Sample",
            title: "Frontend Engineer",
            descriptionRaw: "Sample",
            extractedSkills: [],
            tags: ["python-scraper"],
          },
        ],
        errors: [],
        sourceResults: [
          {
            source: "Python Scraper",
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
          sourceCount: 1,
        },
        recoveryGuide: ["retry"],
      });

    const request = new Request("http://localhost:3000/api/jobs/import?refresh=1", {
      method: "GET",
    });

    const response = await GET(request);
    const payload = (await response.json()) as {
      autoBootstrapped: boolean;
      errors: Array<{ source: string; message: string }>;
      jobs: unknown[];
    };

    expect(response.status).toBe(200);
    expect(payload.autoBootstrapped).toBe(true);
    expect(payload.errors).toHaveLength(0);
    expect(payload.jobs).toHaveLength(1);
    expect(mockedCrawlAndSaveScrapedFeedSnapshot).toHaveBeenCalledTimes(1);
    expect(mockedCollectFeedJobs).toHaveBeenCalledTimes(2);
  });
});
