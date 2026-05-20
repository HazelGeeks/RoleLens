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
                  sourceUrl:
                    "https://www.linkedin.com/jobs/search/?keywords=frontend%20engineer&location=Vancouver%2C%20British%20Columbia%2C%20Canada",
                  company: "Sample Co",
                  title: "Frontend Engineer",
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
    expect(result.jobs[0]?.location).toBe("Vancouver, British Columbia, Canada");
  });

  it("uses local fallback feed route in local development", async () => {
    const mockedFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            jobs: [],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
    );
    vi.stubGlobal("fetch", mockedFetch);

    const result = await collectFeedJobs(
      { NODE_ENV: "development", PYTHON_SCRAPED_FEED_URL: "" },
      { requestUrl: "http://localhost:3000/api/jobs/import?refresh=1" },
    );

    expect(result.sourceCount).toBe(1);
    expect(result.diagnostics.python.scrapedFeedConfigured).toBe(true);
    expect(mockedFetch).toHaveBeenCalledOnce();
  });

  it("filters imported jobs by platform when requested", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              jobs: [
                {
                  externalId: "py:indeed:1",
                  source: "INDEED",
                  sourceLabel: "PythonScraper:Indeed Frontend Search",
                  sourceUrl: "https://www.indeed.com/viewjob?jk=123",
                  company: "Indeed",
                  title: "Frontend Engineer",
                  location: "Vancouver, BC",
                  descriptionRaw: "React TypeScript role",
                  tags: ["python-scraper", "indeed-frontend-search"],
                  publishedAt: "2026-05-11T00:00:00.000Z",
                },
                {
                  externalId: "py:linkedin:1",
                  source: "LINKEDIN",
                  sourceLabel: "PythonScraper:LinkedIn Frontend Search",
                  sourceUrl: "https://www.linkedin.com/jobs/view/123",
                  company: "LinkedIn",
                  title: "Frontend Engineer",
                  location: "Vancouver, BC",
                  descriptionRaw: "React TypeScript role",
                  tags: ["python-scraper", "linkedin-frontend-search"],
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

    const result = await collectFeedJobs(
      {
        PYTHON_SCRAPED_FEED_URL: "https://example.com/scraped-jobs.json",
        TARGET_LOCATION_KEYWORDS: "vancouver",
      },
      { platform: "indeed" },
    );

    expect(result.sourceCount).toBe(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.source).toBe("INDEED");
    expect(result.sourceResults[0]?.importedJobs).toBe(1);
    expect(result.sourceResults[0]?.message).toContain("Platform filter (indeed)");
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
