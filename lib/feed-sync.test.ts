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
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              generatedAt: "2026-04-13T00:00:00.000Z",
              sourceCount: 2,
              jobs: [
                {
                  externalId: "gh:acme:1",
                  source: "COMPANY_SITE",
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
      ),
    );

    const result = await syncJobsFromFeeds({ refresh: true });

    expect(result.totalImported).toBe(1);
    expect(result.sourceCount).toBe(2);
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
    expect(summary?.errors).toHaveLength(1);
    expect(summary?.sourceResults[1]?.source).toBe("Lever");
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
      source: "COMPANY_SITE",
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

    await syncJobsFromFeeds({ refresh: true });

    expect(mockedSaveJobsToStorage).toHaveBeenCalledTimes(1);
    const saved = mockedSaveJobsToStorage.mock.calls[0]?.[0] ?? [];
    const savedIds = saved.map((job) => job.id);
    expect(savedIds).toContain("manual-1");
    expect(savedIds).not.toContain("legacy-greenhouse-1");
  });
});
