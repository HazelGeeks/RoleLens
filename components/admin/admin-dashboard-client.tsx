"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import styles from "./admin-dashboard-client.module.css";

type AdminSummary = {
  ok: true;
  generatedAt: string;
  admin: {
    email: string;
    name: string;
  };
  database: {
    available: boolean;
    issues: string[];
  };
  auth: {
    userCount: number | null;
    activeSessionCount: number | null;
  };
  feed: {
    generatedAt: string | null;
    ageMinutes: number | null;
    sourceCount: number;
    importedSourceCount: number | null;
    jobCount: number;
    errorCount: number;
    failedSourceCount: number;
    sourceResults: Array<{
      source: string;
      ok: boolean;
      importedJobs: number;
      message?: string;
    }>;
    errors: Array<{
      source: string;
      message: string;
    }>;
    recoveryGuide: string[];
  };
  jobs: {
    totalCount: number | null;
    trackedUserCount: number | null;
    statusCounts: Array<{
      status: string;
      count: number;
    }>;
    recentJobs: Array<{
      id: string;
      company: string;
      title: string;
      status: string;
      updatedAt: string | null;
    }>;
  };
  goals: {
    totalCount: number | null;
  };
};

type ErrorPayload = {
  ok: false;
  message: string;
};

function formatCount(value: number | null) {
  return value == null ? "-" : new Intl.NumberFormat("en-CA").format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatAge(minutes: number | null) {
  if (minutes == null) return "-";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function AdminDashboardClient() {
  const { status, user } = useAuth();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);
    setError(null);
    const response = await fetch("/api/admin/summary", {
      cache: "no-store",
      credentials: "include",
    });
    const payload = (await response.json().catch(() => null)) as
      | AdminSummary
      | ErrorPayload
      | null;

    if (!response.ok || !payload || !payload.ok) {
      setSummary(null);
      setError(
        payload && "message" in payload
          ? payload.message
          : `Admin summary failed (${response.status})`,
      );
      setIsLoading(false);
      return;
    }

    setSummary(payload);
    setIsLoading(false);
  }, [status]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const healthTone = useMemo(() => {
    if (!summary) return "neutral";
    if (!summary.database.available || summary.database.issues.length > 0) return "danger";
    if (summary.feed.errorCount > 0 || summary.feed.failedSourceCount > 0) return "warning";
    return "healthy";
  }, [summary]);

  const syncAllFeeds = async () => {
    setIsSyncing(true);
    setNotice(null);
    setError(null);

    const response = await fetch("/api/jobs/sync", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ platform: "all" }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; message?: string; jobs?: unknown[]; refreshed?: boolean }
      | null;

    if (!response.ok) {
      setError(payload?.message || `Feed sync failed (${response.status})`);
      setIsSyncing(false);
      return;
    }

    setNotice(
      `Sync completed: ${Array.isArray(payload?.jobs) ? payload.jobs.length : 0} jobs loaded.`,
    );
    await loadSummary();
    setIsSyncing(false);
  };

  if (status === "loading" || isLoading) {
    return (
      <section className={styles.loading} role="status" aria-live="polite">
        <span className={styles.loadingBar} />
        <span>Loading admin dashboard...</span>
      </section>
    );
  }

  if (!user) return null;

  if (error && !summary) {
    return (
      <section className={styles.accessDenied} aria-labelledby="admin-denied-title">
        <ShieldCheck size={28} />
        <p className={styles.eyebrow}>Admin access</p>
        <h2 id="admin-denied-title">This account cannot open admin.</h2>
        <p>{error}</p>
        <Link href="/dashboard" className={styles.linkButton}>
          Back to dashboard
        </Link>
      </section>
    );
  }

  if (!summary) return null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Admin</p>
          <h2>RoleLens operations</h2>
          <p>
            Signed in as {summary.admin.name || summary.admin.email}. Last checked{" "}
            {formatDateTime(summary.generatedAt)}.
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void loadSummary()}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={isSyncing}
            onClick={() => void syncAllFeeds()}
          >
            <RefreshCw size={16} />
            {isSyncing ? "Syncing..." : "Sync all feeds"}
          </button>
        </div>
      </header>

      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.healthGrid} aria-label="Admin health summary">
        <article className={styles.healthCard} data-tone={healthTone}>
          {healthTone === "healthy" ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          <div>
            <span>System health</span>
            <strong>
              {healthTone === "healthy"
                ? "Healthy"
                : healthTone === "warning"
                  ? "Needs review"
                  : "Blocked"}
            </strong>
          </div>
        </article>
        <article className={styles.healthCard}>
          <Database size={20} />
          <div>
            <span>D1 database</span>
            <strong>{summary.database.available ? "Connected" : "Unavailable"}</strong>
          </div>
        </article>
        <article className={styles.healthCard}>
          <Users size={20} />
          <div>
            <span>Users</span>
            <strong>{formatCount(summary.auth.userCount)}</strong>
          </div>
        </article>
      </section>

      <section className={styles.metricGrid} aria-label="Admin metrics">
        <article>
          <span>Imported jobs</span>
          <strong>{formatCount(summary.feed.jobCount)}</strong>
          <p>Snapshot age {formatAge(summary.feed.ageMinutes)}</p>
        </article>
        <article>
          <span>Feed sources</span>
          <strong>{formatCount(summary.feed.sourceCount)}</strong>
          <p>{formatCount(summary.feed.failedSourceCount)} failing</p>
        </article>
        <article>
          <span>Tracked jobs</span>
          <strong>{formatCount(summary.jobs.totalCount)}</strong>
          <p>{formatCount(summary.jobs.trackedUserCount)} users with jobs</p>
        </article>
        <article>
          <span>Active sessions</span>
          <strong>{formatCount(summary.auth.activeSessionCount)}</strong>
          <p>{formatCount(summary.goals.totalCount)} goals</p>
        </article>
      </section>

      <section className={styles.twoColumn}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3>Feed sources</h3>
            <span>{formatDateTime(summary.feed.generatedAt)}</span>
          </div>
          <div className={styles.sourceList}>
            {summary.feed.sourceResults.length > 0 ? (
              summary.feed.sourceResults.map((source) => (
                <div key={source.source} className={styles.sourceRow}>
                  <span className={source.ok ? styles.okDot : styles.failDot} />
                  <div>
                    <strong>{source.source}</strong>
                    <p>{source.message || "Source completed"}</p>
                  </div>
                  <em>{formatCount(source.importedJobs)}</em>
                </div>
              ))
            ) : (
              <p className={styles.empty}>No feed source results yet.</p>
            )}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3>Job status</h3>
            <span>{formatCount(summary.jobs.totalCount)} total</span>
          </div>
          <div className={styles.statusList}>
            {summary.jobs.statusCounts.length > 0 ? (
              summary.jobs.statusCounts.map((statusCount) => (
                <div key={statusCount.status}>
                  <span>{statusCount.status}</span>
                  <strong>{formatCount(statusCount.count)}</strong>
                </div>
              ))
            ) : (
              <p className={styles.empty}>No tracked jobs yet.</p>
            )}
          </div>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3>Recent tracked jobs</h3>
          <Link href="/jobs">Open jobs</Link>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {summary.jobs.recentJobs.length > 0 ? (
                summary.jobs.recentJobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.company}</td>
                    <td>{job.title}</td>
                    <td>{job.status}</td>
                    <td>{formatDateTime(job.updatedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No recent jobs.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {summary.database.issues.length > 0 || summary.feed.errors.length > 0 ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3>Issues</h3>
            <span>{summary.database.issues.length + summary.feed.errors.length}</span>
          </div>
          <ul className={styles.issueList}>
            {summary.database.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
            {summary.feed.errors.map((issue) => (
              <li key={`${issue.source}:${issue.message}`}>
                {issue.source}: {issue.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
