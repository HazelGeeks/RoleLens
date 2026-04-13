"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { JobsTable, type JobRow } from "@/components/jobs/jobs-table";
import {
  type JobStatus,
  type JobSource,
  type RemoteType,
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
import {
  CompareShortlistCard,
  DueFollowUpsCard,
  JobsEmptyStateCard,
  JobsFiltersCard,
  JobsPageHeader,
} from "@/components/jobs/jobs-page-sections";
import type { FeedImportDiagnostics } from "@/lib/feed-types";

const EMPTY_DIAGNOSTICS: FeedImportDiagnostics = {
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
};

export function JobsPageClient() {
  const { jobs, refreshJobs } = useLiveLocalJobs();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<JobStatus | "ALL">("ALL");
  const [source, setSource] = useState<JobSource | "ALL">("ALL");
  const [remoteType, setRemoteType] = useState<RemoteType | "ALL">("ALL");
  const [minFit, setMinFit] = useState("");
  const [requiredSkill, setRequiredSkill] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncSourceResults, setSyncSourceResults] = useState<
    FeedSourceResult[]
  >([]);
  const [syncDiagnostics, setSyncDiagnostics] = useState<FeedImportDiagnostics>(
    EMPTY_DIAGNOSTICS,
  );
  const [syncRecoveryGuide, setSyncRecoveryGuide] = useState<string[]>([]);

  const runFeedSync = useCallback(
    async (options?: { silent?: boolean; refresh?: boolean }) => {
      setIsSyncing(true);
      setSyncError(null);
      setSyncWarning(null);

      if (!options?.silent) {
        setSyncMessage(null);
      }

      try {
        const result = await syncJobsFromFeeds({ refresh: options?.refresh });
        refreshJobs();
        setLastSyncAt(result.syncedAt);
        setSyncSourceResults(result.sourceResults);
        setSyncDiagnostics(result.diagnostics);
        setSyncRecoveryGuide(result.recoveryGuide);
        setSyncMessage(
          `Synced ${result.totalImported} postings (${result.added} new, ${result.updated} updated) from ${result.sourceCount} source(s) at ${new Date(result.syncedAt).toLocaleString()}.`,
        );

        const alert = buildFeedSyncAlert({
          sourceCount: result.sourceCount,
          errors: result.errors,
          sourceResults: result.sourceResults,
        });

        if (alert?.level === "error") {
          setSyncError(alert.message);
          setSyncWarning(null);
        } else if (alert?.level === "warning") {
          setSyncWarning(alert.message);
          setSyncError(null);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to sync feed sources";
        setSyncWarning(null);
        setSyncError(
          `${message}. Recovery: retry sync. If it keeps failing, verify feed URLs and environment settings.`,
        );
      } finally {
        setIsSyncing(false);
      }
    },
    [refreshJobs],
  );

  useEffect(() => {
    setLastSyncAt(getLastFeedSyncAt());
    const lastSummary = getLastFeedSyncSummary();
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
        setSyncWarning(null);
      } else if (alert?.level === "warning") {
        setSyncWarning(alert.message);
        setSyncError(null);
      }
    }

    if (!shouldAutoSyncToday()) return;
    void runFeedSync({ silent: true });
  }, [runFeedSync]);

  const rows = useMemo(() => {
    const normalizedSkill = requiredSkill.trim().toLowerCase();
    const minFitValue = minFit ? Number(minFit) : null;

    return jobs
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
          createdAt: job.createdAt,
        }),
      );
  }, [jobs, minFit, q, remoteType, requiredSkill, source, status]);

  const dueFollowUps = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return jobs
      .filter((job) => !!job.followUpDate && job.followUpDate <= today)
      .filter((job) => job.status !== "CLOSED" && job.status !== "REJECTED")
      .sort((a, b) =>
        (a.followUpDate || "").localeCompare(b.followUpDate || ""),
      )
      .slice(0, 6);
  }, [jobs]);

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
  };

  const runManualSync = () => {
    void runFeedSync({ refresh: true });
  };

  const filters = {
    q,
    status,
    source,
    remoteType,
    minFit,
    requiredSkill,
  };

  const filterActions = {
    setQ,
    setStatus,
    setSource,
    setRemoteType,
    setMinFit,
    setRequiredSkill,
    resetFilters,
  };

  return (
    <div className="space-y-4">
      <JobsPageHeader isSyncing={isSyncing} onSync={runManualSync} />

      <JobsFiltersCard
        filters={filters}
        actions={filterActions}
        rowsCount={rows.length}
        totalJobs={jobs.length}
        lastSyncAt={lastSyncAt}
        syncMessage={syncMessage}
        syncError={syncError}
        syncWarning={syncWarning}
        syncDiagnostics={syncDiagnostics}
        syncRecoveryGuide={syncRecoveryGuide}
        syncSourceResults={syncSourceResults}
      />

      {jobs.length === 0 ? (
        <JobsEmptyStateCard isSyncing={isSyncing} onSync={runManualSync} />
      ) : null}

      {jobs.length > 0 && dueFollowUps.length > 0 ? (
        <DueFollowUpsCard dueFollowUps={dueFollowUps} />
      ) : null}

      {jobs.length > 0 ? (
        <CompareShortlistCard compareRows={compareRows} />
      ) : null}

      {jobs.length > 0 ? (
        <Card>
          <JobsTable
            data={rows}
            selectedIds={compareIds}
            onToggleSelect={toggleCompare}
          />
        </Card>
      ) : null}
    </div>
  );
}
