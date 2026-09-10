// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useJobsFeedSync } from "@/components/jobs/use-jobs-feed-sync";
import { createEmptyFeedDiagnostics } from "@/lib/feed-diagnostics";
import type { FeedSyncSummary, SyncJobsFromFeedsResult } from "@/lib/feed-sync";

const { sync, readSummary } = vi.hoisted(() => ({
  sync: vi.fn<() => Promise<SyncJobsFromFeedsResult>>(),
  readSummary: vi.fn<() => FeedSyncSummary | null>(),
}));
vi.mock("@/lib/feed-sync", () => ({
  syncJobsFromFeeds: sync,
  getLastFeedSyncSummary: readSummary,
  getLastFeedSyncAt: () => null,
}));
const refreshJobs = vi.fn(async () => {});
const healthy: SyncJobsFromFeedsResult = {
  added: 1,
  updated: 0,
  totalImported: 27,
  sourceCount: 2,
  importedSourceCount: 1,
  cached: true,
  errors: [],
  sourceResults: [
    {
      source: "PythonScraper:JobKorea Frontend Search",
      ok: true,
      importedJobs: 27,
    },
    {
      source: "PythonScraper:Wanted Frontend Search",
      ok: true,
      importedJobs: 0,
    },
  ],
  diagnostics: createEmptyFeedDiagnostics(),
  recoveryGuide: [],
  syncedAt: "2026-09-09T12:00:00.000Z",
  feedGeneratedAt: "2026-09-09T05:03:14.000Z",
};
const partial: SyncJobsFromFeedsResult = {
  ...healthy,
  errors: [
    {
      source: "PythonScraper:Wanted Frontend Search",
      message: "HTTP Error 403: Forbidden",
    },
  ],
  sourceResults: [
    healthy.sourceResults[0],
    {
      source: "PythonScraper:Wanted Frontend Search",
      ok: false,
      importedJobs: 0,
      message: "HTTP Error 403: Forbidden",
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  sync.mockReset().mockResolvedValue(healthy);
  readSummary.mockReset().mockReturnValue(null);
  refreshJobs.mockClear();
});
afterEach(cleanup);

it("does not replay a cached failure while loading the latest feed", async () => {
  readSummary.mockReturnValue({
    ...partial,
    sourceResults: partial.sourceResults.map((result) => ({
      ...result,
      ok: false,
    })),
  });
  let resolve!: (result: SyncJobsFromFeedsResult) => void;
  sync.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { result } = renderHook(() => useJobsFeedSync(refreshJobs));
  expect(result.current.syncError).toBeNull();
  expect(result.current.syncWarning).toBeNull();
  expect(result.current.syncToast).toBeNull();
  await act(async () => {
    resolve(healthy);
  });
  expect(result.current.syncError).toBeNull();
  expect(result.current.syncWarning).toBeNull();
  expect(result.current.syncToast).toBeNull();
});

it("shows current partial failures inline without an arrival toast", async () => {
  sync.mockResolvedValue(partial);
  const { result } = renderHook(() => useJobsFeedSync(refreshJobs));
  await waitFor(() => expect(result.current.isSyncing).toBe(false));
  expect(result.current.syncWarning).toContain("(Wanted)");
  expect(result.current.syncWarning).not.toContain("JobKorea");
  expect(result.current.syncToast).toBeNull();
  expect(result.current.syncError).toBeNull();
  expect(result.current.syncSourceResults[1].message).toContain("403");
  expect(result.current.feedGeneratedAt).toBe(healthy.feedGeneratedAt);
  expect(result.current.lastSyncAt).toBe(healthy.syncedAt);
});

it("notifies about partial failure after an explicit manual sync", async () => {
  sync.mockResolvedValue(partial);
  const { result } = renderHook(() => useJobsFeedSync(refreshJobs));
  await waitFor(() => expect(result.current.isSyncing).toBe(false));
  act(() => result.current.runManualSyncAll());
  await waitFor(() =>
    expect(result.current.syncToast?.message).toContain("(Wanted)"),
  );
  expect(sync).toHaveBeenLastCalledWith(
    expect.objectContaining({ refresh: true, platform: "all" }),
  );
});

it("keeps a total feed outage visible even on automatic load", async () => {
  sync.mockResolvedValue({
    ...partial,
    totalImported: 0,
    sourceResults: partial.sourceResults.map((result) => ({
      ...result,
      ok: false,
      importedJobs: 0,
    })),
  });
  const { result } = renderHook(() => useJobsFeedSync(refreshJobs));
  await waitFor(() =>
    expect(result.current.syncError).toContain(
      "Job feeds are currently unavailable",
    ),
  );
  expect(result.current.syncWarning).toBeNull();
});

it("clears the previous warning when sources recover", async () => {
  sync.mockResolvedValueOnce(partial).mockResolvedValueOnce(healthy);
  const { result } = renderHook(() => useJobsFeedSync(refreshJobs));
  await waitFor(() => expect(result.current.syncWarning).toContain("Wanted"));
  act(() => result.current.runManualSyncAll());
  await waitFor(() => expect(result.current.isSyncing).toBe(false));
  expect(result.current.syncWarning).toBeNull();
  expect(result.current.syncToast).toBeNull();
});

it.each([
  [
    "Rate limit exceeded",
    "Sync is temporarily rate-limited. Please wait and retry.",
  ],
  [
    "Request failed with status 401",
    "Login required. Please sign in and retry sync.",
  ],
  ["Admin access required", "Admin access is required to sync feeds."],
])("reports %s and releases the sync controls", async (message, toast) => {
  sync.mockRejectedValueOnce(new Error(message));
  const { result } = renderHook(() => useJobsFeedSync(refreshJobs));
  await waitFor(() => expect(result.current.isSyncing).toBe(false));
  expect(result.current.activeSyncPlatform).toBeNull();
  expect(result.current.syncError).toBeNull();
  expect(result.current.syncToast?.message).toBe(toast);
  expect(refreshJobs).not.toHaveBeenCalled();
});

it("preserves persistence failure details while reporting the local import", async () => {
  sync.mockRejectedValueOnce(
    new Error("failed to write DB: database unavailable"),
  );
  const { result } = renderHook(() => useJobsFeedSync(refreshJobs));
  await waitFor(() => expect(result.current.isSyncing).toBe(false));
  expect(result.current.syncError).toBe(
    "Persistence sync failed: database unavailable",
  );
  expect(result.current.syncMessage).toContain("imported locally");
  expect(result.current.syncToast?.message).toContain(
    "Cross-device persistence sync failed",
  );
});

it("shows recovery instructions for unexpected failures", async () => {
  sync.mockRejectedValueOnce(new Error("Network unavailable."));
  const { result } = renderHook(() => useJobsFeedSync(refreshJobs));
  await waitFor(() => expect(result.current.isSyncing).toBe(false));
  expect(result.current.syncError).toBe(
    "Network unavailable. Recovery: verify the Postgres feed snapshot ingestion, then retry sync.",
  );
  expect(result.current.syncToast).toBeNull();
});
