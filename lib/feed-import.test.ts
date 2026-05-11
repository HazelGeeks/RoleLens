import { afterEach, describe, expect, it, vi } from "vitest";
import { collectFeedJobs } from "@/lib/feed-import";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("collectFeedJobs diagnostics", () => {
  it("does not treat blank or comma-only source variables as configured", async () => {
    const result = await collectFeedJobs({
      GREENHOUSE_BOARD_TOKENS: " , , ",
      LEVER_COMPANIES: ",",
      LINKEDIN_ALERT_FEED_URL: " , ",
      INDEED_ALERT_FEED_URL: "   ",
      THIRD_ALERT_FEED_URL: ",",
    });

    expect(result.sourceCount).toBe(0);
    expect(result.diagnostics.ats.configuredSourceCount).toBe(0);
    expect(result.diagnostics.rss.configuredSourceCount).toBe(0);
    expect(result.errors[0]?.source).toBe("configuration");
  });

  it("reports sourceCount greater than zero with valid ATS input", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              jobs: [
                {
                  id: 100,
                  title: "Frontend Engineer",
                  location: { name: "Toronto" },
                  absolute_url: "https://example.com/jobs/100",
                  content: "React TypeScript",
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
      GREENHOUSE_BOARD_TOKENS: "acme-board",
      LEVER_COMPANIES: "",
    });

    expect(result.sourceCount).toBeGreaterThan(0);
    expect(result.diagnostics.ats.greenhouseBoardCount).toBe(1);
    expect(result.jobs.length).toBeGreaterThan(0);
  });

  it("returns diagnostics and recovery guide on configuration error", async () => {
    const result = await collectFeedJobs({
      GREENHOUSE_BOARD_TOKENS: "",
      LEVER_COMPANIES: "",
      LINKEDIN_ALERT_FEED_URL: "",
      INDEED_ALERT_FEED_URL: "",
      THIRD_ALERT_FEED_URL: "",
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.diagnostics).toEqual({
      ats: {
        greenhouseBoardCount: 0,
        leverCompanyCount: 0,
        configuredSourceCount: 0,
      },
      rss: {
        linkedinConfigured: false,
        indeedConfigured: false,
        thirdConfigured: false,
        configuredSourceCount: 0,
      },
      sourceCount: 0,
    });
    expect(result.recoveryGuide.length).toBeGreaterThan(0);
  });
});
