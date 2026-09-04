import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedImportSnapshot } from "@/lib/feed-types";

vi.mock("@/lib/feed-snapshot-cache", () => ({
  writeFeedSnapshotToCache: vi.fn(),
}));

vi.mock("@/lib/feed-snapshot-store", () => ({
  readLatestFeedSnapshot: vi.fn(),
}));

import { writeFeedSnapshotToCache } from "@/lib/feed-snapshot-cache";
import { readLatestFeedSnapshot } from "@/lib/feed-snapshot-store";
import { GET, POST } from "./route";

const mockedWriteFeedSnapshotToCache = vi.mocked(writeFeedSnapshotToCache);
const mockedReadLatestFeedSnapshot = vi.mocked(readLatestFeedSnapshot);

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

function buildSnapshot(): FeedImportSnapshot {
  return {
    generatedAt: "2026-04-13T00:00:00.000Z",
    sourceCount: 2,
    importedSourceCount: 1,
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
        scrapedFeedConfigured: true,
        configuredSourceCount: 1,
      },
      sourceCount: 2,
    },
    recoveryGuide: ["retry"],
  };
}

describe("/api/jobs/cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    mockedReadLatestFeedSnapshot.mockResolvedValue(buildSnapshot());
    mockedWriteFeedSnapshotToCache.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (ORIGINAL_CRON_SECRET == null) {
      delete process.env.CRON_SECRET;
      return;
    }

    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  it("accepts authenticated POST and warms cache from Supabase Postgres", async () => {
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
      cacheSource: string;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.importedJobs).toBe(0);
    expect(payload.sourceCount).toBe(2);
    expect(payload.cacheSource).toBe("postgres");
    expect(mockedReadLatestFeedSnapshot).toHaveBeenCalledTimes(1);
    expect(mockedWriteFeedSnapshotToCache).toHaveBeenCalledTimes(1);
  });

  it("returns a missing-database result when no ingested snapshot exists", async () => {
    mockedReadLatestFeedSnapshot.mockResolvedValue(null);
    const request = new Request("https://rolelens.pages.dev/api/jobs/cron", {
      method: "POST",
      headers: {
        "x-cron-secret": "test-cron-secret",
      },
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      ok: boolean;
      sourceCount: number;
      cacheSource: string;
      errors: Array<{ source: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.sourceCount).toBe(0);
    expect(payload.cacheSource).toBe("none");
    expect(payload.errors[0]?.source).toBe("postgres");
    expect(mockedWriteFeedSnapshotToCache).not.toHaveBeenCalled();
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
    expect(mockedReadLatestFeedSnapshot).toHaveBeenCalledTimes(0);
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
