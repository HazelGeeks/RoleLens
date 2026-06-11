import { afterEach, describe, expect, it, vi } from "vitest";
import { collectFeedJobs, readFeedSnapshotFromCache } from "@/lib/feed-import";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("collectFeedJobs diagnostics (python-only)", () => {
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
                {
                  externalId: "py:sample:2",
                  source: "MANUAL",
                  sourceLabel: "PythonScraper:sample-2",
                  sourceUrl: "https://example.com/jobs/2",
                  company: "Sample Co 2",
                  title: "Frontend Developer",
                  location: "Vancouver, BC",
                  descriptionRaw: "React role",
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
    expect(result.importedSourceCount).toBe(2);
    expect(result.diagnostics.python.configuredSourceCount).toBe(1);
    expect(result.jobs.length).toBeGreaterThan(0);
    expect(result.jobs[0]?.sourceLabel).toContain("Python");
    expect(result.jobs[0]?.location).toBe("Vancouver, British Columbia, Canada");
  });

  it("hydrates placeholder descriptions from source job pages", async () => {
    const mockedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url === "https://example.com/scraped-jobs.json") {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                externalId: "py:sample:backend-1",
                source: "LINKEDIN",
                sourceLabel: "PythonScraper:LinkedIn Backend Search",
                sourceUrl:
                  "https://ca.linkedin.com/jobs/view/backend-engineer-at-acme-123",
                company: "Acme",
                location: "Vancouver, British Columbia, Canada",
                title: "Backend Engineer",
                descriptionRaw:
                  "Scraped link from https://www.linkedin.com/jobs/search/?keywords=backend%20engineer&location=Vancouver%2C%20British%20Columbia%2C%20Canada",
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
        );
      }

      if (url === "https://ca.linkedin.com/jobs/view/backend-engineer-at-acme-123") {
        return new Response(
          "<html><body><main><p>Backend Engineer role focused on building distributed APIs, event-driven systems, TypeScript services, and cloud infrastructure for high-traffic products.</p></main></body></html>",
          {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", mockedFetch);

    const result = await collectFeedJobs({
      PYTHON_SCRAPED_FEED_URL: "https://example.com/scraped-jobs.json",
    });

    expect(result.jobs[0]?.descriptionRaw).not.toContain("Scraped link from");
    expect(result.jobs[0]?.descriptionRaw).toContain("Backend Engineer role focused");
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it("drops scraped-link placeholder descriptions when source hydration fails", async () => {
    const searchUrl =
      "https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=Vancouver%2C%20British%20Columbia%2C%20Canada";
    const mockedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url === "https://example.com/scraped-jobs.json") {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                externalId: "py:linkedin:search-placeholder",
                source: "LINKEDIN",
                sourceLabel: "PythonScraper:LinkedIn Software Search",
                sourceUrl: searchUrl,
                company: "LinkedIn",
                location: "Vancouver, British Columbia, Canada",
                title: "Software Engineer",
                descriptionRaw: `Scraped link from ${searchUrl}`,
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
        );
      }

      if (url === searchUrl) {
        return new Response(
          "<html><body>Join now Sign in We use cookies to improve your LinkedIn experience.</body></html>",
          {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", mockedFetch);

    const result = await collectFeedJobs({
      PYTHON_SCRAPED_FEED_URL: "https://example.com/scraped-jobs.json",
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.descriptionRaw).toBe("");
    expect(result.jobs[0]?.descriptionRaw).not.toContain("Scraped link from");
    expect(mockedFetch).toHaveBeenCalledTimes(2);
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
