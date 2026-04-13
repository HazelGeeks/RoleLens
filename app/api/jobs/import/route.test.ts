import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/feed-import", () => ({
  collectFeedJobs: vi.fn(),
  readFeedSnapshotFromCache: vi.fn(),
  writeFeedSnapshotToCache: vi.fn(),
}));

import {
  collectFeedJobs,
  readFeedSnapshotFromCache,
  writeFeedSnapshotToCache,
} from "@/lib/feed-import";
import { GET } from "./route";

const mockedCollectFeedJobs = vi.mocked(collectFeedJobs);
const mockedReadFeedSnapshotFromCache = vi.mocked(readFeedSnapshotFromCache);
const mockedWriteFeedSnapshotToCache = vi.mocked(writeFeedSnapshotToCache);

describe("/api/jobs/import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedReadFeedSnapshotFromCache.mockResolvedValue(null);
    mockedWriteFeedSnapshotToCache.mockResolvedValue(undefined);
    mockedCollectFeedJobs.mockResolvedValue({
      generatedAt: "2026-04-13T00:00:00.000Z",
      sourceCount: 0,
      jobs: [],
      errors: [
        {
          source: "configuration",
          message: "No sources configured",
        },
      ],
      sourceResults: [],
      diagnostics: {
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
      },
      recoveryGuide: ["Set env vars and retry"],
    });
  });

  it("includes diagnostics fields in refresh response", async () => {
    const request = new Request(
      "https://rolelens.pages.dev/api/jobs/import?refresh=1",
      {
        method: "GET",
      },
    );

    const response = await GET(request);
    const payload = (await response.json()) as {
      diagnostics: {
        sourceCount: number;
      };
      recoveryGuide: string[];
      cached: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload.cached).toBe(false);
    expect(payload.diagnostics.sourceCount).toBe(0);
    expect(payload.recoveryGuide.length).toBeGreaterThan(0);
  });
});