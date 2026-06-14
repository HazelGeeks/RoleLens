import { describe, expect, it } from "vitest";
import { buildFeedSyncAlert } from "@/lib/feed-sync-alert";

describe("buildFeedSyncAlert", () => {
  it("returns configuration error when sources are not configured", () => {
    const alert = buildFeedSyncAlert({
      sourceCount: 0,
      errors: [
        {
          source: "configuration",
          message: "No sources configured",
        },
      ],
      sourceResults: [],
    });

    expect(alert).not.toBeNull();
    expect(alert?.level).toBe("error");
    expect(alert?.message.toLowerCase()).toContain("no valid feed source");
    expect(alert?.message).toContain("D1");
    expect(alert?.message).toContain("PYTHON_SCRAPED_FEED_URL");
  });

  it("returns warning for partial source failures", () => {
    const alert = buildFeedSyncAlert({
      sourceCount: 2,
      errors: [
        {
          source: "Lever:acme",
          message: "Timed out",
        },
      ],
      sourceResults: [
        {
          source: "Greenhouse:acme",
          ok: true,
          importedJobs: 10,
        },
        {
          source: "Lever:acme",
          ok: false,
          importedJobs: 0,
          message: "Timed out",
        },
      ],
    });

    expect(alert).not.toBeNull();
    expect(alert?.level).toBe("warning");
    expect(alert?.message).toContain("Partial sync");
  });

  it("returns error when all sources fail", () => {
    const alert = buildFeedSyncAlert({
      sourceCount: 2,
      errors: [
        {
          source: "Greenhouse:foo",
          message: "Failed",
        },
        {
          source: "Lever:bar",
          message: "Failed",
        },
      ],
      sourceResults: [
        {
          source: "Greenhouse:foo",
          ok: false,
          importedJobs: 0,
          message: "Failed",
        },
        {
          source: "Lever:bar",
          ok: false,
          importedJobs: 0,
          message: "Failed",
        },
      ],
    });

    expect(alert).not.toBeNull();
    expect(alert?.level).toBe("error");
    expect(alert?.message).toContain("all configured sources");
  });
});
