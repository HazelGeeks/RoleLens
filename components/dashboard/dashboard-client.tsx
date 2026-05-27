"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  FocusSkillChart,
  SkillBarChart,
  SourcePieChart,
} from "@/components/dashboard/charts";
import {
  sourceLabels,
  sourceOptions,
  statusLabels,
  statusOptions,
} from "@/lib/constants";
import { upsertJob, type LocalJobPosting } from "@/lib/local-jobs";
import {
  isPersistenceNotFoundError,
  mirrorLocalJobToPersistence,
  patchPersistentJobClient,
  toLocalJobFromPersistent,
} from "@/lib/persistence-client";
import { useLiveLocalJobs } from "@/lib/use-live-local-jobs";
import { useAuth } from "@/components/providers/auth-provider";
import {
  calculateDashboardStats,
  countMapToArray,
  filterSavedJobs,
  formatUpdatedAt,
} from "@/components/dashboard/dashboard-utils";

type SourceFilterValue = "ALL" | (typeof sourceOptions)[number];

function DashboardAuthRequiredModal() {
  return (
    <div className="relative min-h-[65vh]">
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-2xl bg-slate-900/20 backdrop-blur-[1px] dark:bg-slate-950/40"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-auth-required-title"
        aria-describedby="dashboard-auth-required-description"
        className="relative mx-auto mt-16 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950"
      >
        <h2 id="dashboard-auth-required-title" className="text-xl font-semibold">
          Dashboard access requires login
        </h2>
        <p
          id="dashboard-auth-required-description"
          className="mt-2 text-sm text-slate-600 dark:text-slate-300"
        >
          This dashboard is available only to signed-in members. Please login or
          create an account to continue.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link href="/login" className="w-full">
            <Button className="w-full">Login</Button>
          </Link>
          <Link href="/signup" className="w-full">
            <Button variant="secondary" className="w-full">
              Sign up
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

export function DashboardClient() {
  const { jobs, refreshJobs } = useLiveLocalJobs();
  const { status, user } = useAuth();

  const savedJobs = useMemo(
    () => jobs.filter((job) => job.status === "SAVE"),
    [jobs],
  );
  const sortedSavedJobs = useMemo(
    () => [...savedJobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [savedJobs],
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>("ALL");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<(typeof statusOptions)[number]>(
    "INTEREST",
  );
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [bulkFailures, setBulkFailures] = useState<string[]>([]);

  const filteredSavedJobs = useMemo(
    () => filterSavedJobs(sortedSavedJobs, searchTerm, sourceFilter),
    [searchTerm, sourceFilter, sortedSavedJobs],
  );

  useEffect(() => {
    const visibleIdSet = new Set(filteredSavedJobs.map((job) => job.id));
    setSelectedIds((prev) => prev.filter((id) => visibleIdSet.has(id)));
  }, [filteredSavedJobs]);

  const stats = useMemo(() => calculateDashboardStats(savedJobs), [savedJobs]);

  const selectedCount = selectedIds.length;
  const isAllSavedSelected =
    filteredSavedJobs.length > 0 && selectedCount === filteredSavedJobs.length;

  const clearBulkMessages = () => {
    setBulkError(null);
    setBulkNotice(null);
    setBulkFailures([]);
  };

  const toggleSavedJobSelection = (jobId: string, checked: boolean) => {
    clearBulkMessages();
    setSelectedIds((prev) => {
      if (checked) {
        if (prev.includes(jobId)) return prev;
        return [...prev, jobId];
      }
      return prev.filter((id) => id !== jobId);
    });
  };

  const applyStatusToJob = async (
    sourceJob: LocalJobPosting,
    nextStatus: (typeof statusOptions)[number],
  ) => {
    if (sourceJob.status === nextStatus) {
      return false;
    }

    let localJob = sourceJob;

    if (!localJob.persistentId) {
      const persisted = await mirrorLocalJobToPersistence(localJob);
      localJob = toLocalJobFromPersistent(persisted, localJob);
      upsertJob(localJob);
    }

    try {
      const updated = await patchPersistentJobClient(localJob.persistentId as string, {
        op: "status",
        expectedVersion: localJob.persistentVersion,
        status: nextStatus,
      });

      upsertJob(toLocalJobFromPersistent(updated, localJob));
      return true;
    } catch (error) {
      if (!isPersistenceNotFoundError(error)) {
        throw error;
      }

      const detachedJob: LocalJobPosting = {
        ...localJob,
        persistentId: undefined,
        persistentVersion: undefined,
      };

      const recreated = await mirrorLocalJobToPersistence(detachedJob, {
        clientRequestId: `recovery:${sourceJob.id}:${crypto.randomUUID()}`,
      });
      const recreatedLocal = toLocalJobFromPersistent(recreated, detachedJob);
      upsertJob(recreatedLocal);

      const updated = await patchPersistentJobClient(recreated.id, {
        op: "status",
        expectedVersion: recreated.version,
        status: nextStatus,
      });

      upsertJob(toLocalJobFromPersistent(updated, recreatedLocal));
      return true;
    }
  };

  const applyBulkStatus = async () => {
    if (selectedCount === 0) {
      setBulkNotice(null);
      setBulkFailures([]);
      setBulkError("Select at least one saved posting first.");
      return;
    }

    clearBulkMessages();
    setIsApplyingBulk(true);

    let updatedCount = 0;
    let skippedCount = 0;
    const failures: string[] = [];

    const selectedSet = new Set(selectedIds);
    const targetJobs = filteredSavedJobs.filter((job) => selectedSet.has(job.id));

    for (const job of targetJobs) {
      try {
        const changed = await applyStatusToJob(job, bulkStatus);
        if (changed) {
          updatedCount += 1;
        } else {
          skippedCount += 1;
        }
      } catch (error) {
        const base = `${job.title} at ${job.company}`;
        const message =
          error instanceof Error && error.message
            ? `${base} (${error.message})`
            : base;
        failures.push(message);
      }
    }

    await refreshJobs();
    setSelectedIds([]);

    if (updatedCount > 0) {
      setBulkNotice(
        `${updatedCount} posting${updatedCount > 1 ? "s" : ""} updated to ${statusLabels[bulkStatus]}.`,
      );
    } else if (skippedCount > 0 && failures.length === 0) {
      setBulkNotice(
        `No status changed. Selected posting${skippedCount > 1 ? "s are" : " is"} already ${statusLabels[bulkStatus]}.`,
      );
    }

    if (failures.length > 0) {
      setBulkError(
        `Failed to update ${failures.length} posting${failures.length > 1 ? "s" : ""}.`,
      );
      setBulkFailures(failures);
    }

    setIsApplyingBulk(false);
  };

  if (status === "loading") {
    return (
      <Card role="status" aria-live="polite" className="mx-auto mt-16 max-w-md">
        <CardTitle>Checking session...</CardTitle>
        <CardDescription>
          We are verifying your account session before opening the dashboard.
        </CardDescription>
      </Card>
    );
  }

  if (!user) {
    return <DashboardAuthRequiredModal />;
  }

  if (savedJobs.length === 0) {
    return (
      <div className="space-y-4">
        <header>
          <h2 className="text-2xl font-semibold">Analytics Dashboard</h2>
          <p className="text-sm text-slate-500">
            {user.name}, your personalized metrics are ready once postings are synced.
          </p>
        </header>

        <Card className="space-y-3" role="status" aria-live="polite">
          <CardTitle>No data to analyze yet</CardTitle>
          <CardDescription>
            Only postings with status Save are included in dashboard metrics. Set
            status to Save from the Jobs page to include it here.
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <Link href="/jobs/new">
              <Button>Save New Posting</Button>
            </Link>
            <Link href="/">
              <Button variant="secondary">Open Jobs List</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Analytics Dashboard for {user.name}</h2>
        <p className="text-sm text-slate-500">
          Monitor your application momentum and demand signals from tracked postings.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Card>
          <p className="text-sm text-slate-500">Saved Postings</p>
          <p className="text-3xl font-semibold">{stats.totalJobs}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Average Fit</p>
          <p className="text-3xl font-semibold">{stats.avgFitScore}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">React Postings</p>
          <p className="text-3xl font-semibold">
            {stats.focusSkills.find((s) => s.name === "react")?.count ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">TypeScript Postings</p>
          <p className="text-3xl font-semibold">
            {stats.focusSkills.find((s) => s.name === "typescript")?.count ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Sources Covered</p>
          <p className="text-3xl font-semibold">{stats.sourceVariety}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Follow-ups Due</p>
          <p className="text-3xl font-semibold">{stats.dueFollowUps}</p>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="space-y-1">
          <CardTitle>Saved postings list and bulk update</CardTitle>
          <CardDescription>
            Review what is currently saved and update status for multiple postings
            at once.
          </CardDescription>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="space-y-1 lg:col-span-2">
            <label htmlFor="dashboard-save-search" className="text-sm font-medium">
              Search saved postings
            </label>
            <input
              id="dashboard-save-search"
              type="search"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                clearBulkMessages();
              }}
              placeholder="Title, company, location"
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="dashboard-save-source" className="text-sm font-medium">
              Source
            </label>
            <select
              id="dashboard-save-source"
              value={sourceFilter}
              onChange={(event) => {
                setSourceFilter(event.target.value as SourceFilterValue);
                clearBulkMessages();
              }}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="ALL">All sources</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {sourceLabels[source]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <p aria-live="polite">
            Showing {filteredSavedJobs.length} of {savedJobs.length} saved postings
          </p>
          {(searchTerm || sourceFilter !== "ALL") && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setSourceFilter("ALL");
                clearBulkMessages();
              }}
              disabled={isApplyingBulk}
            >
              Reset filters
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSelectedIds(filteredSavedJobs.map((job) => job.id))}
              disabled={filteredSavedJobs.length === 0 || isApplyingBulk}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSelectedIds([])}
              disabled={selectedCount === 0 || isApplyingBulk}
            >
              Clear selection
            </Button>
            <p className="text-sm text-slate-500" aria-live="polite">
              {selectedCount} selected
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="dashboard-bulk-status" className="text-sm font-medium">
                Change status to
              </label>
              <select
                id="dashboard-bulk-status"
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={bulkStatus}
                onChange={(event) =>
                  setBulkStatus(event.target.value as (typeof statusOptions)[number])
                }
                disabled={isApplyingBulk}
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {statusLabels[option]}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              onClick={() => {
                void applyBulkStatus();
              }}
              disabled={selectedCount === 0 || isApplyingBulk}
            >
              {isApplyingBulk ? "Applying..." : "Apply to selected"}
            </Button>
          </div>
        </div>

        {bulkError ? (
          <p className="text-sm text-rose-600 dark:text-rose-300" role="alert">
            {bulkError}
          </p>
        ) : null}
        {bulkFailures.length > 0 ? (
          <details className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm dark:border-rose-900 dark:bg-rose-950/30">
            <summary className="cursor-pointer font-medium text-rose-700 dark:text-rose-300">
              View failed postings ({bulkFailures.length})
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-rose-700 dark:text-rose-300">
              {bulkFailures.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        ) : null}
        {bulkNotice ? (
          <p
            className="text-sm text-emerald-700 dark:text-emerald-300"
            role="status"
            aria-live="polite"
          >
            {bulkNotice}
          </p>
        ) : null}

        <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {filteredSavedJobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">
              No saved postings match the current filters.
            </div>
          ) : (
            filteredSavedJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(job.id)}
                      onChange={(event) =>
                        toggleSavedJobSelection(job.id, event.target.checked)
                      }
                      aria-label={`Select ${job.title} at ${job.company}`}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {job.title}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {job.company}
                        {job.location ? ` · ${job.location}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {sourceLabels[job.source]} · Updated {formatUpdatedAt(job.updatedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {statusLabels[job.status]}
                    </span>
                    <Link href={`/jobs?id=${encodeURIComponent(job.id)}`}>
                      <Button type="button" size="sm" variant="secondary">
                        Open
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sr-only" aria-live="polite">
          {isAllSavedSelected
            ? "All visible saved postings selected"
            : `${selectedCount} visible saved postings selected`}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Top Skills</CardTitle>
          <CardDescription>
            Most frequent skill keywords across saved postings.
          </CardDescription>
          <SkillBarChart data={stats.topSkills} />
        </Card>
        <Card>
          <CardTitle>Source Distribution</CardTitle>
          <CardDescription>
            Where your job opportunities come from.
          </CardDescription>
          <SourcePieChart data={countMapToArray(stats.sourceCounts)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardTitle>Focus Skill Frequency</CardTitle>
          <FocusSkillChart data={stats.focusSkills} />
        </Card>
        <Card>
          <CardTitle>Status Pipeline</CardTitle>
          <CardDescription>
            Track execution flow from new to submission.
          </CardDescription>
          <div className="space-y-2 pt-2">
            {Object.entries(stats.statusCounts).map(([status, value]) => (
              <div
                key={status}
                className="flex items-center justify-between rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800"
              >
                <span>{statusLabels[status as keyof typeof statusLabels]}</span>
                <span className="font-semibold">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-2 text-sm dark:border-blue-900 dark:bg-blue-950/40">
              <span>Interest + Submitted</span>
              <span className="font-semibold">{stats.activePipeline}</span>
            </div>
          </div>
        </Card>
        <Card>
          <CardTitle>Remote / Hybrid / On-site</CardTitle>
          <div className="space-y-2 pt-2">
            {countMapToArray(stats.remoteCounts).map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800"
              >
                <span>{item.name}</span>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle>Seniority Distribution</CardTitle>
          <div className="space-y-2 pt-2">
            {countMapToArray(stats.seniorityCounts).map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800"
              >
                <span>{item.name}</span>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
