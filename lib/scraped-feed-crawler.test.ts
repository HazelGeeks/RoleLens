import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/scraped-feed-store", () => ({
  saveScrapedFeedSnapshot: vi.fn(async (input: unknown) => {
    const payload = input as { generatedAt?: string; sourceCount?: number; jobs?: unknown[] };
    return {
      snapshotId: "snapshot-1",
      importedAt: "2026-05-26T11:00:00.000Z",
      generatedAt: payload.generatedAt || "2026-05-26T10:59:00.000Z",
      sourceCount: payload.sourceCount || 0,
      jobCount: Array.isArray(payload.jobs) ? payload.jobs.length : 0,
    };
  }),
}));

import { saveScrapedFeedSnapshot } from "@/lib/scraped-feed-store";
import {
  crawlAndSaveScrapedFeedSnapshot,
  crawlScrapedFeedSources,
} from "@/lib/scraped-feed-crawler";

const mockedSaveScrapedFeedSnapshot = vi.mocked(saveScrapedFeedSnapshot);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("scraped feed crawler", () => {
  it("extracts job-like links from source pages", async () => {
    const fetchMock = vi.fn(async () => {
      const html = `
        <html>
          <body>
            <a href="/careers/frontend-engineer">Frontend Engineer</a>
            <a href="/about">About</a>
          </body>
        </html>
      `;
      return new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await crawlScrapedFeedSources(
      {
        includeDefaultCatalog: false,
        sourceUrls: ["https://example.com/jobs"],
      },
      {
        SCRAPED_FEED_CRAWL_CONCURRENCY: "1",
      } as NodeJS.ProcessEnv,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.sourceCount).toBe(1);
    expect(snapshot.jobs).toHaveLength(1);
    expect(snapshot.sourceResults[0]?.ok).toBe(true);
    expect(snapshot.sourceResults[0]?.importedJobs).toBe(1);
    expect(snapshot.errors).toHaveLength(0);
  });

  it("respects platform filter for crawler sources", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.includes("linkedin.com")) {
        return new Response(
          '<a href="/jobs/view/backend-engineer-at-acme-12345">Backend Engineer</a>',
          { status: 200 },
        );
      }

      return new Response('<a href="/viewjob?jk=abc123">Backend Engineer</a>', {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await crawlScrapedFeedSources(
      {
        includeDefaultCatalog: false,
        platform: "linkedin",
        sourceUrls: [
          "https://www.linkedin.com/jobs/search/?keywords=backend",
          "https://ca.indeed.com/jobs?q=backend",
        ],
      },
      {
        SCRAPED_FEED_CRAWL_CONCURRENCY: "1",
      } as NodeJS.ProcessEnv,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.sourceCount).toBe(1);
    expect(snapshot.jobs).toHaveLength(1);
    expect(String(snapshot.jobs[0]?.source)).toBe("MANUAL");
    expect(String(snapshot.jobs[0]?.sourceUrl || "")).toContain("linkedin.com");
  });

  it("persists crawled snapshot through scraped-feed-store", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response('<a href="/careers/software-engineer">Software Engineer</a>', {
          status: 200,
        }),
      ),
    );

    const result = await crawlAndSaveScrapedFeedSnapshot(
      {
        includeDefaultCatalog: false,
        sourceUrls: ["https://example.com/jobs"],
      },
      {
        SCRAPED_FEED_CRAWL_CONCURRENCY: "1",
      } as NodeJS.ProcessEnv,
    );

    expect(mockedSaveScrapedFeedSnapshot).toHaveBeenCalledTimes(1);
    expect(result.saved.snapshotId).toBe("snapshot-1");
    expect(result.snapshot.jobs).toHaveLength(1);
  });
});
