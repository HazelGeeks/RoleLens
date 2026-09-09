import { describe, expect, it } from "vitest";
import {
  buildFeedSyncAlert,
  buildFeedSyncWarningFingerprint,
} from "@/lib/feed-sync-alert";

describe("buildFeedSyncAlert", () => {
  it("keeps paused sources in diagnostics without presenting them as failures", () => {
    const paused = {
      source: "PythonScraper:Wanted Frontend Search",
      ok: false,
      disabled: true,
      importedJobs: 0,
    };
    const health = {
      sourceCount: 1,
      errors: [],
      sourceResults: [
        paused,
        { source: "JobKorea", ok: true, importedJobs: 27 },
      ],
    };
    expect(buildFeedSyncAlert(health)).toBeNull();
    expect(buildFeedSyncWarningFingerprint(health)).toBeNull();
    expect(
      buildFeedSyncAlert({
        ...health,
        sourceResults: [
          paused,
          { source: "JobKorea", ok: false, importedJobs: 0 },
        ],
      })?.level,
    ).toBe("error");
  });
  it("returns an error when no Postgres snapshot is available", () => {
    const alert = buildFeedSyncAlert({
      sourceCount: 0,
      errors: [
        {
          source: "postgres",
          message: "No Postgres-ingested feed snapshot is available",
        },
      ],
      sourceResults: [],
    });

    expect(alert).not.toBeNull();
    expect(alert?.level).toBe("error");
    expect(alert?.message).toContain("Job feeds are currently unavailable");
    expect(alert?.message).toContain("saved postings are still available");
    expect(alert?.message).not.toContain("Postgres");
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
    expect(alert?.message).toContain(
      "Some job sources are temporarily unavailable",
    );
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
    expect(alert?.message).toContain("Job feeds are currently unavailable");
  });

  it("groups failed search queries by board while preserving source diagnostics", () => {
    const sourceResults = [
      {
        source: "PythonScraper:JobKorea Frontend Search",
        ok: true,
        importedJobs: 27,
      },
      ...["Frontend", "Blockchain", "Backend", "Software Engineer"].map(
        (role) => ({
          source: `PythonScraper:Wanted ${role} Search`,
          ok: false,
          importedJobs: 0,
          message: "Scrape request failed: HTTP Error 403: Forbidden",
        }),
      ),
    ];
    const alert = buildFeedSyncAlert({
      sourceCount: 5,
      errors: [],
      sourceResults,
    });
    expect(alert?.message).toBe(
      "Some job sources are temporarily unavailable (Wanted). You can browse postings from other sources.",
    );
    expect(sourceResults.filter((result) => !result.ok)).toHaveLength(4);
  });

  it("builds the same warning fingerprint regardless of source result order", () => {
    const first = buildFeedSyncWarningFingerprint({
      sourceCount: 3,
      errors: [],
      sourceResults: [
        {
          source: "Wanted:Backend",
          ok: false,
          importedJobs: 0,
          message: "403",
        },
        { source: "Indeed", ok: true, importedJobs: 5 },
        {
          source: "Wanted:Frontend",
          ok: false,
          importedJobs: 0,
          message: "403",
        },
      ],
    });
    const second = buildFeedSyncWarningFingerprint({
      sourceCount: 3,
      errors: [],
      sourceResults: [
        {
          source: "Wanted:Frontend",
          ok: false,
          importedJobs: 0,
          message: "403",
        },
        {
          source: "Wanted:Backend",
          ok: false,
          importedJobs: 0,
          message: "403",
        },
        { source: "Indeed", ok: true, importedJobs: 5 },
      ],
    });

    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  it("changes the warning fingerprint when the failure changes", () => {
    const timedOut = buildFeedSyncWarningFingerprint({
      sourceCount: 2,
      errors: [],
      sourceResults: [
        { source: "Indeed", ok: true, importedJobs: 5 },
        { source: "Wanted", ok: false, importedJobs: 0, message: "Timed out" },
      ],
    });
    const blocked = buildFeedSyncWarningFingerprint({
      sourceCount: 2,
      errors: [],
      sourceResults: [
        { source: "Indeed", ok: true, importedJobs: 5 },
        { source: "Wanted", ok: false, importedJobs: 0, message: "403" },
      ],
    });

    expect(blocked).not.toBe(timedOut);
  });

  it("does not fingerprint healthy or fully failed syncs as warnings", () => {
    expect(
      buildFeedSyncWarningFingerprint({
        sourceCount: 1,
        errors: [],
        sourceResults: [{ source: "Indeed", ok: true, importedJobs: 5 }],
      }),
    ).toBeNull();

    expect(
      buildFeedSyncWarningFingerprint({
        sourceCount: 1,
        errors: [],
        sourceResults: [{ source: "Wanted", ok: false, importedJobs: 0 }],
      }),
    ).toBeNull();
  });
});
