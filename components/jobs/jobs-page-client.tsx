"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Card } from "@/components/ui/card";
import { JobsTable } from "@/components/jobs/jobs-table";
import type { JobSource, JobStatus, RemoteType } from "@/lib/local-jobs";
import { useLiveLocalJobs } from "@/lib/use-live-local-jobs";
import type { JobsSortOption } from "@/lib/jobs-sort";
import {
  CompareShortlistCard,
  DueFollowUpsCard,
  JobsEmptyStateCard,
  JobsFiltersCard,
  JobsPageHeader,
} from "@/components/jobs/jobs-page-sections";
import {
  buildDueFollowUps,
  buildRows,
  buildSourceCounts,
  isJobInView,
  parseJobsViewFilter,
} from "@/components/jobs/jobs-page-utils";
import { SaveJobModal } from "@/components/jobs/save-job-modal";
import { SyncToast } from "@/components/jobs/sync-toast";
import { useJobsFeedSync } from "@/components/jobs/use-jobs-feed-sync";
import {
  LOCAL_JOBS_CLAIMED_EVENT,
  type LocalJobsClaimedDetail,
} from "@/lib/persistence-client";

type JobsNotice = {
  id: number;
  message: string;
};

export function JobsPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status: authStatus } = useAuth();
  const { jobs, persistenceError, refreshJobs } = useLiveLocalJobs();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<JobStatus | "ALL">("ALL");
  const [source, setSource] = useState<JobSource | "ALL">("ALL");
  const [remoteType, setRemoteType] = useState<RemoteType | "ALL">("ALL");
  const [minFit, setMinFit] = useState("");
  const [requiredSkill, setRequiredSkill] = useState("");
  const [sortBy, setSortBy] = useState<JobsSortOption>("SMART");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [jobsNotice, setJobsNotice] = useState<JobsNotice | null>(null);
  const [dismissedPersistenceError, setDismissedPersistenceError] = useState<string | null>(null);

  const {
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
  } = useJobsFeedSync(refreshJobs);

  const jobsView = useMemo(
    () => parseJobsViewFilter(searchParams.get("view")),
    [searchParams],
  );

  useEffect(() => {
    if (searchParams.get("save") !== "1") return;
    setIsSaveModalOpen(true);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("save");
    const nextQuery = nextParams.toString();
    const nextHref = nextQuery ? `${pathname}?${nextQuery}` : pathname;

    router.replace(nextHref, { scroll: false });
  }, [pathname, router, searchParams]);

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
    setStatus("ALL");
    setCompareIds([]);
  }, [jobsView]);

  useEffect(() => {
    const handleLocalJobsClaimed = (event: Event) => {
      const detail = (event as CustomEvent<LocalJobsClaimedDetail>).detail;
      if (!detail || detail.claimed <= 0) return;

      const failedSuffix =
        detail.failed > 0 ? ` ${detail.failed} item(s) need another retry.` : "";
      setJobsNotice({
        id: Date.now(),
        message:
          `${detail.claimed} local posting(s) are now linked to your account.` +
          failedSuffix,
      });
    };

    window.addEventListener(
      LOCAL_JOBS_CLAIMED_EVENT,
      handleLocalJobsClaimed as EventListener,
    );

    return () => {
      window.removeEventListener(
        LOCAL_JOBS_CLAIMED_EVENT,
        handleLocalJobsClaimed as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (!jobsNotice) return;

    const timeout = window.setTimeout(() => {
      setJobsNotice((current) =>
        current?.id === jobsNotice.id ? null : current,
      );
    }, 6000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [jobsNotice]);

  useEffect(() => {
    if (!persistenceError) {
      setDismissedPersistenceError(null);
    }
  }, [persistenceError]);

  const viewFilteredJobs = useMemo(
    () => jobs.filter((job) => isJobInView(job.status, jobsView)),
    [jobs, jobsView],
  );

  const rows = useMemo(
    () =>
      buildRows(viewFilteredJobs, {
        q,
        status,
        source,
        remoteType,
        minFit,
        requiredSkill,
        sortBy,
      }),
    [minFit, q, remoteType, requiredSkill, sortBy, source, status, viewFilteredJobs],
  );

  const sourceCounts = useMemo(
    () => buildSourceCounts(viewFilteredJobs),
    [viewFilteredJobs],
  );

  const dueFollowUps = useMemo(
    () => buildDueFollowUps(viewFilteredJobs),
    [viewFilteredJobs],
  );

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

      <SaveJobModal
        isOpen={isSaveModalOpen}
        onClose={closeSaveModal}
        onSaved={handleSavedFromModal}
      />

      {syncToast ? (
        <SyncToast message={syncToast.message} onDismiss={dismissSyncToast} />
      ) : null}

      {authStatus === "authenticated" &&
      persistenceError &&
      dismissedPersistenceError !== persistenceError ? (
        <SyncToast
          message={`Account postings could not be loaded. Showing this browser's local copy for now. ${persistenceError}`}
          onDismiss={() => setDismissedPersistenceError(persistenceError)}
        />
      ) : null}

      {jobsNotice ? (
        <SyncToast
          message={jobsNotice.message}
          onDismiss={() => setJobsNotice(null)}
        />
      ) : null}
    </div>
  );
}
