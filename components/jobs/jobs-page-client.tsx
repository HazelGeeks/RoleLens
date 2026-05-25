"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { JobsTable, type JobRow } from "@/components/jobs/jobs-table";
import { NewJobClient } from "@/components/jobs/new-job-client";
import {
  type JobStatus,
  type JobSource,
  type RemoteType,
  resetJobsStorage,
} from "@/lib/local-jobs";
import {
  getLastFeedSyncAt,
  getLastFeedSyncSummary,
  shouldAutoSyncToday,
  syncJobsFromFeeds,
} from "@/lib/feed-sync";
import type { FeedSourceResult } from "@/lib/feed-types";
import { useLiveLocalJobs } from "@/lib/use-live-local-jobs";
import { buildFeedSyncAlert } from "@/lib/feed-sync-alert";
import type { JobsSortOption } from "@/lib/jobs-sort";
import {
  CompareShortlistCard,
  DueFollowUpsCard,
  JobsEmptyStateCard,
  JobsFiltersCard,
  JobsPageHeader,
} from "@/components/jobs/jobs-page-sections";
import type { FeedImportDiagnostics } from "@/lib/feed-types";
import {
  feedPlatformLabels,
  type FeedPlatform,
} from "@/lib/feed-platform";

const EMPTY_DIAGNOSTICS: FeedImportDiagnostics = {
  ats: {
    greenhouseBoardCount: 0,
    leverCompanyCount: 0,
    ashbyOrganizationCount: 0,
    smartRecruitersCompanyCount: 0,
    configuredSourceCount: 0,
  },
  rss: {
    linkedinConfigured: false,
    indeedConfigured: false,
    thirdConfigured: false,
    configuredSourceCount: 0,
  },
  python: {
    scrapedFeedConfigured: false,
    configuredSourceCount: 0,
  },
  sourceCount: 0,
};

function getLocationPriority(location: string | null) {
  if (!location) return 0;
  const normalized = location.toLowerCase();

  if (normalized.includes("vancouver") || normalized.includes("밴쿠버")) {
    return 3;
  }

  if (normalized.includes("canada") || normalized.includes("캐나다")) {
    return 2;
  }

  return 0;
}

function compareByFitAndCreated(left: JobRow, right: JobRow) {
  const fitDiff = (right.fitScore ?? -1) - (left.fitScore ?? -1);
  if (fitDiff !== 0) return fitDiff;
  return right.createdAt.localeCompare(left.createdAt);
}

function compareByLocationFitAndCreated(left: JobRow, right: JobRow) {
  const locationPriorityDiff =
    getLocationPriority(right.location) - getLocationPriority(left.location);
  if (locationPriorityDiff !== 0) return locationPriorityDiff;
  return compareByFitAndCreated(left, right);
}

type SyncToast = {
  id: number;
  message: string;
};

type JobsViewFilter = "ALL" | "RESUME" | "INTERVIEW";

const viewStatusMap: Record<Exclude<JobsViewFilter, "ALL">, JobStatus[]> = {
  RESUME: ["NONE", "NEW", "SAVE", "INTEREST"],
  INTERVIEW: ["SUBMITTED"],
};

function parseJobsViewFilter(value: string | null): JobsViewFilter {
  if (value === "resume") return "RESUME";
  if (value === "interview") return "INTERVIEW";
  return "ALL";
}

function isJobInView(jobStatus: JobStatus, view: JobsViewFilter) {
  if (view === "ALL") return true;
  return viewStatusMap[view].includes(jobStatus);
}

export function JobsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { jobs, refreshJobs } = useLiveLocalJobs();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<JobStatus | "ALL">("ALL");
  const [source, setSource] = useState<JobSource | "ALL">("ALL");
  const [remoteType, setRemoteType] = useState<RemoteType | "ALL">("ALL");
  const [minFit, setMinFit] = useState("");
  const [requiredSkill, setRequiredSkill] = useState("");
  const [sortBy, setSortBy] = useState<JobsSortOption>("SMART");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<SyncToast | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncSourceResults, setSyncSourceResults] = useState<
    FeedSourceResult[]
  >([]);
  const [syncDiagnostics, setSyncDiagnostics] = useState<FeedImportDiagnostics>(
    EMPTY_DIAGNOSTICS,
  );
  const [syncRecoveryGuide, setSyncRecoveryGuide] = useState<string[]>([]);
  const [activeSyncPlatform, setActiveSyncPlatform] =
    useState<FeedPlatform | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const jobsView = useMemo(
    () => parseJobsViewFilter(searchParams.get("view")),
    [searchParams],
  );

  const showSyncToast = useCallback((message: string) => {
    setSyncToast({
      id: Date.now(),
      message,
    });
  }, []);

  useEffect(() => {
    if (!syncToast) return;
    const timeout = window.setTimeout(() => {
      setSyncToast((current) => (current?.id === syncToast.id ? null : current));
    }, 6000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [syncToast]);

  const dismissSyncToast = useCallback(() => {
    setSyncToast(null);
  }, []);

  const runFeedSync = useCallback(
    async (options?: {
      silent?: boolean;
      refresh?: boolean;
      platform?: FeedPlatform;
    }) => {
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
        const targetLabel =
          platform === "all" ? "all feeds" : platformLabel + " feed";
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
            result.sourceCount +
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
        } else if (!options?.silent) {
          showSyncToast(
            "Sync completed: " +
              result.totalImported +
              " posting(s) processed (" +
              result.added +
              " new, " +
              result.updated +
              " updated) from " +
              targetLabel +
              ".",
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to sync crawled feed";

        if (message.includes("failed to write DB")) {
          resetJobsStorage();
          await refreshJobs();
          setSyncMessage("Local cache was reset because DB write failed. Retry Sync All Feeds.");
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

        const safeMessage = message.endsWith(".") ? message.slice(0, -1) : message;
        const recovery =
          "Recovery: retry sync. If it keeps failing, verify PYTHON_SCRAPED_FEED_URL and deployment environment settings.";
        setSyncError(safeMessage + ". " + recovery);
      } finally {
        setIsSyncing(false);
        setActiveSyncPlatform(null);
      }
    },
    [refreshJobs, showSyncToast],
  );

  useEffect(() => {
    if (searchParams.get("save") !== "1") return;
    setIsSaveModalOpen(true);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("save");
    const nextHref = nextParams.toString() ? "/?" + nextParams.toString() : "/";

    router.replace(nextHref, { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    if (!isSaveModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSaveModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isSaveModalOpen]);

  useEffect(() => {
    setLastSyncAt(getLastFeedSyncAt());
    const lastSummary = getLastFeedSyncSummary();
    let shouldForceRefresh = false;

    if (lastSummary) {
      setSyncSourceResults(lastSummary.sourceResults);
      setSyncDiagnostics(lastSummary.diagnostics);
      setSyncRecoveryGuide(lastSummary.recoveryGuide);
      setSyncMessage(
        `Last sync imported ${lastSummary.totalImported} postings from ${lastSummary.sourceCount} source(s).`,
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

  useEffect(() => {
    setStatus("ALL");
    setCompareIds([]);
  }, [jobsView]);

  const viewFilteredJobs = useMemo(
    () => jobs.filter((job) => isJobInView(job.status, jobsView)),
    [jobs, jobsView],
  );

  const rows = useMemo(() => {
    const normalizedSkill = requiredSkill.trim().toLowerCase();
    const minFitValue = minFit ? Number(minFit) : null;

    return viewFilteredJobs
      .filter((job) => (status === "ALL" ? true : job.status === status))
      .filter((job) => (source === "ALL" ? true : job.source === source))
      .filter((job) =>
        remoteType === "ALL" ? true : job.remoteType === remoteType,
      )
      .filter((job) =>
        minFitValue == null || Number.isNaN(minFitValue)
          ? true
          : job.fitScore >= minFitValue,
      )
      .filter((job) =>
        !normalizedSkill
          ? true
          : job.extractedSkills.some((skill) =>
              skill.toLowerCase().includes(normalizedSkill),
            ),
      )
      .filter((job) => {
        if (!q.trim()) return true;
        const value = q.toLowerCase();
        return [
          job.title,
          job.company,
          job.location || "",
          job.extractedSkills.join(" "),
          job.nextAction || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(value);
      })
      .map(
        (job): JobRow => ({
          id: job.id,
          company: job.company,
          title: job.title,
          location: job.location || null,
          remoteType: job.remoteType,
          source: job.source,
          status: job.status,
          fitScore: job.fitScore,
          salaryMin: job.salaryMin || null,
          salaryMax: job.salaryMax || null,
          salaryCurrency: job.salaryCurrency || null,
          extractedSkills: job.extractedSkills,
          nextAction: job.nextAction || null,
          followUpDate: job.followUpDate || null,
          publishedAt: job.publishedAt || job.createdAt,
          createdAt: job.createdAt,
        }),
      )
      .sort((left, right) => {
        if (sortBy === "CREATED_DESC") {
          return right.createdAt.localeCompare(left.createdAt);
        }

        if (sortBy === "FIT_DESC") {
          return compareByFitAndCreated(left, right);
        }

        if (sortBy === "LOCATION_PRIORITY") {
          return compareByLocationFitAndCreated(left, right);
        }

        if (source === "ALL") {
          return right.createdAt.localeCompare(left.createdAt);
        }

        return compareByLocationFitAndCreated(left, right);
      });
  }, [minFit, q, remoteType, requiredSkill, source, sortBy, status, viewFilteredJobs]);

  const sourceCounts = useMemo(
    () =>
      viewFilteredJobs.reduce<Record<JobSource, number>>(
        (counts, job) => ({ ...counts, [job.source]: counts[job.source] + 1 }),
        { LINKEDIN: 0, INDEED: 0, SARAMIN: 0, JOBKOREA: 0, MANUAL: 0 },
      ),
    [viewFilteredJobs],
  );

  const dueFollowUps = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return viewFilteredJobs
      .filter((job) => !!job.followUpDate && job.followUpDate <= today)
      .filter((job) => job.status !== "ARCHIVE")
      .sort((a, b) =>
        (a.followUpDate || "").localeCompare(b.followUpDate || ""),
      )
      .slice(0, 6);
  }, [viewFilteredJobs]);

  const compareRows = useMemo(
    () => rows.filter((row) => compareIds.includes(row.id)),
    [compareIds, rows],
  );

  const toggleCompare = (id: string, checked: boolean) => {
    setCompareIds((previous) => {
      if (!checked) {
        return previous.filter((value) => value !== id);
      }

      if (previous.includes(id)) {
        return previous;
      }

      if (previous.length >= 3) {
        return previous;
      }

      return [...previous, id];
    });
  };

  const resetFilters = () => {
    setQ("");
    setStatus("ALL");
    setSource("ALL");
    setRemoteType("ALL");
    setMinFit("");
    setRequiredSkill("");
    setSortBy("SMART");
  };

  const runManualSyncAll = () => {
    showSyncToast(
      "Sync request received for all feeds. Checking if manual sync is available on this deployment...",
    );
    void runFeedSync({ refresh: true, platform: "all" });
  };

  const runManualSyncPlatform = (platform: Exclude<FeedPlatform, "all">) => {
    showSyncToast(
      "Sync request received for " +
        feedPlatformLabels[platform] +
        ". Checking if manual sync is available on this deployment...",
    );
    void runFeedSync({ refresh: true, platform });
  };

  const openSaveModal = () => {
    setIsSaveModalOpen(true);
  };

  const closeSaveModal = () => {
    setIsSaveModalOpen(false);
  };

  const handleSavedFromModal = useCallback(() => {
    setIsSaveModalOpen(false);
    void refreshJobs();
  }, [refreshJobs]);

  const filters = {
    q,
    status,
    source,
    remoteType,
    minFit,
    requiredSkill,
    sortBy,
  };

  const filterActions = {
    setQ,
    setStatus,
    setSource,
    setRemoteType,
    setMinFit,
    setRequiredSkill,
    setSortBy,
    resetFilters,
  };

  return (
    <div className="min-w-0 space-y-4">
      <JobsPageHeader
        isSyncing={isSyncing}
        activeSyncPlatform={activeSyncPlatform}
        onSyncAll={runManualSyncAll}
        onSyncPlatform={runManualSyncPlatform}
        onOpenSaveModal={openSaveModal}
      />

      {jobs.length === 0 ? (
        <JobsEmptyStateCard
          isSyncing={isSyncing}
          activeSyncPlatform={activeSyncPlatform}
          onSyncAll={runManualSyncAll}
          onSyncPlatform={runManualSyncPlatform}
          onOpenSaveModal={openSaveModal}
        />
      ) : null}

      {jobs.length > 0 ? (
        <Card className="space-y-4">
          <JobsFiltersCard
            filters={filters}
            actions={filterActions}
            rowsCount={rows.length}
            totalJobs={viewFilteredJobs.length}
            lastSyncAt={lastSyncAt}
            syncMessage={syncMessage}
            syncError={syncError}
            syncDiagnostics={syncDiagnostics}
            syncRecoveryGuide={syncRecoveryGuide}
            syncSourceResults={syncSourceResults}
            sourceCounts={sourceCounts}
          />
          <JobsTable
            data={rows}
            selectedIds={compareIds}
            onToggleSelect={toggleCompare}
          />
        </Card>
      ) : null}

      {jobs.length > 0 && dueFollowUps.length > 0 ? (
        <DueFollowUpsCard dueFollowUps={dueFollowUps} />
      ) : null}

      {jobs.length > 0 ? (
        <CompareShortlistCard
          compareRows={compareRows}
          onRemoveRow={(id) => toggleCompare(id, false)}
          onClear={() => setCompareIds([])}
        />
      ) : null}

      {isSaveModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeSaveModal();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-posting-modal-title"
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 id="save-posting-modal-title" className="text-xl font-semibold">
                  Save Job Posting
                </h3>
                <p className="text-sm text-slate-500">
                  Paste URL and description, auto-fill fields, then save without
                  leaving this page.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={closeSaveModal}>
                Close
              </Button>
            </div>

            <NewJobClient navigateToDetail={false} onSaved={handleSavedFromModal} />
          </div>
        </div>
      ) : null}

      {syncToast ? (
        <div className="pointer-events-none fixed right-4 top-4 z-50 w-full max-w-sm px-3 sm:px-0">
          <div
            className="pointer-events-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 shadow-lg dark:border-amber-900 dark:bg-amber-950/80 dark:text-amber-200"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="leading-5">{syncToast.message}</p>
              <button
                type="button"
                onClick={dismissSyncToast}
                className="shrink-0 rounded border border-amber-300 px-2 py-0.5 text-xs font-medium hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-700 dark:hover:bg-amber-900"
                aria-label="Dismiss sync notice"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
