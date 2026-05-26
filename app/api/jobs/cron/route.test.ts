import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/feed-import", () => ({
  collectFeedJobs: vi.fn(),
  writeFeedSnapshotToCache: vi.fn(),
}));

vi.mock("@/lib/scraped-feed-crawler", () => ({
  crawlAndSaveScrapedFeedSnapshot: vi.fn(),
}));

import { collectFeedJobs, writeFeedSnapshotToCache } from "@/lib/feed-import";
import { crawlAndSaveScrapedFeedSnapshot } from "@/lib/scraped-feed-crawler";
import { GET, POST } from "./route";

const mockedCollectFeedJobs = vi.mocked(collectFeedJobs);
const mockedWriteFeedSnapshotToCache = vi.mocked(writeFeedSnapshotToCache);
const mockedCrawlAndSaveScrapedFeedSnapshot = vi.mocked(
  crawlAndSaveScrapedFeedSnapshot,
);

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_PYTHON_SCRAPED_FEED_BACKEND =
  process.env.PYTHON_SCRAPED_FEED_BACKEND;
const ORIGINAL_SCRAPED_FEED_AUTO_CRAWL = process.env.SCRAPED_FEED_AUTO_CRAWL;

describe("/api/jobs/cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    mockedCollectFeedJobs.mockResolvedValue({
      generatedAt: "2026-04-13T00:00:00.000Z",
      sourceCount: 2,
      jobs: [],
      errors: [],
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
        sourceCount: 2,
      },
      recoveryGuide: ["Set env vars and retry"],
    });
    mockedWriteFeedSnapshotToCache.mockResolvedValue(undefined);
    mockedCrawlAndSaveScrapedFeedSnapshot.mockResolvedValue({
      snapshot: {
        generatedAt: "2026-04-13T00:00:00.000Z",
        platform: "all",
        sourceCount: 1,
        jobs: [
          {
            externalId: "py:test:1",
          },
        ],
        sourceResults: [
          {
            source: "PythonScraper:test",
            ok: true,
            importedJobs: 1,
          },
        ],
        errors: [],
      },
      saved: {
        snapshotId: "snapshot-1",
        importedAt: "2026-04-13T00:00:00.000Z",
        generatedAt: "2026-04-13T00:00:00.000Z",
        sourceCount: 1,
        jobCount: 1,
      },
    });

    process.env.PYTHON_SCRAPED_FEED_BACKEND = "d1";
    process.env.SCRAPED_FEED_AUTO_CRAWL = "1";
  });

  afterAll(() => {
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

    if (ORIGINAL_SCRAPED_FEED_AUTO_CRAWL == null) {
      delete process.env.SCRAPED_FEED_AUTO_CRAWL;
    } else {
      process.env.SCRAPED_FEED_AUTO_CRAWL = ORIGINAL_SCRAPED_FEED_AUTO_CRAWL;
    }
  });

  it("accepts authenticated POST and refreshes snapshot", async () => {
    const request = new Request("https://rolelens.pages.dev/api/jobs/cron", {
      method: "POST",
      headers: {
        "x-cron-secret": "test-cron-secret",
      },
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      ok: boolean;
      importedJobs: number;
      sourceCount: number;
      scrape?: {
        ok: boolean;
        jobCount: number;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.importedJobs).toBe(0);
    expect(payload.sourceCount).toBe(2);
    expect(payload.scrape?.ok).toBe(true);
    expect(payload.scrape?.jobCount).toBe(1);
    expect(mockedCrawlAndSaveScrapedFeedSnapshot).toHaveBeenCalledTimes(1);
    expect(mockedCollectFeedJobs).toHaveBeenCalledTimes(1);
    expect(mockedWriteFeedSnapshotToCache).toHaveBeenCalledTimes(1);
  });

  it("skips crawler run when scrape=0 is provided", async () => {
    const request = new Request(
      "https://rolelens.pages.dev/api/jobs/cron?scrape=0",
      {
        method: "POST",
        headers: {
          "x-cron-secret": "test-cron-secret",
        },
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockedCrawlAndSaveScrapedFeedSnapshot).toHaveBeenCalledTimes(0);
    expect(mockedCollectFeedJobs).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthenticated POST with 401", async () => {
    const request = new Request("https://rolelens.pages.dev/api/jobs/cron", {
      method: "POST",
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      ok: boolean;
      message: string;
    };

    expect(response.status).toBe(401);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Unauthorized");
    expect(mockedCollectFeedJobs).toHaveBeenCalledTimes(0);
  });

  it("rejects GET requests with 405", async () => {
    const response = await GET();
    const payload = (await response.json()) as {
      ok: boolean;
      message: string;
    };

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Method Not Allowed");
  });
});
