import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installMockWindow,
  uninstallMockWindow,
} from "@/lib/test-utils/mock-window-storage";

vi.mock("@/lib/local-jobs", () => ({
  getJobsFromStorage: vi.fn(() => []),
  saveJobsToStorage: vi.fn(),
}));

import {
  getJobsFromStorage,
  saveJobsToStorage,
  type LocalJobPosting,
} from "@/lib/local-jobs";
import { getLastFeedSyncSummary, syncJobsFromFeeds } from "@/lib/feed-sync";

const mockedGetJobsFromStorage = vi.mocked(getJobsFromStorage);
const mockedSaveJobsToStorage = vi.mocked(saveJobsToStorage);

beforeEach(() => {
  installMockWindow(
    {},
    {
      dispatchEvent: vi.fn(() => true),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  );
  mockedGetJobsFromStorage.mockReturnValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  uninstallMockWindow();
});

describe("feed sync observability", () => {
  it("returns source-level results and persists last sync summary", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            generatedAt: "2026-04-13T00:00:00.000Z",
            sourceCount: 2,
            importedSourceCount: 5,
            jobs: [
              {
                externalId: "gh:acme:1",
                source: "MANUAL",
                sourceLabel: "Greenhouse",
                company: "Acme",
                title: "Frontend Engineer",
                descriptionRaw: "React TypeScript",
                extractedSkills: ["React", "TypeScript"],
                tags: ["greenhouse"],
              },
            ],
            errors: [
              {
                source: "Lever",
                message: "Timed out",
              },
            ],
            sourceResults: [
              {
                source: "Greenhouse",
                ok: true,
                importedJobs: 1,
              },
              {
                source: "Lever",
                ok: false,
                importedJobs: 0,
                message: "Timed out",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncJobsFromFeeds({ refresh: true, persistToDb: false });

    expect(result.totalImported).toBe(1);
    expect(result.sourceCount).toBe(2);
    expect(result.importedSourceCount).toBe(5);
    expect(result.sourceResults).toEqual([
      {
        source: "Greenhouse",
        ok: true,
        importedJobs: 1,
      },
      {
        source: "Lever",
        ok: false,
        importedJobs: 0,
        message: "Timed out",
      },
    ]);

    const summary = getLastFeedSyncSummary();
    expect(summary).not.toBeNull();
    expect(summary?.sourceCount).toBe(2);
    expect(summary?.importedSourceCount).toBe(5);
    expect(summary?.errors).toHaveLength(1);
    expect(summary?.sourceResults[1]?.source).toBe("Lever");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/jobs/sync",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          platform: "all",
        }),
      }),
    );
  });

  it("keeps imported feed data locally when DB persistence fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "/api/jobs/sync") {
          return new Response(
            JSON.stringify({
              generatedAt: "2026-06-04T00:00:00.000Z",
              sourceCount: 1,
              importedSourceCount: 1,
              jobs: [
                {
                  externalId: "python:acme:1",
                  source: "MANUAL",
                  sourceLabel: "Python Scraper",
                  company: "Acme",
                  title: "Frontend Engineer",
                  descriptionRaw: "React TypeScript role",
                  extractedSkills: ["React", "TypeScript"],
                  tags: ["python"],
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
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        if (url === "/api/jobs") {
          return new Response(
            JSON.stringify({
              ok: false,
              message: "Unauthorized",
            }),
            {
              status: 401,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        throw new Error("Unexpected fetch URL: " + url);
      }),
    );

    const result = await syncJobsFromFeeds({ refresh: true });
    const firstSave = mockedSaveJobsToStorage.mock.calls[0]?.[0] || [];
    const summary = getLastFeedSyncSummary();

    expect(result.totalImported).toBe(1);
    expect(result.errors[0]?.source).toBe("persistence");
    expect(firstSave).toHaveLength(1);
    expect(firstSave[0]?.company).toBe("Acme");
    expect(summary?.errors[0]?.source).toBe("persistence");
  });

  it("falls back to cached import snapshot when active all-feed sync returns 5xx", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/jobs/sync") {
        return new Response(
          JSON.stringify({
            ok: false,
            message: "Service Unavailable",
          }),
          {
            status: 503,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      if (url === "/api/jobs/import") {
        return new Response(
          JSON.stringify({
            generatedAt: "2026-06-04T01:46:56.980Z",
            sourceCount: 1,
            importedSourceCount: 1,
            cached: true,
            jobs: [
              {
                externalId: "python:cached:1",
                source: "MANUAL",
                sourceLabel: "Python Scraper",
                company: "Cached Co",
                title: "Frontend Engineer",
                descriptionRaw: "React TypeScript role",
                extractedSkills: ["React", "TypeScript"],
                tags: ["python"],
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
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      throw new Error("Unexpected fetch URL: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncJobsFromFeeds({
      refresh: true,
      persistToDb: false,
    });
    const savedJobs = mockedSaveJobsToStorage.mock.calls[0]?.[0] || [];

    expect(result.cached).toBe(true);
    expect(result.totalImported).toBe(1);
    expect(savedJobs[0]?.company).toBe("Cached Co");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/jobs/import",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("normalizes legacy diagnostics that are missing python fields", () => {
    window.localStorage.setItem(
      "rolelens.feed.lastSyncResult",
      JSON.stringify({
        syncedAt: "2026-05-11T00:00:00.000Z",
        sourceCount: 1,
        totalImported: 0,
        added: 0,
        updated: 0,
        errors: [],
        sourceResults: [],
        diagnostics: {
          ats: {
            greenhouseBoardCount: 1,
            leverCompanyCount: 0,
            configuredSourceCount: 1,
          },
          rss: {
            linkedinConfigured: false,
            indeedConfigured: false,
            thirdConfigured: false,
            configuredSourceCount: 0,
          },
          sourceCount: 1,
        },
        recoveryGuide: ["retry"],
      }),
    );

    const summary = getLastFeedSyncSummary();
    expect(summary).not.toBeNull();
    expect(summary?.diagnostics.ats.ashbyOrganizationCount).toBe(0);
    expect(summary?.diagnostics.ats.smartRecruitersCompanyCount).toBe(0);
    expect(summary?.diagnostics.python.scrapedFeedConfigured).toBe(false);
    expect(summary?.diagnostics.python.configuredSourceCount).toBe(0);
  });

  it("removes stale legacy imported jobs while retaining manual jobs", async () => {
    const now = "2026-05-10T00:00:00.000Z";
    const legacyImported: LocalJobPosting = {
      id: "legacy-greenhouse-1",
      source: "MANUAL",
      sourceUrl: "https://boards.greenhouse.io/acme/jobs/1",
      company: "Acme",
      title: "Old Greenhouse Posting",
      remoteType: "REMOTE",
      descriptionRaw: "Old imported posting",
      extractedSkills: ["React"],
      fitScore: 70,
      status: "SAVE",
      statusHistory: [
        {
          id: "h-1",
          status: "SAVE",
          changedAt: now,
          note: "Imported from external feed",
        },
      ],
      tags: ["greenhouse"],
      notes: [],
      createdAt: now,
      updatedAt: now,
    };
    const manualJob: LocalJobPosting = {
      id: "manual-1",
      source: "MANUAL",
      company: "Personal",
      title: "Manual Saved Posting",
      remoteType: "UNKNOWN",
      descriptionRaw: "Manual entry",
      extractedSkills: [],
      fitScore: 0,
      status: "SAVE",
      statusHistory: [
        {
          id: "h-2",
          status: "SAVE",
          changedAt: now,
          note: "Saved manually",
        },
      ],
      tags: ["personal"],
      notes: [],
      createdAt: now,
      updatedAt: now,
    };
    mockedGetJobsFromStorage.mockReturnValue([legacyImported, manualJob]);

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              generatedAt: "2026-05-13T00:00:00.000Z",
              sourceCount: 1,
              jobs: [
                {
                  externalId: "py:sample:1",
                  source: "MANUAL",
                  sourceLabel: "PythonScraper:sample",
                  sourceUrl: "https://example.com/jobs/1",
                  company: "Sample Co",
                  title: "Frontend Engineer",
                  descriptionRaw: "React TypeScript role",
                  extractedSkills: ["React", "TypeScript"],
                  tags: ["python-scraper"],
                },
              ],
              errors: [],
              sourceResults: [
                {
                  source: "PythonScraper:sample",
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
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          ),
      ),
    );

    await syncJobsFromFeeds({ refresh: true, persistToDb: false });

    expect(mockedSaveJobsToStorage).toHaveBeenCalledTimes(1);
    const saved = mockedSaveJobsToStorage.mock.calls[0]?.[0] ?? [];
    const savedIds = saved.map((job) => job.id);
    expect(savedIds).toContain("manual-1");
    expect(savedIds).not.toContain("legacy-greenhouse-1");
  });

  it("resets legacy imported SAVE default to NONE when syncing", async () => {
    const now = "2026-05-10T00:00:00.000Z";
    const legacyImported: LocalJobPosting = {
      id: "legacy-import-1",
      source: "MANUAL",
      sourceUrl: "https://example.com/jobs/legacy-import-1",
      company: "Sample Co",
      title: "Frontend Engineer",
      remoteType: "REMOTE",
      descriptionRaw: "Legacy imported posting",
      extractedSkills: ["React"],
      fitScore: 70,
      status: "SAVE",
      statusHistory: [
        {
          id: "h-legacy-import-1",
          status: "SAVE",
          changedAt: now,
          note: "Imported from external feed",
        },
      ],
      tags: ["python-scraper"],
      notes: [],
      createdAt: now,
      updatedAt: now,
    };
    mockedGetJobsFromStorage.mockReturnValue([legacyImported]);

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              generatedAt: "2026-05-13T00:00:00.000Z",
              sourceCount: 1,
              jobs: [
                {
                  externalId: "py:sample:legacy-import-1",
                  source: "MANUAL",
                  sourceLabel: "PythonScraper:sample",
                  sourceUrl: "https://example.com/jobs/legacy-import-1",
                  company: "Sample Co",
                  title: "Frontend Engineer",
                  descriptionRaw: "React TypeScript role",
                  extractedSkills: ["React", "TypeScript"],
                  tags: ["python-scraper"],
                },
              ],
              errors: [],
              sourceResults: [
                {
                  source: "PythonScraper:sample",
                  ok: true,
                  importedJobs: 1,
                },
              ],
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          ),
      ),
    );

    await syncJobsFromFeeds({ refresh: true, persistToDb: false });

    const saved = mockedSaveJobsToStorage.mock.calls[0]?.[0] ?? [];
    const migrated = saved.find((job) => job.id === "legacy-import-1");
    expect(migrated?.status).toBe("NONE");
    expect(migrated?.statusHistory[0]?.status).toBe("NONE");
    expect(migrated?.statusHistory[0]?.note).toBe("Imported from external feed");
  });

  it("supports platform-scoped sync without deleting other platform jobs", async () => {
    const now = "2026-05-10T00:00:00.000Z";
    const indeedJob: LocalJobPosting = {
      id: "indeed-1",
      source: "INDEED",
      sourceUrl: "https://www.indeed.com/viewjob?jk=1",
      company: "Indeed",
      title: "Old Indeed Posting",
      remoteType: "REMOTE",
      descriptionRaw: "Old imported indeed posting",
      extractedSkills: ["React"],
      fitScore: 70,
      status: "SAVE",
      statusHistory: [
        {
          id: "h-indeed",
          status: "SAVE",
          changedAt: now,
          note: "Imported from external feed",
        },
      ],
      tags: ["python-scraper", "indeed-frontend-search"],
      notes: [],
      createdAt: now,
      updatedAt: now,
    };
    const linkedinJob: LocalJobPosting = {
      id: "linkedin-1",
      source: "LINKEDIN",
      sourceUrl: "https://www.linkedin.com/jobs/view/1",
      company: "LinkedIn",
      title: "LinkedIn Posting",
      remoteType: "REMOTE",
      descriptionRaw: "Imported linkedin posting",
      extractedSkills: ["TypeScript"],
      fitScore: 75,
      status: "SAVE",
      statusHistory: [
        {
          id: "h-linkedin",
          status: "SAVE",
          changedAt: now,
          note: "Imported from external feed",
        },
      ],
      tags: ["python-scraper", "linkedin-frontend-search"],
      notes: [],
      createdAt: now,
      updatedAt: now,
    };
    mockedGetJobsFromStorage.mockReturnValue([indeedJob, linkedinJob]);

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            generatedAt: "2026-05-13T00:00:00.000Z",
            sourceCount: 1,
            jobs: [
              {
                externalId: "py:indeed:1",
                source: "INDEED",
                sourceLabel: "PythonScraper:Indeed Frontend Search",
                sourceUrl: "https://www.indeed.com/viewjob?jk=1",
                company: "Indeed",
                title: "Frontend Engineer",
                descriptionRaw: "React TypeScript role",
                extractedSkills: ["React", "TypeScript"],
                tags: ["python-scraper", "indeed-frontend-search"],
              },
            ],
            errors: [],
            sourceResults: [
              {
                source: "PythonScraper",
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
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await syncJobsFromFeeds({ refresh: true, platform: "indeed", persistToDb: false });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/jobs/sync",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          platform: "indeed",
        }),
      }),
    );
    expect(mockedSaveJobsToStorage).toHaveBeenCalledTimes(1);
    const saved = mockedSaveJobsToStorage.mock.calls[0]?.[0] ?? [];
    const savedIds = saved.map((job) => job.id);
    expect(savedIds).toContain("linkedin-1");
    expect(savedIds).toContain("indeed-1");
  });

  it("sanitizes overlength feed tags before persistence writes", async () => {
    const now = "2026-05-20T00:00:00.000Z";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.startsWith("/api/jobs/sync")) {
        return new Response(
          JSON.stringify({
            generatedAt: now,
            sourceCount: 1,
            jobs: [
              {
                externalId: "py:linkedin:long-tag",
                source: "LINKEDIN",
                sourceLabel: "PythonScraper:LinkedIn Software Engineer Search",
                sourceUrl: "https://www.linkedin.com/jobs/view/123",
                company: "LinkedIn",
                title: "Senior Software Engineer",
                location: "Seoul",
                descriptionRaw: "React TypeScript role",
                extractedSkills: ["React", "TypeScript"],
                tags: ["python-scraper", "linkedin-software-engineer-search"],
              },
            ],
            errors: [],
            sourceResults: [
              {
                source: "PythonScraper",
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
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      if (url === "/api/jobs" && init?.method === "POST") {
        const payload = JSON.parse(String(init.body ?? "{}")) as {
          tags?: string[];
        };
        expect(payload.tags?.every((tag) => tag.length <= 32)).toBe(true);

        return new Response(
          JSON.stringify({
            ok: true,
            job: {
              id: "p-1",
              userId: "test-user",
              company: "LinkedIn",
              title: "Senior Software Engineer",
              location: "Seoul",
              sourceUrl: "https://www.linkedin.com/jobs/view/123",
              status: "NONE",
              tags: payload.tags ?? [],
              notes: [],
              createdAt: now,
              updatedAt: now,
              updatedByDevice: "test-device",
              version: 1,
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      throw new Error("Unexpected fetch call: " + url + " (" + (init?.method ?? "GET") + ")");
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await syncJobsFromFeeds({ refresh: true });

    expect(result.totalImported).toBe(1);
    expect(mockedSaveJobsToStorage).toHaveBeenCalledTimes(1);
  });

});
