import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  remoteTypeLabels,
  remoteTypeOptions,
  sourceLabels,
  sourceOptions,
  statusLabels,
  statusOptions,
} from "@/lib/constants";
import { formatCurrency } from "@/lib/presentation";
import type {
  JobStatus,
  JobSource,
  LocalJobPosting,
  RemoteType,
} from "@/lib/local-jobs";
import type { FeedImportDiagnostics, FeedSourceResult } from "@/lib/feed-types";
import type { JobRow } from "@/components/jobs/jobs-table";

const DEFAULT_OPERATIONAL_CHECKLIST = [
  "Local dev: set at least one source in .env.local (copy from .env.example).",
  "Cloudflare Pages: set PYTHON_SCRAPED_FEED_URL for both Production and Preview.",
  "Use PYTHON_SCRAPED_FEED_URL as the single ingestion source (site-crawled JSON).",
  "Restart next dev (local) or redeploy the target environment (Cloudflare).",
  "Call /api/jobs/import?refresh=1, then retry Sync Crawled Feed in the Jobs page.",
];

type JobsPageHeaderProps = {
  isSyncing: boolean;
  onSync: () => void;
};

export function JobsPageHeader({ isSyncing, onSync }: JobsPageHeaderProps) {
  return (
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
          onClick={onSync}
          disabled={isSyncing}
        >
          {isSyncing ? "Syncing..." : "Sync Crawled Feed"}
        </Button>
        <Link href="/jobs/new">
          <Button>Save New Posting</Button>
        </Link>
      </div>
    </header>
  );
}

type JobsFilterState = {
  q: string;
  status: JobStatus | "ALL";
  source: JobSource | "ALL";
  remoteType: RemoteType | "ALL";
  minFit: string;
  requiredSkill: string;
};

type JobsFilterActions = {
  setQ: (value: string) => void;
  setStatus: (value: JobStatus | "ALL") => void;
  setSource: (value: JobSource | "ALL") => void;
  setRemoteType: (value: RemoteType | "ALL") => void;
  setMinFit: (value: string) => void;
  setRequiredSkill: (value: string) => void;
  resetFilters: () => void;
};

type JobsFiltersCardProps = {
  filters: JobsFilterState;
  actions: JobsFilterActions;
  rowsCount: number;
  totalJobs: number;
  lastSyncAt: string | null;
  syncMessage: string | null;
  syncError: string | null;
  syncWarning: string | null;
  syncDiagnostics: FeedImportDiagnostics;
  syncRecoveryGuide: string[];
  syncSourceResults: FeedSourceResult[];
};

export function JobsFiltersCard({
  filters,
  actions,
  rowsCount,
  totalJobs,
  lastSyncAt,
  syncMessage,
  syncError,
  syncWarning,
  syncDiagnostics,
  syncRecoveryGuide,
  syncSourceResults,
}: JobsFiltersCardProps) {
  const operationalChecklist =
    syncRecoveryGuide.length > 0
      ? syncRecoveryGuide
      : DEFAULT_OPERATIONAL_CHECKLIST;

  return (
    <Card>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_repeat(5,minmax(0,1fr))]">
        <Input
          value={filters.q}
          onChange={(event) => actions.setQ(event.target.value)}
          placeholder="Search role, company, skills, next action"
        />
        <Select
          value={filters.status}
          onChange={(event) =>
            actions.setStatus(event.target.value as JobStatus | "ALL")
          }
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
          value={filters.source}
          onChange={(event) =>
            actions.setSource(event.target.value as JobSource | "ALL")
          }
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
          value={filters.remoteType}
          onChange={(event) =>
            actions.setRemoteType(event.target.value as RemoteType | "ALL")
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
          value={filters.minFit}
          onChange={(event) => actions.setMinFit(event.target.value)}
          placeholder="Min fit"
          aria-label="Minimum fit score"
        />
        <Input
          value={filters.requiredSkill}
          onChange={(event) => actions.setRequiredSkill(event.target.value)}
          placeholder="Required skill"
          aria-label="Filter by required skill"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
        <p>
          Showing {rowsCount} of {totalJobs} postings
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={actions.resetFilters}
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
        </div>
      ) : null}

      {syncWarning ? (
        <div
          className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          role="status"
          aria-live="polite"
        >
          <p>{syncWarning}</p>
          <p className="mt-1 text-xs">
            You can continue with imported data, then retry sync after fixing
            the failed source settings.
          </p>
        </div>
      ) : null}

      {syncError || syncWarning ? (
        <div className="mt-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
          <p className="font-medium">Operational Checklist</p>
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
            {operationalChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="mt-2 rounded-lg border border-slate-200 p-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
        <p className="font-medium">Sync Diagnostics</p>
        <p className="mt-1">
          Python scraped feed:{" "}
          {syncDiagnostics.python.scrapedFeedConfigured ? "yes" : "no"}{" "}
          (configured total {syncDiagnostics.python.configuredSourceCount})
        </p>
        <p>Final sourceCount: {syncDiagnostics.sourceCount}</p>
      </div>

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
                    {result.ok ? `Success (${result.importedJobs})` : "Failed"}
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
  );
}

type JobsEmptyStateCardProps = {
  isSyncing: boolean;
  onSync: () => void;
};

export function JobsEmptyStateCard({
  isSyncing,
  onSync,
}: JobsEmptyStateCardProps) {
  return (
    <Card className="space-y-3" role="status" aria-live="polite">
      <h3 className="text-base font-semibold">No saved postings yet</h3>
      <p className="text-sm text-slate-500">
        Start from an empty workspace. Sample data is not auto-loaded in this
        environment.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/jobs/new">
          <Button>Save New Posting</Button>
        </Link>
        <Button
          type="button"
          variant="secondary"
          onClick={onSync}
          disabled={isSyncing}
        >
          {isSyncing ? "Syncing..." : "Sync Crawled Feed"}
        </Button>
      </div>
    </Card>
  );
}

type DueFollowUpsCardProps = {
  dueFollowUps: LocalJobPosting[];
};

export function DueFollowUpsCard({ dueFollowUps }: DueFollowUpsCardProps) {
  return (
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
              <span className="text-xs font-semibold">{job.followUpDate}</span>
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
  );
}

type CompareShortlistCardProps = {
  compareRows: JobRow[];
};

export function CompareShortlistCard({
  compareRows,
}: CompareShortlistCardProps) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Compare Shortlist</h3>
        <p className="text-xs text-slate-500">Select up to 3 rows to compare</p>
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
                    {formatCurrency(row.salaryMin, row.salaryCurrency || "CAD")}{" "}
                    -{" "}
                    {formatCurrency(row.salaryMax, row.salaryCurrency || "CAD")}
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
  );
}
