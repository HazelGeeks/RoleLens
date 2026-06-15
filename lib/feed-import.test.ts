import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFeedImportSnapshotFromImportedJobs,
  collectFeedJobs,
  readFeedSnapshotFromCache,
} from "@/lib/feed-import";

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

  it("does not treat blank source variables as configured direct feeds", async () => {
    const result = await collectFeedJobs({
      GREENHOUSE_BOARD_TOKENS: " , , ",
      LEVER_COMPANIES: ",",
      ASHBY_ORGANIZATIONS: " , ",
      SMARTRECRUITERS_COMPANIES: " , ",
      LINKEDIN_ALERT_FEED_URL: " , ",
      INDEED_ALERT_FEED_URL: "   ",
      THIRD_ALERT_FEED_URL: ",",
    });

    expect(result.sourceCount).toBe(0);
    expect(result.diagnostics.python.scrapedFeedConfigured).toBe(false);
    expect(result.diagnostics.python.configuredSourceCount).toBe(0);
    expect(result.errors[0]?.source).toBe("configuration");
    expect(result.errors[0]?.message).toContain("D1-ingested snapshots");
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
