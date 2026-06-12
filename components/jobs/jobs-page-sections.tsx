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
import {
  feedPlatformLabels,
  type FeedPlatform,
} from "@/lib/feed-platform";
import type { JobRow } from "@/components/jobs/jobs-table";
import {
  jobsSortLabels,
  jobsSortOptions,
  type JobsSortOption,
} from "@/lib/jobs-sort";
import styles from "./jobs-page-sections.module.css";

const DEFAULT_OPERATIONAL_CHECKLIST = [
  "Local dev: /api/jobs/import automatically falls back to /api/jobs/local-python-scraped-feed when PYTHON_SCRAPED_FEED_URL is empty.",
  "To use a hosted crawler output locally, set PYTHON_SCRAPED_FEED_URL in .env.local.",
  "Cloudflare Pages: set PYTHON_SCRAPED_FEED_URL for both Production and Preview.",
  "Use PYTHON_SCRAPED_FEED_URL as the ingestion source in deployed environments.",
  "Restart next dev (local) after env changes or redeploy the target environment (Cloudflare).",
  "Call /api/jobs/import?refresh=1, then retry Sync All Feeds (or a platform sync button) in the Jobs page.",
];

type JobsPageHeaderProps = {
  isSyncing: boolean;
  activeSyncPlatform: FeedPlatform | null;
  onSyncAll: () => void;
  onSyncPlatform: (platform: Exclude<FeedPlatform, "all">) => void;
  onOpenSaveModal: () => void;
};

const PLATFORM_BUTTONS: Array<Exclude<FeedPlatform, "all">> = [
  "indeed",
  "linkedin",
  "saramin",
  "jobkorea",
];

export function JobsPageHeader({
  isSyncing,
  activeSyncPlatform,
  onSyncAll,
  onSyncPlatform,
  onOpenSaveModal,
}: JobsPageHeaderProps) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h2 className="text-xl font-semibold">Job Postings</h2>
        <p className="text-sm text-slate-500">
          Search, filter, sort, and track your frontend application pipeline.
        </p>
      </div>
      <div className={styles.pageActions}>
        <div className={styles.primaryActions}>
          <Button
            type="button"
            variant="secondary"
            onClick={onSyncAll}
            disabled={isSyncing}
          >
            {isSyncing && activeSyncPlatform === "all" ? "Syncing..." : "Sync all"}
          </Button>
          <Button type="button" onClick={onOpenSaveModal}>
            Save new
          </Button>
        </div>
        <div className={styles.platformActions} aria-label="Platform sync actions">
          {PLATFORM_BUTTONS.map((platform) => (
            <Button
              key={platform}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onSyncPlatform(platform)}
              disabled={isSyncing}
            >
              {isSyncing && activeSyncPlatform === platform
                ? "Syncing..."
                : feedPlatformLabels[platform]}
            </Button>
          ))}
        </div>
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
  sortBy: JobsSortOption;
};

type JobsFilterActions = {
  setQ: (value: string) => void;
  setStatus: (value: JobStatus | "ALL") => void;
  setSource: (value: JobSource | "ALL") => void;
  setRemoteType: (value: RemoteType | "ALL") => void;
  setMinFit: (value: string) => void;
  setRequiredSkill: (value: string) => void;
  setSortBy: (value: JobsSortOption) => void;
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
  syncDiagnostics: FeedImportDiagnostics;
  syncRecoveryGuide: string[];
  syncSourceResults: FeedSourceResult[];
  sourceCounts: Record<JobSource, number>;
};

export function JobsFiltersCard({
  filters,
  actions,
  rowsCount,
  totalJobs,
  lastSyncAt,
  syncMessage,
  syncError,
  syncDiagnostics,
  syncRecoveryGuide,
  syncSourceResults,
  sourceCounts,
}: JobsFiltersCardProps) {
  const operationalChecklist =
    syncRecoveryGuide.length > 0
      ? syncRecoveryGuide
      : DEFAULT_OPERATIONAL_CHECKLIST;

  return (
    <section className={styles.filtersSection} aria-label="Jobs filters">
      <div className={styles.filtersToolbar}>
        <div>
          <p className={styles.filtersEyebrow}>Filters</p>
          <p className={styles.filtersCount}>
            Showing <strong>{rowsCount}</strong> of {totalJobs} postings
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={actions.resetFilters}
        >
          Reset Filters
        </Button>
      </div>

      <div className={styles.filtersGrid}>
        <label className={`${styles.filterField} ${styles.filterSearch}`}>
          <span>Search</span>
          <Input
            value={filters.q}
            onChange={(event) => actions.setQ(event.target.value)}
            placeholder="Role, company, skills, next action"
          />
        </label>
        <label className={styles.filterField}>
          <span>Status</span>
          <Select
            value={filters.status}
            onChange={(event) =>
              actions.setStatus(event.target.value as JobStatus | "ALL")
            }
          >
            <option value="ALL">All Status</option>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </Select>
        </label>
        <label className={styles.filterField}>
          <span>Source</span>
          <Select
            value={filters.source}
            onChange={(event) =>
              actions.setSource(event.target.value as JobSource | "ALL")
            }
          >
            <option value="ALL">All Source</option>
            {sourceOptions.map((value) => (
              <option key={value} value={value}>
                {sourceLabels[value]} ({sourceCounts[value]})
              </option>
            ))}
          </Select>
        </label>
        <label className={styles.filterField}>
          <span>Work Type</span>
          <Select
            value={filters.remoteType}
            onChange={(event) =>
              actions.setRemoteType(event.target.value as RemoteType | "ALL")
            }
          >
            <option value="ALL">All Work Type</option>
            {remoteTypeOptions.map((value) => (
              <option key={value} value={value}>
                {remoteTypeLabels[value]}
              </option>
            ))}
          </Select>
        </label>
        <label className={styles.filterField}>
          <span>Min Fit</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={filters.minFit}
            onChange={(event) => actions.setMinFit(event.target.value)}
            placeholder="0-100"
          />
        </label>
        <label className={`${styles.filterField} ${styles.filterSkill}`}>
          <span>Required Skill</span>
          <Input
            value={filters.requiredSkill}
            onChange={(event) => actions.setRequiredSkill(event.target.value)}
            placeholder="React, TypeScript, Next.js"
          />
        </label>
        <label className={styles.filterField}>
          <span>Sort</span>
          <Select
            value={filters.sortBy}
            onChange={(event) =>
              actions.setSortBy(event.target.value as JobsSortOption)
            }
          >
            {jobsSortOptions.map((value) => (
              <option key={value} value={value}>
                {jobsSortLabels[value]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {syncMessage ? (
        <p
          className={styles.syncNotice}
          role="status"
          aria-live="polite"
        >
          {syncMessage}
        </p>
      ) : null}

      {filters.source !== "ALL" && sourceCounts[filters.source] === 0 ? (
        <p
          className={styles.warningNotice}
          role="status"
          aria-live="polite"
        >
          No {sourceLabels[filters.source]} postings are available yet. Run
          platform sync for {sourceLabels[filters.source]} or switch source
          filter to All Source.
        </p>
      ) : null}

      {syncError ? (
        <div
          className={styles.errorNotice}
          role="alert"
        >
          <p>{syncError}</p>
        </div>
      ) : null}

      {syncError ? (
        <div className={styles.checklistPanel}>
          <p>Operational Checklist</p>
          <ol>
            {operationalChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {(lastSyncAt || syncSourceResults.length > 0) ? (
        <details className={styles.syncDetails}>
          <summary>
            Sync details (optional)
          </summary>
          <div className={styles.syncDetailsBody}>
            <p className={styles.syncTimestamp}>
              {lastSyncAt
                ? `Last sync: ${new Date(lastSyncAt).toLocaleString()}`
                : "No sync yet"}
            </p>
            <div className={styles.diagnosticsPanel}>
              <p>Sync Diagnostics</p>
              <p>
                Python scraped feed:{" "}
                {syncDiagnostics.python.scrapedFeedConfigured ? "yes" : "no"}{" "}
                (configured total {syncDiagnostics.python.configuredSourceCount})
              </p>
              <p>Final sourceCount: {syncDiagnostics.sourceCount}</p>
            </div>

            {syncSourceResults.length > 0 ? (
              <div
                className={styles.latestSyncPanel}
                role="status"
                aria-live="polite"
              >
                <h3>Latest Sync Results</h3>
                <p>
                  Source-level success and failure details.
                </p>
                <div className={styles.syncResultsGrid}>
                  {syncSourceResults.map((result) => (
                    <div
                      key={result.source}
                      className={styles.syncResultItem}
                    >
                      <div>
                        <span>{result.source}</span>
                        <span
                          className={
                            result.ok
                              ? styles.syncResultSuccess
                              : styles.syncResultFailed
                          }
                        >
                          {result.ok ? `Success (${result.importedJobs})` : "Failed"}
                        </span>
                      </div>
                      {result.message ? (
                        <p>
                          {result.message}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}

type JobsEmptyStateCardProps = {
  isSyncing: boolean;
  activeSyncPlatform: FeedPlatform | null;
  onSyncAll: () => void;
  onSyncPlatform: (platform: Exclude<FeedPlatform, "all">) => void;
  onOpenSaveModal: () => void;
};

export function JobsEmptyStateCard({
  isSyncing,
  activeSyncPlatform,
  onSyncAll,
  onSyncPlatform,
  onOpenSaveModal,
}: JobsEmptyStateCardProps) {
  return (
    <Card className="space-y-3" role="status" aria-live="polite">
      <h3 className="text-base font-semibold">No saved postings yet</h3>
      <p className="text-sm text-slate-500">
        Start from an empty workspace. Sample data is not auto-loaded in this
        environment.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onOpenSaveModal}>
          Save New Posting
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onSyncAll}
          disabled={isSyncing}
        >
          {isSyncing && activeSyncPlatform === "all"
            ? "Syncing all..."
            : "Sync All Feeds"}
        </Button>
        {PLATFORM_BUTTONS.map((platform) => (
          <Button
            key={platform}
            type="button"
            variant="secondary"
            onClick={() => onSyncPlatform(platform)}
            disabled={isSyncing}
          >
            {isSyncing && activeSyncPlatform === platform
              ? "Syncing " + feedPlatformLabels[platform] + "..."
              : "Sync " + feedPlatformLabels[platform]}
          </Button>
        ))}
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
  onRemoveRow: (id: string) => void;
  onClear: () => void;
};

export function CompareShortlistCard({
  compareRows,
  onRemoveRow,
  onClear,
}: CompareShortlistCardProps) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Compare Shortlist</h3>
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-500">Selected {compareRows.length} / 3</p>
          {compareRows.length > 0 ? (
            <Button type="button" variant="secondary" size="sm" onClick={onClear}>
              Clear all
            </Button>
          ) : null}
        </div>
      </div>

      {compareRows.length < 2 ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">
            Choose at least 2 postings in the table to compare key fields.
          </p>
          {compareRows.length > 0 ? (
            <ul className="space-y-2">
              {compareRows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
                >
                  <span>
                    {row.title} <span className="text-slate-500">· {row.company}</span>
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onRemoveRow(row.id)}
                    aria-label={`Remove ${row.title} at ${row.company} from compare shortlist`}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-100/80 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Fit</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Salary</th>
                <th className="px-3 py-2 font-medium">Follow-up</th>
                <th className="px-3 py-2 font-medium">Remove</th>
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
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onRemoveRow(row.id)}
                      aria-label={`Remove ${row.title} at ${row.company} from compare shortlist`}
                    >
                      Remove
                    </Button>
                  </td>
                  <td className="px-3 py-2 align-top">{row.nextAction || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
