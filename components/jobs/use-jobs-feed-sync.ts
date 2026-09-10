"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getLastFeedSyncAt,
  getLastFeedSyncSummary,
  syncJobsFromFeeds,
} from "@/lib/feed-sync";
import {
  buildFeedSyncAlert,
  buildFeedSyncWarningFingerprint,
  type FeedSyncHealthInput,
} from "@/lib/feed-sync-alert";
import type { FeedImportDiagnostics, FeedSourceResult } from "@/lib/feed-types";
import { feedPlatformLabels, type FeedPlatform } from "@/lib/feed-platform";
import { createEmptyFeedDiagnostics } from "@/lib/feed-diagnostics";

import {
  buildSyncSuccessMessage,
  buildLastSyncMessage,
  describeSyncFailure,
} from "./feed-sync-messages";

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

const LAST_SHOWN_SYNC_WARNING_KEY = "rolelens.feed.lastShownWarning";

export function useJobsFeedSync(refreshJobs: () => Promise<void>) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<SyncToast | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [feedGeneratedAt, setFeedGeneratedAt] = useState<string | null>(null);
  const [syncSourceResults, setSyncSourceResults] = useState<
    FeedSourceResult[]
  >([]);
  const [syncDiagnostics, setSyncDiagnostics] = useState<FeedImportDiagnostics>(
    createEmptyFeedDiagnostics,
  );
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

  const applySyncAlert = useCallback(
    (input: FeedSyncHealthInput, notify: boolean) => {
      const alert = buildFeedSyncAlert(input);
      const warningFingerprint = buildFeedSyncWarningFingerprint(input);

      if (alert?.level === "error") {
        setSyncWarning(null);
        window.localStorage.removeItem(LAST_SHOWN_SYNC_WARNING_KEY);
        setSyncError(alert.message);
        return;
      }

      setSyncError(null);
      setSyncWarning(alert?.message ?? null);

      if (!alert || !warningFingerprint) {
        setSyncToast(null);
        window.localStorage.removeItem(LAST_SHOWN_SYNC_WARNING_KEY);
        return;
      }

      // Background loads report health inline without interrupting page entry.
      if (!notify) return;

      if (
        window.localStorage.getItem(LAST_SHOWN_SYNC_WARNING_KEY) ===
        warningFingerprint
      ) {
        return;
      }

      window.localStorage.setItem(
        LAST_SHOWN_SYNC_WARNING_KEY,
        warningFingerprint,
      );
      showSyncToast(alert.message);
    },
    [showSyncToast],
  );

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
        setFeedGeneratedAt(result.feedGeneratedAt ?? null);
        setSyncSourceResults(result.sourceResults);
        setSyncDiagnostics(result.diagnostics);
        setSyncRecoveryGuide(result.recoveryGuide);
        setSyncMessage(buildSyncSuccessMessage(result, platform));

        applySyncAlert(
          {
            sourceCount: result.sourceCount,
            errors: result.errors,
            sourceResults: result.sourceResults,
          },
          !options?.silent,
        );
      } catch (error) {
        setSyncWarning(null);
        const failure = describeSyncFailure(error);
        setSyncError(failure.error);
        if (failure.message !== undefined) setSyncMessage(failure.message);
        if (failure.toast !== undefined) showSyncToast(failure.toast);
      } finally {
        setIsSyncing(false);
        setActiveSyncPlatform(null);
      }
    },
    [applySyncAlert, refreshJobs, showSyncToast],
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
      setSyncToast((current) =>
        current?.id === syncToast.id ? null : current,
      );
    }, 6000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [syncToast]);

  useEffect(() => {
    setLastSyncAt(getLastFeedSyncAt());
    const lastSummary = getLastFeedSyncSummary();
    if (lastSummary) {
      setSyncSourceResults(lastSummary.sourceResults);
      setFeedGeneratedAt(lastSummary.feedGeneratedAt ?? null);
      setSyncDiagnostics(lastSummary.diagnostics);
      setSyncRecoveryGuide(lastSummary.recoveryGuide);
      setSyncMessage(buildLastSyncMessage(lastSummary));

      // Cached diagnostics are historical; only the fresh response sets current alerts.
    }

    void runFeedSync({
      silent: true,
      refresh: false,
      persistToDb: false,
    });
  }, [applySyncAlert, runFeedSync]);

  return {
    isSyncing,
    syncMessage,
    syncError,
    syncWarning,
    syncToast,
    dismissSyncToast,
    lastSyncAt,
    feedGeneratedAt,
    syncSourceResults,
    syncDiagnostics,
    syncRecoveryGuide,
    activeSyncPlatform,
    runManualSyncAll,
    runManualSyncPlatform,
  };
}
