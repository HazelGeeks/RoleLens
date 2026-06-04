import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/feed-import", () => ({
  collectFeedJobs: vi.fn(),
  writeFeedSnapshotToCache: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
  getAuthSessionUserFromRequest: vi.fn(),
}));

import { getAuthSessionUserFromRequest } from "@/lib/auth-server";
import { collectFeedJobs, writeFeedSnapshotToCache } from "@/lib/feed-import";
import { POST } from "./route";

const mockedCollectFeedJobs = vi.mocked(collectFeedJobs);
const mockedWriteFeedSnapshotToCache = vi.mocked(writeFeedSnapshotToCache);
const mockedGetAuthSessionUserFromRequest = vi.mocked(getAuthSessionUserFromRequest);

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_SYNC_ADMIN_EMAIL = process.env.SYNC_ADMIN_EMAIL;
const ORIGINAL_SYNC_ADMIN_EMAILS = process.env.SYNC_ADMIN_EMAILS;

describe("/api/jobs/sync route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    delete process.env.SYNC_ADMIN_EMAIL;
    process.env.SYNC_ADMIN_EMAILS = "admin@example.com";
    mockedGetAuthSessionUserFromRequest.mockResolvedValue(null);
    mockedCollectFeedJobs.mockResolvedValue({
      generatedAt: "2026-06-01T00:00:00.000Z",
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
    mockedWriteFeedSnapshotToCache.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (ORIGINAL_CRON_SECRET == null) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    }

    if (ORIGINAL_SYNC_ADMIN_EMAILS == null) {
      delete process.env.SYNC_ADMIN_EMAILS;
    } else {
      process.env.SYNC_ADMIN_EMAILS = ORIGINAL_SYNC_ADMIN_EMAILS;
    }

    if (ORIGINAL_SYNC_ADMIN_EMAIL == null) {
      delete process.env.SYNC_ADMIN_EMAIL;
    } else {
      process.env.SYNC_ADMIN_EMAIL = ORIGINAL_SYNC_ADMIN_EMAIL;
    }
  });

  it("requires authenticated session in non-local production requests", async () => {
    const request = new Request("https://rolelens.pages.dev/api/jobs/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ platform: "all" }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(401);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Login required");
    expect(mockedCollectFeedJobs).not.toHaveBeenCalled();
  });

  it("rejects authenticated non-admin sessions", async () => {
    mockedGetAuthSessionUserFromRequest.mockResolvedValue({
      id: "user-1",
      email: "session@example.com",
      name: "Session User",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const request = new Request("https://rolelens.pages.dev/api/jobs/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ platform: "all" }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Admin access required to sync feeds");
    expect(mockedCollectFeedJobs).not.toHaveBeenCalled();
  });

  it("rejects session sync when admin emails are not configured", async () => {
    delete process.env.SYNC_ADMIN_EMAILS;
    mockedGetAuthSessionUserFromRequest.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      name: "Admin User",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const request = new Request("https://rolelens.pages.dev/api/jobs/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ platform: "all" }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Sync admin emails are not configured");
    expect(mockedCollectFeedJobs).not.toHaveBeenCalled();
  });

  it("runs sync for authenticated admin session and refreshes cache for all platform", async () => {
    mockedGetAuthSessionUserFromRequest.mockResolvedValue({
      id: "user-1",
      email: "ADMIN@example.com",
      name: "Admin User",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const request = new Request("https://rolelens.pages.dev/api/jobs/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ platform: "all" }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      cached: boolean;
      platform: string;
      requestId: string;
      latencyMs: number;
    };

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(false);
    expect(payload.platform).toBe("all");
    expect(typeof payload.requestId).toBe("string");
    expect(payload.requestId.length).toBeGreaterThan(0);
    expect(typeof payload.latencyMs).toBe("number");
    expect(mockedCollectFeedJobs).toHaveBeenCalledWith(process.env, {
      requestUrl: request.url,
      platform: "all",
    });
    expect(mockedWriteFeedSnapshotToCache).toHaveBeenCalledTimes(1);
  });

  it("accepts singular sync admin email env for deployed configuration compatibility", async () => {
    delete process.env.SYNC_ADMIN_EMAILS;
    process.env.SYNC_ADMIN_EMAIL = '"admin@example.com"';
    mockedGetAuthSessionUserFromRequest.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      name: "Admin User",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const request = new Request("https://rolelens.pages.dev/api/jobs/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ platform: "all" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockedCollectFeedJobs).toHaveBeenCalledTimes(1);
  });

  it("supports platform-scoped sync without cache writes", async () => {
    mockedGetAuthSessionUserFromRequest.mockResolvedValue({
      id: "user-2",
      email: "admin@example.com",
      name: "Admin User",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const request = new Request("https://rolelens.pages.dev/api/jobs/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ platform: "indeed" }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      cached: boolean;
      platform: string;
    };

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(false);
    expect(payload.platform).toBe("indeed");
    expect(mockedCollectFeedJobs).toHaveBeenCalledWith(process.env, {
      requestUrl: request.url,
      platform: "indeed",
    });
    expect(mockedWriteFeedSnapshotToCache).not.toHaveBeenCalled();
  });

  it("allows sync via cron secret without session cookie", async () => {
    const request = new Request("https://rolelens.pages.dev/api/jobs/sync", {
      method: "POST",
      headers: {
        "x-cron-secret": "test-cron-secret",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockedGetAuthSessionUserFromRequest).not.toHaveBeenCalled();
    expect(mockedCollectFeedJobs).toHaveBeenCalledTimes(1);
  });
});
