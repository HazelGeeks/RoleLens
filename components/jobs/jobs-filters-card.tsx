"use client";

import { useState } from "react";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
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
import type { JobStatus, JobSource, RemoteType } from "@/lib/local-jobs";
import type { FeedImportDiagnostics, FeedSourceResult } from "@/lib/feed-types";
import {
  jobsSortLabels,
  jobsSortOptions,
  type JobsSortOption,
} from "@/lib/jobs-sort";
import styles from "./jobs-page-sections.module.css";

const DEFAULT_OPERATIONAL_CHECKLIST = [
  "Post the latest normalized feed snapshot to /api/jobs/ingest so Supabase stores it.",
  "Confirm ROLELENS_CRON_SECRET matches the deployed CRON_SECRET.",
  "Confirm Supabase migrations are applied and feed_import_snapshots exists.",
  "Restart next dev (local) after env changes or redeploy the target environment (Cloudflare).",
  "Call /api/jobs/import, then retry Sync All Feeds in the Jobs page.",
];

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
  feedGeneratedAt: string | null;
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
  feedGeneratedAt,
  syncMessage,
  syncError,
  syncDiagnostics,
  syncRecoveryGuide,
  syncSourceResults,
  sourceCounts,
}: JobsFiltersCardProps) {
  const [areFiltersOpen, setAreFiltersOpen] = useState(false);
  const operationalChecklist =
    syncRecoveryGuide.length > 0
      ? syncRecoveryGuide
      : DEFAULT_OPERATIONAL_CHECKLIST;

  return (
    <section className={styles.filtersSection} aria-label="Jobs filters">
      <div className={styles.searchBar} role="search" aria-label="Job postings">
        <label className={styles.filterField} htmlFor="jobs-search">
          <span>Search job postings</span>
          <div className={styles.searchInput}>
            <Search size={18} aria-hidden="true" />
            <Input
              id="jobs-search"
              type="search"
              value={filters.q}
              onChange={(event) => actions.setQ(event.target.value)}
              placeholder="Role, company, location, skills or description"
              aria-describedby="jobs-search-help"
            />
          </div>
        </label>
        {filters.q && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => actions.setQ("")}
          >
            Clear search
          </Button>
        )}
      </div>
      <p id="jobs-search-help" className={styles.searchHelp}>
        Search available postings as you type. Use multiple words to narrow
        results.
      </p>
      <div className={styles.filtersToolbar}>
        <div>
          <p className={styles.filtersEyebrow}>Filters</p>
          <p
            className={styles.filtersCount}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            Showing <strong>{rowsCount}</strong> of {totalJobs} postings
          </p>
        </div>
        <div className={styles.filtersToolbarActions}>
          <button
            type="button"
            className={styles.filtersToggleButton}
            aria-expanded={areFiltersOpen}
            aria-controls="jobs-filters-panel"
            onClick={() => setAreFiltersOpen((isOpen) => !isOpen)}
          >
            <SlidersHorizontal size={14} />
            {areFiltersOpen ? "Hide Filters" : "Show Filters"}
            <ChevronDown
              size={14}
              className={areFiltersOpen ? styles.filtersToggleIconOpen : ""}
              aria-hidden="true"
            />
          </button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={actions.resetFilters}
          >
            Reset
          </Button>
        </div>
      </div>

      <div
        id="jobs-filters-panel"
        className={`${styles.filtersBody} ${
          areFiltersOpen ? styles.filtersBodyOpen : ""
        }`}
      >
        <div className={styles.filtersBodyInner}>
          <div className={styles.filtersGrid}>
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
                  actions.setRemoteType(
                    event.target.value as RemoteType | "ALL",
                  )
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
                onChange={(event) =>
                  actions.setRequiredSkill(event.target.value)
                }
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
            <p className={styles.syncNotice} role="status" aria-live="polite">
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
            <div className={styles.errorNotice} role="alert">
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

          {lastSyncAt || syncSourceResults.length > 0 ? (
            <details className={styles.syncDetails}>
              <summary>Sync details (optional)</summary>
              <div className={styles.syncDetailsBody}>
                <p className={styles.syncTimestamp}>
                  {lastSyncAt
                    ? `Last checked: ${new Date(lastSyncAt).toLocaleString()}`
                    : "No sync yet"}
                </p>
                {feedGeneratedAt ? (
                  <p className={styles.syncTimestamp}>
                    Feed collected: {new Date(feedGeneratedAt).toLocaleString()}
                  </p>
                ) : null}
                <div className={styles.diagnosticsPanel}>
                  <p>Sync Diagnostics</p>
                  <p>
                    Postgres Python snapshot:{" "}
                    {syncDiagnostics.python.scrapedFeedConfigured
                      ? "yes"
                      : "no"}
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
                    <p>Source-level success and failure details.</p>
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
                                result.disabled
                                  ? styles.syncResultPaused
                                  : result.ok
                                    ? styles.syncResultSuccess
                                    : styles.syncResultFailed
                              }
                            >
                              {result.disabled
                                ? "Paused"
                                : result.ok
                                  ? `Success (${result.importedJobs} raw)`
                                  : "Failed"}
                            </span>
                          </div>
                          {result.message ? <p>{result.message}</p> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}
