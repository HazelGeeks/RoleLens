"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getLastFeedSyncAt,
  getLastFeedSyncSummary,
  syncJobsFromFeeds,
} from "@/lib/feed-sync";
import { getActiveAuthSessionUserId } from "@/lib/auth-client";
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
  persistToDb?: boolean;
};

function buildRecoveryMessage(message: string) {
  const safeMessage = message.endsWith(".") ? message.slice(0, -1) : message;
  const recovery =
    "Recovery: retry sync. If it keeps failing, verify PYTHON_SCRAPED_FEED_URL and deployment environment settings.";
  return safeMessage + ". " + recovery;
}

function countRawImportedPostings(sourceResults: FeedSourceResult[]) {
  return sourceResults.reduce(
    (total, result) => total + (result.ok ? result.importedJobs : 0),
    0,
  );
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
          persistToDb: options?.persistToDb,
        });
        await refreshJobs();
        setLastSyncAt(result.syncedAt);
        setSyncSourceResults(result.sourceResults);
        setSyncDiagnostics(result.diagnostics);
        setSyncRecoveryGuide(result.recoveryGuide);
        const platformLabel = feedPlatformLabels[platform];
        const targetLabel = platform === "all" ? "all feeds" : platformLabel + " feed";
        const rawImported = countRawImportedPostings(result.sourceResults);
        const rawImportPrefix =
          rawImported > result.totalImported
            ? rawImported + " raw scraped postings matched to "
            : "";
        setSyncMessage(
          "Synced " +
            rawImportPrefix +
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

        if (message.includes("Rate limit exceeded")) {
          setSyncError(null);
          showSyncToast("Sync is temporarily rate-limited. Please wait and retry.");
          return;
        }

        if (message.includes("status 401") || message.includes("Login required")) {
          setSyncError(null);
          showSyncToast("Login required. Please sign in and retry sync.");
          return;
        }

        if (
          message.includes("status 403") &&
          (message.includes("Admin access required") ||
            message.includes("Sync admin emails are not configured"))
        ) {
          setSyncError(null);
          showSyncToast("Admin access is required to sync feeds.");
          setSyncMessage(
            "Manual sync is restricted to configured admin accounts on this deployment.",
          );
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
    showSyncToast("Sync request received for all feeds.");
    void runFeedSync({ refresh: true, platform: "all" });
  }, [runFeedSync, showSyncToast]);

  const runManualSyncPlatform = useCallback(
    (platform: Exclude<FeedPlatform, "all">) => {
      showSyncToast(
        "Sync request received for " + feedPlatformLabels[platform] + ".",
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
      const rawImported = countRawImportedPostings(lastSummary.sourceResults);
      const rawImportPrefix =
        rawImported > lastSummary.totalImported
          ? rawImported + " raw scraped postings matched to "
          : "";

      setSyncSourceResults(lastSummary.sourceResults);
      setSyncDiagnostics(lastSummary.diagnostics);
      setSyncRecoveryGuide(lastSummary.recoveryGuide);
      setSyncMessage(
        `Last sync imported ${rawImportPrefix}${lastSummary.totalImported} postings from ${lastSummary.importedSourceCount} source(s).`,
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

    void runFeedSync({
      silent: true,
      refresh: shouldForceRefresh,
      persistToDb: getActiveAuthSessionUserId() != null,
    });
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
