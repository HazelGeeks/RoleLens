import { beforeEach, describe, expect, it, vi } from "vitest";
import type { D1DatabaseLike } from "@/lib/d1";
import type { FeedImportSnapshot } from "@/lib/feed-types";

vi.mock("@/lib/auth-server", () => ({
  getAuthSessionUserFromRequest: vi.fn(),
}));

vi.mock("@/lib/d1", () => ({
  getD1DatabaseFromContext: vi.fn(),
}));

vi.mock("@/lib/feed-snapshot-store", () => ({
  readLatestFeedSnapshotFromD1: vi.fn(),
}));

import { getAuthSessionUserFromRequest } from "@/lib/auth-server";
import { getD1DatabaseFromContext } from "@/lib/d1";
import { readLatestFeedSnapshotFromD1 } from "@/lib/feed-snapshot-store";
import { GET } from "./route";

const mockedGetAuthSessionUserFromRequest = vi.mocked(getAuthSessionUserFromRequest);
const mockedGetD1DatabaseFromContext = vi.mocked(getD1DatabaseFromContext);
const mockedReadLatestFeedSnapshotFromD1 = vi.mocked(readLatestFeedSnapshotFromD1);

function buildSnapshot(): FeedImportSnapshot {
  return {
    generatedAt: "2026-06-01T00:00:00.000Z",
    sourceCount: 2,
    importedSourceCount: 2,
    jobs: [
      {
        externalId: "job-1",
        source: "INDEED",
        sourceLabel: "Indeed",
        company: "Acme",
        title: "Frontend Engineer",
        descriptionRaw: "React",
        extractedSkills: ["React"],
        tags: [],
      },
    ],
    errors: [],
    sourceResults: [
      {
        source: "Indeed",
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
    recoveryGuide: [],
  };
}

function buildMockD1(): D1DatabaseLike {
  const firstResults = new Map<string, { count: number }>([
    ["auth_users", { count: 3 }],
    ["auth_sessions", { count: 2 }],
    ["persistent_jobs", { count: 7 }],
    ["DISTINCT user_id", { count: 2 }],
    ["persistent_goals", { count: 4 }],
  ]);

  return {
    prepare(query: string) {
      return {
        bind() {
          return this;
        },
        async run() {
          return { meta: { changes: 0 } };
        },
        async first<T>() {
          const match = [...firstResults.entries()].find(([key]) =>
            query.includes(key),
          );
          return (match?.[1] ?? { count: 0 }) as T;
        },
        async all<T>() {
          if (query.includes("GROUP BY status")) {
            return {
              results: [
                { status: "SAVE", count: 5 },
                { status: "SUBMITTED", count: 2 },
              ] as T[],
            };
          }

          return {
            results: [
              {
                id: "job-1",
                company: "Acme",
                title: "Frontend Engineer",
                status: "SAVE",
                updatedAt: "2026-06-02T00:00:00.000Z",
              },
            ] as T[],
          };
        },
      };
    },
  };
}

describe("/api/admin/summary route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAILS = "admin@example.com";
    delete process.env.ROLELENS_ADMIN_EMAILS;
    delete process.env.SYNC_ADMIN_EMAILS;
    delete process.env.SYNC_ADMIN_EMAIL;
    mockedReadLatestFeedSnapshotFromD1.mockResolvedValue(buildSnapshot());
    mockedGetD1DatabaseFromContext.mockResolvedValue(buildMockD1());
  });

  it("requires a logged-in session", async () => {
    mockedGetAuthSessionUserFromRequest.mockResolvedValue(null);

    const response = await GET(new Request("https://rolelens.pages.dev/api/admin/summary"));
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(401);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Login required");
    expect(mockedGetD1DatabaseFromContext).not.toHaveBeenCalled();
  });

  it("rejects signed-in non-admin users", async () => {
    mockedGetAuthSessionUserFromRequest.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const response = await GET(new Request("https://rolelens.pages.dev/api/admin/summary"));
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Admin access required");
    expect(mockedGetD1DatabaseFromContext).not.toHaveBeenCalled();
  });

  it("returns operations summary for configured admins", async () => {
    mockedGetAuthSessionUserFromRequest.mockResolvedValue({
      id: "admin-1",
      email: "ADMIN@example.com",
      name: "Admin",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const response = await GET(new Request("https://rolelens.pages.dev/api/admin/summary"));
    const payload = (await response.json()) as {
      ok: boolean;
      auth: { userCount: number };
      feed: { jobCount: number };
      jobs: { totalCount: number; statusCounts: Array<{ status: string }> };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.auth.userCount).toBe(3);
    expect(payload.feed.jobCount).toBe(1);
    expect(payload.jobs.totalCount).toBe(7);
    expect(payload.jobs.statusCounts[0]).toMatchObject({ status: "SAVE" });
  });
});
