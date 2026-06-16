import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedImportSnapshot } from "@/lib/feed-types";

vi.mock("@/lib/feed-snapshot-cache", () => ({
  writeFeedSnapshotToCache: vi.fn(),
}));

vi.mock("@/lib/feed-snapshot-store", () => ({
  readLatestFeedSnapshotFromD1: vi.fn(),
  writeLatestFeedSnapshotToD1: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
  getAuthSessionUserFromRequest: vi.fn(),
}));

import { getAuthSessionUserFromRequest } from "@/lib/auth-server";
import { writeFeedSnapshotToCache } from "@/lib/feed-snapshot-cache";
import {
  readLatestFeedSnapshotFromD1,
  writeLatestFeedSnapshotToD1,
} from "@/lib/feed-snapshot-store";
import { POST } from "./route";

const mockedWriteFeedSnapshotToCache = vi.mocked(writeFeedSnapshotToCache);
const mockedReadLatestFeedSnapshotFromD1 = vi.mocked(readLatestFeedSnapshotFromD1);
const mockedWriteLatestFeedSnapshotToD1 = vi.mocked(writeLatestFeedSnapshotToD1);
const mockedGetAuthSessionUserFromRequest = vi.mocked(getAuthSessionUserFromRequest);

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_SYNC_ADMIN_EMAIL = process.env.SYNC_ADMIN_EMAIL;
const ORIGINAL_SYNC_ADMIN_EMAILS = process.env.SYNC_ADMIN_EMAILS;
const ORIGINAL_PYTHON_SCRAPED_FEED_URL = process.env.PYTHON_SCRAPED_FEED_URL;

function buildSnapshot(): FeedImportSnapshot {
  return {
    generatedAt: "2026-06-01T00:00:00.000Z",
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
      { source: "PythonScraper:Indeed", ok: true, importedJobs: 1 },
      { source: "PythonScraper:LinkedIn", ok: true, importedJobs: 1 },
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

describe("/api/jobs/sync route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    delete process.env.SYNC_ADMIN_EMAIL;
    process.env.SYNC_ADMIN_EMAILS = "admin@example.com";
    delete process.env.PYTHON_SCRAPED_FEED_URL;
    mockedGetAuthSessionUserFromRequest.mockResolvedValue(null);
    mockedReadLatestFeedSnapshotFromD1.mockResolvedValue(buildSnapshot());
    mockedWriteLatestFeedSnapshotToD1.mockResolvedValue(true);
    mockedWriteFeedSnapshotToCache.mockResolvedValue(undefined);
    vi.unstubAllGlobals();
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

    if (ORIGINAL_PYTHON_SCRAPED_FEED_URL == null) {
      delete process.env.PYTHON_SCRAPED_FEED_URL;
    } else {
      process.env.PYTHON_SCRAPED_FEED_URL = ORIGINAL_PYTHON_SCRAPED_FEED_URL;
    }
  });

  it("requires authenticated session in non-local production requests", async () => {
    const request = new Request("https://rolelens.pages.dev/api/jobs/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "all" }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(401);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Login required");
    expect(mockedReadLatestFeedSnapshotFromD1).not.toHaveBeenCalled();
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
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "all" }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Admin access required to sync feeds");
    expect(mockedReadLatestFeedSnapshotFromD1).not.toHaveBeenCalled();
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
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "all" }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Sync admin emails are not configured");
    expect(mockedReadLatestFeedSnapshotFromD1).not.toHaveBeenCalled();
  });

  it("syncs from the latest D1 snapshot for authenticated admins", async () => {
    const snapshot = buildSnapshot();
    mockedReadLatestFeedSnapshotFromD1.mockResolvedValue(snapshot);
    mockedGetAuthSessionUserFromRequest.mockResolvedValue({
      id: "user-1",
      email: "ADMIN@example.com",
      name: "Admin User",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const request = new Request("https://rolelens.pages.dev/api/jobs/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "all" }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      cached: boolean;
      platform: string;
      requestId: string;
      latencyMs: number;
      jobs: unknown[];
    };

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(false);
    expect(payload.platform).toBe("all");
    expect(payload.jobs).toHaveLength(2);
    expect(typeof payload.requestId).toBe("string");
    expect(typeof payload.latencyMs).toBe("number");
    expect(mockedReadLatestFeedSnapshotFromD1).toHaveBeenCalledTimes(1);
    expect(mockedWriteLatestFeedSnapshotToD1).not.toHaveBeenCalled();
    expect(mockedWriteFeedSnapshotToCache).toHaveBeenCalledWith(request, snapshot);
  });

  it("refreshes D1 from the configured scraped feed before returning sync results", async () => {
    const snapshot = buildSnapshot();
    process.env.PYTHON_SCRAPED_FEED_URL =
      "https://feeds.example.com/rolelens/latest.json";
    mockedGetAuthSessionUserFromRequest.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      name: "Admin User",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(snapshot),
      }),
    );

    const request = new Request("https://rolelens.pages.dev/api/jobs/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "all" }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      refreshed: boolean;
      jobs: unknown[];
    };

    expect(response.status).toBe(200);
    expect(payload.refreshed).toBe(true);
    expect(payload.jobs).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith(
      "https://feeds.example.com/rolelens/latest.json",
      {
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      },
    );
    expect(mockedWriteLatestFeedSnapshotToD1).toHaveBeenCalledWith(snapshot);
    expect(mockedReadLatestFeedSnapshotFromD1).not.toHaveBeenCalled();
    expect(mockedWriteFeedSnapshotToCache).toHaveBeenCalledWith(request, snapshot);
  });

  it("returns a refresh error when the configured scraped feed cannot be loaded", async () => {
    process.env.PYTHON_SCRAPED_FEED_URL =
      "https://feeds.example.com/rolelens/latest.json";
    mockedGetAuthSessionUserFromRequest.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      name: "Admin User",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );

    const request = new Request("https://rolelens.pages.dev/api/jobs/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "all" }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      ok: boolean;
      message: string;
    };

    expect(response.status).toBe(502);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Feed refresh failed: feed source returned 503");
    expect(mockedWriteLatestFeedSnapshotToD1).not.toHaveBeenCalled();
    expect(mockedReadLatestFeedSnapshotFromD1).not.toHaveBeenCalled();
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
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "all" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockedReadLatestFeedSnapshotFromD1).toHaveBeenCalledTimes(1);
  });

  it("supports platform-scoped sync from D1 without cache writes", async () => {
    mockedGetAuthSessionUserFromRequest.mockResolvedValue({
      id: "user-2",
      email: "admin@example.com",
      name: "Admin User",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const request = new Request("https://rolelens.pages.dev/api/jobs/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "indeed" }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      cached: boolean;
      platform: string;
      jobs: Array<{ source: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(false);
    expect(payload.platform).toBe("indeed");
    expect(payload.jobs).toHaveLength(1);
    expect(payload.jobs[0]?.source).toBe("INDEED");
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
    expect(mockedReadLatestFeedSnapshotFromD1).toHaveBeenCalledTimes(1);
  });
});
