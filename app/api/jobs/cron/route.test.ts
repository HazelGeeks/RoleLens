import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/feed-import", () => ({
  collectFeedJobs: vi.fn(),
  writeFeedSnapshotToCache: vi.fn(),
}));

import { collectFeedJobs, writeFeedSnapshotToCache } from "@/lib/feed-import";
import { GET, POST } from "./route";

const mockedCollectFeedJobs = vi.mocked(collectFeedJobs);
const mockedWriteFeedSnapshotToCache = vi.mocked(writeFeedSnapshotToCache);

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

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
          configuredSourceCount: 0,
        },
        rss: {
          linkedinConfigured: false,
          indeedConfigured: false,
          thirdConfigured: false,
          configuredSourceCount: 0,
        },
        sourceCount: 2,
      },
      recoveryGuide: ["Set env vars and retry"],
    });
    mockedWriteFeedSnapshotToCache.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (ORIGINAL_CRON_SECRET == null) {
      delete process.env.CRON_SECRET;
      return;
    }

    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
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
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.importedJobs).toBe(0);
    expect(payload.sourceCount).toBe(2);
    expect(mockedCollectFeedJobs).toHaveBeenCalledTimes(1);
    expect(mockedWriteFeedSnapshotToCache).toHaveBeenCalledTimes(1);
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
