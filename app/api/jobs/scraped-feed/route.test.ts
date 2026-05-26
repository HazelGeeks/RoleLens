import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/scraped-feed-store", () => ({
  readLatestScrapedFeedSnapshot: vi.fn(),
  saveScrapedFeedSnapshot: vi.fn(),
}));

import {
  readLatestScrapedFeedSnapshot,
  saveScrapedFeedSnapshot,
} from "@/lib/scraped-feed-store";
import { GET, POST } from "./route";

const mockedReadLatestScrapedFeedSnapshot = vi.mocked(readLatestScrapedFeedSnapshot);
const mockedSaveScrapedFeedSnapshot = vi.mocked(saveScrapedFeedSnapshot);

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_SYNC_ADMIN_SECRET = process.env.SYNC_ADMIN_SECRET;

describe("/api/jobs/scraped-feed route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    delete process.env.SYNC_ADMIN_SECRET;
    mockedReadLatestScrapedFeedSnapshot.mockResolvedValue(null);
    mockedSaveScrapedFeedSnapshot.mockResolvedValue({
      snapshotId: "snapshot-1",
      importedAt: "2026-05-26T10:00:00.000Z",
      generatedAt: "2026-05-26T09:58:00.000Z",
      sourceCount: 1,
      jobCount: 292,
    });
  });

  afterAll(() => {
    if (ORIGINAL_CRON_SECRET == null) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    }

    if (ORIGINAL_SYNC_ADMIN_SECRET == null) {
      delete process.env.SYNC_ADMIN_SECRET;
    } else {
      process.env.SYNC_ADMIN_SECRET = ORIGINAL_SYNC_ADMIN_SECRET;
    }
  });

  it("rejects unauthorized GET requests", async () => {
    const response = await GET(
      new Request("https://rolelens.pages.dev/api/jobs/scraped-feed"),
    );
    const payload = (await response.json()) as {
      ok: boolean;
      message: string;
    };

    expect(response.status).toBe(401);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Unauthorized");
    expect(mockedReadLatestScrapedFeedSnapshot).not.toHaveBeenCalled();
  });

  it("returns hasSnapshot=false when no snapshot exists", async () => {
    const response = await GET(
      new Request("https://rolelens.pages.dev/api/jobs/scraped-feed", {
        headers: {
          "x-cron-secret": "test-cron-secret",
        },
      }),
    );
    const payload = (await response.json()) as {
      ok: boolean;
      hasSnapshot: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.hasSnapshot).toBe(false);
  });

  it("returns snapshot metadata for authorized GET", async () => {
    mockedReadLatestScrapedFeedSnapshot.mockResolvedValue({
      snapshotId: "snapshot-1",
      importedAt: "2026-05-26T10:00:00.000Z",
      generatedAt: "2026-05-26T09:58:00.000Z",
      sourceCount: 1,
      jobs: [{ id: "1" }],
      sourceResults: [{ source: "PythonScraper", ok: true, importedJobs: 1 }],
      errors: [],
    });

    const response = await GET(
      new Request("https://rolelens.pages.dev/api/jobs/scraped-feed", {
        headers: {
          "x-cron-secret": "test-cron-secret",
        },
      }),
    );
    const payload = (await response.json()) as {
      ok: boolean;
      hasSnapshot: boolean;
      jobCount: number;
      sourceCount: number;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.hasSnapshot).toBe(true);
    expect(payload.jobCount).toBe(1);
    expect(payload.sourceCount).toBe(1);
  });

  it("stores uploaded payload for authorized POST", async () => {
    const requestPayload = {
      generatedAt: "2026-05-26T09:58:00.000Z",
      jobs: [{ externalId: "py:1" }],
      sourceResults: [{ source: "PythonScraper", ok: true, importedJobs: 1 }],
      errors: [],
      sourceCount: 1,
    };

    const response = await POST(
      new Request("https://rolelens.pages.dev/api/jobs/scraped-feed", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cron-secret": "test-cron-secret",
        },
        body: JSON.stringify(requestPayload),
      }),
    );
    const payload = (await response.json()) as {
      ok: boolean;
      snapshotId: string;
      jobCount: number;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.snapshotId).toBe("snapshot-1");
    expect(payload.jobCount).toBe(292);
    expect(mockedSaveScrapedFeedSnapshot).toHaveBeenCalledWith(
      requestPayload,
      process.env,
    );
  });
});
