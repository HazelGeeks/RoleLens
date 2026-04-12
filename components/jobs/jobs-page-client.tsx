"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { JobsTable, type JobRow } from "@/components/jobs/jobs-table";
import {
  getJobsFromStorage,
  LOCAL_JOBS_STORAGE_KEY,
  LOCAL_JOBS_UPDATED_EVENT,
  type JobStatus,
  type JobSource,
  type RemoteType,
} from "@/lib/local-jobs";
import {
  remoteTypeLabels,
  remoteTypeOptions,
  sourceLabels,
  sourceOptions,
  statusLabels,
  statusOptions,
} from "@/lib/constants";
import { formatCurrency } from "@/lib/presentation";
import {
  getLastFeedSyncAt,
  getLastFeedSyncSummary,
  shouldAutoSyncToday,
  syncJobsFromFeeds,
} from "@/lib/feed-sync";
import type { FeedSourceResult } from "@/lib/feed-types";

export function JobsPageClient() {
  const [jobs, setJobs] = useState(() => getJobsFromStorage());
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
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncSourceResults, setSyncSourceResults] = useState<
    FeedSourceResult[]
  >([]);

  const runFeedSync = useCallback(
    async (options?: { silent?: boolean; refresh?: boolean }) => {
      setIsSyncing(true);
      setSyncError(null);

      if (!options?.silent) {
        setSyncMessage(null);
      }

      try {
        const result = await syncJobsFromFeeds({ refresh: options?.refresh });
        setJobs(getJobsFromStorage());
        setLastSyncAt(result.syncedAt);
        setSyncSourceResults(result.sourceResults);
        setSyncMessage(
          `Synced ${result.totalImported} postings (${result.added} new, ${result.updated} updated) from ${result.sourceCount} source(s) at ${new Date(result.syncedAt).toLocaleString()}.`,
        );

        if (result.errors.length > 0) {
          setSyncError(
            `${result.errors.length} source(s) failed. Retry sync once, then check source configuration and endpoint availability.`,
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to sync feed sources";
        setSyncError(
          `${message}. Recovery: retry sync. If it keeps failing, verify feed URLs and environment settings.`,
        );
      } finally {
        setIsSyncing(false);
      }
    },
    [],
  );

  useEffect(() => {
    const handleJobsUpdated = () => {
      setJobs(getJobsFromStorage());
    };

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === LOCAL_JOBS_STORAGE_KEY) {
        handleJobsUpdated();
      }
    };

    window.addEventListener(
      LOCAL_JOBS_UPDATED_EVENT,
      handleJobsUpdated as EventListener,
    );
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      window.removeEventListener(
        LOCAL_JOBS_UPDATED_EVENT,
        handleJobsUpdated as EventListener,
      );
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, []);

  useEffect(() => {
    setLastSyncAt(getLastFeedSyncAt());
    const lastSummary = getLastFeedSyncSummary();
    if (lastSummary) {
      setSyncSourceResults(lastSummary.sourceResults);
      setSyncMessage(
        `Last sync imported ${lastSummary.totalImported} postings from ${lastSummary.sourceCount} source(s).`,
      );
      if (lastSummary.errors.length > 0) {
        setSyncError(
          `${lastSummary.errors.length} source(s) failed in the last sync. Retry sync and check source settings if needed.`,
        );
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

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Job Postings</h2>
          <p className="text-sm text-slate-500">
            Search, filter, sort, and track your frontend application pipeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void runFeedSync({ refresh: true })}
            disabled={isSyncing}
          >
            {isSyncing ? "Syncing..." : "Sync Sources"}
          </Button>
          <Link href="/jobs/new">
            <Button>Save New Posting</Button>
          </Link>
        </div>
      </header>

      <Card>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_repeat(5,minmax(0,1fr))]">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search role, company, skills, next action"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as JobStatus | "ALL")}
            aria-label="Filter by status"
          >
            <option value="ALL">All Status</option>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </Select>
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value as JobSource | "ALL")}
            aria-label="Filter by source"
          >
            <option value="ALL">All Source</option>
            {sourceOptions.map((value) => (
              <option key={value} value={value}>
                {sourceLabels[value]}
              </option>
            ))}
          </Select>
          <Select
            value={remoteType}
            onChange={(e) =>
              setRemoteType(e.target.value as RemoteType | "ALL")
            }
            aria-label="Filter by remote type"
          >
            <option value="ALL">All Work Type</option>
            {remoteTypeOptions.map((value) => (
              <option key={value} value={value}>
                {remoteTypeLabels[value]}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            min={0}
            max={100}
            value={minFit}
            onChange={(e) => setMinFit(e.target.value)}
            placeholder="Min fit"
            aria-label="Minimum fit score"
          />
          <Input
            value={requiredSkill}
            onChange={(e) => setRequiredSkill(e.target.value)}
            placeholder="Required skill"
            aria-label="Filter by required skill"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <p>
            Showing {rows.length} of {jobs.length} postings
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={resetFilters}
            >
              Reset Filters
            </Button>
            <span>
              {lastSyncAt
                ? `Last sync: ${new Date(lastSyncAt).toLocaleString()}`
                : "No sync yet"}
            </span>
          </div>
        </div>
        {syncMessage ? (
          <p
            className="mt-2 text-sm text-slate-600 dark:text-slate-300"
            role="status"
            aria-live="polite"
          >
            {syncMessage}
          </p>
        ) : null}
        {syncError ? (
          <div
            className="mt-1 rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
            role="alert"
          >
            <p>{syncError}</p>
            <p className="mt-1 text-xs">
              Recovery actions: retry Sync Sources, then verify feed URLs and
              source-related environment settings.
            </p>
          </div>
        ) : null}
        {syncSourceResults.length > 0 ? (
          <div
            className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
            role="status"
            aria-live="polite"
          >
            <h3 className="text-sm font-semibold">Latest Sync Results</h3>
            <p className="mt-1 text-xs text-slate-500">
              Source-level success and failure details.
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
              {syncSourceResults.map((result) => (
                <div
                  key={result.source}
                  className="rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{result.source}</span>
                    <span
                      className={
                        result.ok
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-rose-700 dark:text-rose-300"
                      }
                    >
                      {result.ok
                        ? `Success (${result.importedJobs})`
                        : "Failed"}
                    </span>
                  </div>
                  {result.message ? (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {result.message}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      {jobs.length === 0 ? (
        <Card className="space-y-3" role="status" aria-live="polite">
          <h3 className="text-base font-semibold">No saved postings yet</h3>
          <p className="text-sm text-slate-500">
            Start from an empty workspace. Sample data is not auto-loaded in
            this environment.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/jobs/new">
              <Button>Save New Posting</Button>
            </Link>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void runFeedSync({ refresh: true })}
              disabled={isSyncing}
            >
              {isSyncing ? "Syncing..." : "Sync Sources"}
            </Button>
          </div>
        </Card>
      ) : null}

      {jobs.length > 0 && dueFollowUps.length > 0 ? (
        <Card className="space-y-3">
          <h3 className="text-base font-semibold">Follow-up Due</h3>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {dueFollowUps.map((job) => (
              <div
                key={job.id}
                className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{job.title}</p>
                  <span className="text-xs font-semibold">
                    {job.followUpDate}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {job.company}
                </p>
                <p className="mt-1 text-xs">
                  Next: {job.nextAction || "No next action set"}
                </p>
                <Link
                  href={`/jobs?id=${encodeURIComponent(job.id)}`}
                  className="mt-2 inline-flex text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300"
                >
                  Open detail
                </Link>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {jobs.length > 0 ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold">Compare Shortlist</h3>
            <p className="text-xs text-slate-500">
              Select up to 3 rows to compare
            </p>
          </div>

          {compareRows.length < 2 ? (
            <p className="text-sm text-slate-500">
              Choose at least 2 postings in the table to compare key fields.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-100/80 dark:bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Fit</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Salary</th>
                    <th className="px-3 py-2 font-medium">Follow-up</th>
                    <th className="px-3 py-2 font-medium">Next Action</th>
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-slate-200 dark:border-slate-800"
                    >
                      <td className="px-3 py-2 align-top">
                        <p className="font-medium">{row.title}</p>
                        <p className="text-xs text-slate-500">{row.company}</p>
                      </td>
                      <td className="px-3 py-2 align-top font-semibold">
                        {row.fitScore ?? "-"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {statusLabels[row.status]}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {formatCurrency(
                          row.salaryMin,
                          row.salaryCurrency || "CAD",
                        )}{" "}
                        -{" "}
                        {formatCurrency(
                          row.salaryMax,
                          row.salaryCurrency || "CAD",
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {row.followUpDate || "-"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {row.nextAction || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
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
