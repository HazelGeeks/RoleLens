"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getLastFeedSyncAt,
  getLastFeedSyncSummary,
  shouldAutoSyncToday,
  syncJobsFromFeeds,
} from "@/lib/feed-sync";
import { buildFeedSyncAlert } from "@/lib/feed-sync-alert";
import type { FeedImportDiagnostics, FeedSourceResult } from "@/lib/feed-types";
import { feedPlatformLabels, type FeedPlatform } from "@/lib/feed-platform";
import { EMPTY_DIAGNOSTICS } from "@/components/jobs/jobs-page-utils";

type SyncToast = {
  id: number;
  message: string;
};

type SyncOptions = {
  silent?: boolean;
  refresh?: boolean;
  platform?: FeedPlatform;
};

function buildRecoveryMessage(message: string) {
  const safeMessage = message.endsWith(".") ? message.slice(0, -1) : message;
  const recovery =
    "Recovery: retry sync. If it keeps failing, verify PYTHON_SCRAPED_FEED_URL and deployment environment settings.";
  return safeMessage + ". " + recovery;
}

export function useJobsFeedSync(refreshJobs: () => Promise<void>) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<SyncToast | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncSourceResults, setSyncSourceResults] = useState<FeedSourceResult[]>([]);
  const [syncDiagnostics, setSyncDiagnostics] =
    useState<FeedImportDiagnostics>(EMPTY_DIAGNOSTICS);
  const [syncRecoveryGuide, setSyncRecoveryGuide] = useState<string[]>([]);
  const [activeSyncPlatform, setActiveSyncPlatform] =
    useState<FeedPlatform | null>(null);

  const showSyncToast = useCallback((message: string) => {
    setSyncToast({
      id: Date.now(),
      message,
    });
  }, []);

  const dismissSyncToast = useCallback(() => {
    setSyncToast(null);
  }, []);

  const runFeedSync = useCallback(
    async (options?: SyncOptions) => {
      const platform = options?.platform ?? "all";
      setIsSyncing(true);
      setActiveSyncPlatform(platform);
      setSyncError(null);

      if (!options?.silent) {
        setSyncMessage(null);
      }

      try {
        const result = await syncJobsFromFeeds({
          refresh: options?.refresh,
          platform,
        });
        await refreshJobs();
        setLastSyncAt(result.syncedAt);
        setSyncSourceResults(result.sourceResults);
        setSyncDiagnostics(result.diagnostics);
        setSyncRecoveryGuide(result.recoveryGuide);
        const platformLabel = feedPlatformLabels[platform];
        const targetLabel = platform === "all" ? "all feeds" : platformLabel + " feed";
        setSyncMessage(
          "Synced " +
            result.totalImported +
            " postings (" +
            result.added +
            " new, " +
            result.updated +
            " updated) from " +
            targetLabel +
            " using " +
            result.importedSourceCount +
            " source(s) at " +
            new Date(result.syncedAt).toLocaleString() +
            ".",
        );

        const alert = buildFeedSyncAlert({
          sourceCount: result.sourceCount,
          errors: result.errors,
          sourceResults: result.sourceResults,
        });

        if (alert?.level === "error") {
          setSyncError(alert.message);
        } else if (alert?.level === "warning") {
          showSyncToast(alert.message);
          setSyncError(null);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to sync crawled feed";

        if (message.includes("failed to write DB")) {
          const marker = "failed to write DB";
          const markerIndex = message.toLowerCase().indexOf(marker.toLowerCase());
          const detail =
            markerIndex >= 0
              ? message.slice(markerIndex + marker.length).replace(/^[:\s]+/, "")
              : "";

          setSyncMessage(
            "Feed data was imported locally, but server persistence sync is currently unavailable.",
          );
          showSyncToast(
            "Local import succeeded. Cross-device persistence sync failed; check D1 binding, migrations, and auth.",
          );
          setSyncError(
            detail
              ? "Persistence sync failed: " + detail
              : "Persistence sync failed while writing to the server database.",
          );
          return;
        }

        const manualSyncDisabled =
          message.includes("Manual feed refresh is disabled") ||
          (message.includes("status 403") &&
            message.toLowerCase().includes("public deployment"));

        if (manualSyncDisabled) {
          setSyncError(null);
          showSyncToast(
            "Manual sync is disabled on this production deployment. Cached results are shown instead, and scheduled /api/jobs/cron keeps feed data updated.",
          );
          setSyncMessage(
            "Manual sync is unavailable on this production deployment. Showing cached feed results.",
          );
          if (options?.silent) {
            setSyncMessage("Loaded the latest cached feed snapshot.");
          }
          return;
        }

        if (message.includes("Rate limit exceeded")) {
          setSyncError(null);
          showSyncToast("Sync is temporarily rate-limited. Please wait and retry.");
          return;
        }

        setSyncError(buildRecoveryMessage(message));
      } finally {
        setIsSyncing(false);
        setActiveSyncPlatform(null);
      }
    },
    [refreshJobs, showSyncToast],
  );

  const runManualSyncAll = useCallback(() => {
    showSyncToast(
      "Sync request received for all feeds. Checking if manual sync is available on this deployment...",
    );
    void runFeedSync({ refresh: true, platform: "all" });
  }, [runFeedSync, showSyncToast]);

  const runManualSyncPlatform = useCallback(
    (platform: Exclude<FeedPlatform, "all">) => {
      showSyncToast(
        "Sync request received for " +
          feedPlatformLabels[platform] +
          ". Checking if manual sync is available on this deployment...",
      );
      void runFeedSync({ refresh: true, platform });
    },
    [runFeedSync, showSyncToast],
  );

  useEffect(() => {
    if (!syncToast) return;
    const timeout = window.setTimeout(() => {
      setSyncToast((current) => (current?.id === syncToast.id ? null : current));
    }, 6000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [syncToast]);

  useEffect(() => {
    setLastSyncAt(getLastFeedSyncAt());
    const lastSummary = getLastFeedSyncSummary();
    let shouldForceRefresh = false;

    if (lastSummary) {
      setSyncSourceResults(lastSummary.sourceResults);
      setSyncDiagnostics(lastSummary.diagnostics);
      setSyncRecoveryGuide(lastSummary.recoveryGuide);
      setSyncMessage(
        `Last sync imported ${lastSummary.totalImported} postings from ${lastSummary.importedSourceCount} source(s).`,
      );

      const alert = buildFeedSyncAlert({
        sourceCount: lastSummary.sourceCount,
        errors: lastSummary.errors,
        sourceResults: lastSummary.sourceResults,
      });

      if (alert?.level === "error") {
        setSyncError(alert.message);
      } else if (alert?.level === "warning") {
        showSyncToast(alert.message);
        setSyncError(null);
      }

      shouldForceRefresh =
        lastSummary.sourceCount === 0 ||
        lastSummary.errors.some((entry) => entry.source === "configuration");
    }

    if (!shouldAutoSyncToday() && !shouldForceRefresh) return;
    void runFeedSync({ silent: true });
  }, [runFeedSync, showSyncToast]);

  return {
    isSyncing,
    syncMessage,
    syncError,
    syncToast,
    dismissSyncToast,
    lastSyncAt,
    syncSourceResults,
    syncDiagnostics,
    syncRecoveryGuide,
    activeSyncPlatform,
    runManualSyncAll,
    runManualSyncPlatform,
  };
}
