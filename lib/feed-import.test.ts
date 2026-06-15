import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFeedImportSnapshotFromImportedJobs } from "@/lib/feed-import";
import { readFeedSnapshotFromCache } from "@/lib/feed-snapshot-cache";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("feed import snapshots", () => {
  it("ignores stale feed snapshots from edge cache", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T05:55:00.000Z"));
    vi.stubGlobal("caches", {
      open: vi.fn(async () => ({
        match: vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                generatedAt: "2026-06-05T04:49:50.278Z",
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
                    scrapedFeedConfigured: true,
                    configuredSourceCount: 1,
                  },
                  sourceCount: 1,
                },
                recoveryGuide: [],
              }),
            ),
        ),
      })),
    });

    await expect(
      readFeedSnapshotFromCache(
        new Request("https://rolelens.pages.dev/api/jobs/import"),
      ),
    ).resolves.toBeNull();
  });

  it("normalizes ingested Python scraper payloads for D1 snapshots", async () => {
    const result = buildFeedImportSnapshotFromImportedJobs({
      generatedAt: "2026-06-14T20:53:41.459Z",
      sourceCount: 1,
      jobs: [
        {
          externalId: "py:sample:1",
          source: "LINKEDIN",
          sourceLabel: "PythonScraper:LinkedIn",
          sourceUrl: "https://www.linkedin.com/jobs/view/123",
          company: "Sample Co",
          title: "Frontend Engineer",
          location: "Vancouver, BC",
          descriptionRaw: "React TypeScript role in Vancouver",
          tags: ["python-scraper"],
          publishedAt: "2026-06-14T00:00:00.000Z",
        },
      ],
    });

    expect(result.sourceCount).toBe(1);
    expect(result.importedSourceCount).toBe(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.sourceLabel).toContain("PythonScraper");
    expect(result.diagnostics.python.scrapedFeedConfigured).toBe(true);
  });
});
