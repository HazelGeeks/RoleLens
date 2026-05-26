import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/scraped-feed-crawler", () => ({
  crawlAndSaveScrapedFeedSnapshot: vi.fn(),
}));

import { crawlAndSaveScrapedFeedSnapshot } from "@/lib/scraped-feed-crawler";
import { GET, POST } from "./route";

const mockedCrawlAndSaveScrapedFeedSnapshot = vi.mocked(
  crawlAndSaveScrapedFeedSnapshot,
);

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe("/api/jobs/scraped-feed/sync route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";

    mockedCrawlAndSaveScrapedFeedSnapshot.mockResolvedValue({
      snapshot: {
        generatedAt: "2026-05-26T10:30:00.000Z",
        platform: "all",
        sourceCount: 2,
        jobs: [{ externalId: "py:test:1" }, { externalId: "py:test:2" }],
        sourceResults: [
          {
            source: "PythonScraper:test",
            ok: true,
            importedJobs: 2,
          },
        ],
        errors: [],
      },
      saved: {
        snapshotId: "snapshot-1",
        importedAt: "2026-05-26T10:31:00.000Z",
        generatedAt: "2026-05-26T10:30:00.000Z",
        sourceCount: 2,
        jobCount: 2,
      },
    });
  });

  afterAll(() => {
    if (ORIGINAL_CRON_SECRET == null) {
      delete process.env.CRON_SECRET;
      return;
    }

    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  it("rejects unauthorized POST", async () => {
    const response = await POST(
      new Request("https://rolelens.pages.dev/api/jobs/scraped-feed/sync", {
        method: "POST",
      }),
    );

    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(401);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Unauthorized");
    expect(mockedCrawlAndSaveScrapedFeedSnapshot).not.toHaveBeenCalled();
  });

  it("runs crawler and persists snapshot for authorized POST", async () => {
    const response = await POST(
      new Request(
        "https://rolelens.pages.dev/api/jobs/scraped-feed/sync?platform=linkedin&timeoutSeconds=15&limitPerSource=100&sourceUrl=https://example.com/jobs",
        {
          method: "POST",
          headers: {
            "x-cron-secret": "test-cron-secret",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sourceUrls: ["https://override.example.com/jobs"],
          }),
        },
      ),
    );

    const payload = (await response.json()) as {
      ok: boolean;
      platform: string;
      snapshotId: string;
      sourceCount: number;
      jobCount: number;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.platform).toBe("linkedin");
    expect(payload.snapshotId).toBe("snapshot-1");
    expect(payload.sourceCount).toBe(2);
    expect(payload.jobCount).toBe(2);

    expect(mockedCrawlAndSaveScrapedFeedSnapshot).toHaveBeenCalledTimes(1);
    expect(mockedCrawlAndSaveScrapedFeedSnapshot).toHaveBeenCalledWith(
      {
        platform: "linkedin",
        timeoutSeconds: 15,
        limitPerSource: 100,
        sourceUrls: ["https://override.example.com/jobs"],
      },
      process.env,
    );
  });

  it("rejects invalid json payload", async () => {
    const response = await POST(
      new Request("https://rolelens.pages.dev/api/jobs/scraped-feed/sync", {
        method: "POST",
        headers: {
          "x-cron-secret": "test-cron-secret",
          "content-type": "application/json",
        },
        body: "{invalid}",
      }),
    );

    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Invalid JSON payload");
  });

  it("rejects GET requests", async () => {
    const response = await GET();
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Method Not Allowed");
  });
});
