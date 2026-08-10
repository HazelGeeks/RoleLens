import { describe, expect, it } from "vitest";
import {
  buildFeedSyncAlert,
  buildFeedSyncWarningFingerprint,
} from "@/lib/feed-sync-alert";

describe("buildFeedSyncAlert", () => {
  it("returns an error when no D1 snapshot is available", () => {
    const alert = buildFeedSyncAlert({
      sourceCount: 0,
      errors: [
        {
          source: "d1",
          message: "No D1-ingested feed snapshot is available",
        },
      ],
      sourceResults: [],
    });

    expect(alert).not.toBeNull();
    expect(alert?.level).toBe("error");
    expect(alert?.message.toLowerCase()).toContain("no d1 feed snapshot");
    expect(alert?.message).toContain("D1");
    expect(alert?.message).toContain("Ingest");
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
