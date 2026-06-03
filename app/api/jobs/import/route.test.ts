import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/feed-import", () => ({
  collectFeedJobs: vi.fn(),
  readFeedSnapshotFromCache: vi.fn(),
  writeFeedSnapshotToCache: vi.fn(),
}));

import {
  collectFeedJobs,
  readFeedSnapshotFromCache,
  writeFeedSnapshotToCache,
} from "@/lib/feed-import";
import { GET } from "./route";

const mockedCollectFeedJobs = vi.mocked(collectFeedJobs);
const mockedReadFeedSnapshotFromCache = vi.mocked(readFeedSnapshotFromCache);
const mockedWriteFeedSnapshotToCache = vi.mocked(writeFeedSnapshotToCache);

const ORIGINAL_ALLOW_PUBLIC_FEED_REFRESH = process.env.ALLOW_PUBLIC_FEED_REFRESH;
const ORIGINAL_IMPORT_PUBLIC_RATE_LIMIT_PER_MIN =
  process.env.IMPORT_PUBLIC_RATE_LIMIT_PER_MIN;
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe("/api/jobs/import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ALLOW_PUBLIC_FEED_REFRESH = "1";
    process.env.IMPORT_PUBLIC_RATE_LIMIT_PER_MIN = "60";
    process.env.CRON_SECRET = "test-cron-secret";
    mockedReadFeedSnapshotFromCache.mockResolvedValue(null);
    mockedWriteFeedSnapshotToCache.mockResolvedValue(undefined);
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

  it("serves cached snapshot with shorter stale window", async () => {
    mockedReadFeedSnapshotFromCache.mockResolvedValue({
      generatedAt: "2026-04-13T00:00:00.000Z",
      sourceCount: 1,
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
          scrapedFeedConfigured: false,
          configuredSourceCount: 0,
        },
        sourceCount: 1,
      },
      recoveryGuide: ["retry"],
    });

    const request = new Request("https://rolelens.pages.dev/api/jobs/import", {
      method: "GET",
    });

    const response = await GET(request);
    const payload = (await response.json()) as {
      cached: boolean;
      platform: string;
    };

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(true);
    expect(payload.platform).toBe("all");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=15, s-maxage=60, stale-while-revalidate=60",
    );
    expect(mockedCollectFeedJobs).not.toHaveBeenCalled();
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
});
