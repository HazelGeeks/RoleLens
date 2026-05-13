import { afterEach, describe, expect, it, vi } from "vitest";
import { collectFeedJobs } from "@/lib/feed-import";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("collectFeedJobs diagnostics (python-only)", () => {
  it("does not treat blank or comma-only source variables as configured", async () => {
    const result = await collectFeedJobs({
      GREENHOUSE_BOARD_TOKENS: " , , ",
      LEVER_COMPANIES: ",",
      ASHBY_ORGANIZATIONS: " , ",
      SMARTRECRUITERS_COMPANIES: " , ",
      LINKEDIN_ALERT_FEED_URL: " , ",
      INDEED_ALERT_FEED_URL: "   ",
      THIRD_ALERT_FEED_URL: ",",
      PYTHON_SCRAPED_FEED_URL: " , ",
    });

    expect(result.sourceCount).toBe(0);
    expect(result.diagnostics).toEqual({
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
    });
    expect(result.errors[0]?.source).toBe("configuration");
  });

  it("ignores ATS/RSS variables and relies on python feed only", async () => {
    const result = await collectFeedJobs({
      GREENHOUSE_BOARD_TOKENS: "stripe",
      LEVER_COMPANIES: "netflix",
      ASHBY_ORGANIZATIONS: "openai",
      SMARTRECRUITERS_COMPANIES: "smartrecruiters",
      LINKEDIN_ALERT_FEED_URL: "https://example.com/feed.xml",
      INDEED_ALERT_FEED_URL: "https://example.com/feed2.xml",
      THIRD_ALERT_FEED_URL: "https://example.com/feed3.xml",
    });

    expect(result.sourceCount).toBe(0);
    expect(result.diagnostics.ats.configuredSourceCount).toBe(0);
    expect(result.diagnostics.rss.configuredSourceCount).toBe(0);
    expect(result.errors[0]?.source).toBe("configuration");
  });

  it("imports jobs from configured python scraped feed URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              jobs: [
                {
                  externalId: "py:sample:1",
                  source: "MANUAL",
                  sourceLabel: "PythonScraper:sample",
                  sourceUrl: "https://example.com/jobs/1",
                  company: "Sample Co",
                  title: "Frontend Engineer",
                  location: "Seoul, Korea",
                  descriptionRaw: "React TypeScript role",
                  tags: ["python-scraper"],
                  publishedAt: "2026-05-11T00:00:00.000Z",
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

    const result = await collectFeedJobs({
      PYTHON_SCRAPED_FEED_URL: "https://example.com/scraped-jobs.json",
      PYTHON_SCRAPED_SOURCE_TYPE: "MANUAL",
    });

    expect(result.sourceCount).toBe(1);
    expect(result.diagnostics.python.configuredSourceCount).toBe(1);
    expect(result.jobs.length).toBeGreaterThan(0);
    expect(result.jobs[0]?.sourceLabel).toContain("Python");
  });

  it("returns diagnostics and recovery guide on configuration error", async () => {
    const result = await collectFeedJobs({
      PYTHON_SCRAPED_FEED_URL: "",
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.source).toBe("configuration");
    expect(result.recoveryGuide.length).toBeGreaterThan(0);
  });
});
