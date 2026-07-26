import { getAdminAccessForRequest } from "@/lib/admin-auth";
import { getD1DatabaseFromContext, type D1DatabaseLike } from "@/lib/d1";
import { readLatestFeedSnapshotFromD1 } from "@/lib/feed-snapshot-store";

type CountRow = {
  count?: number | string;
};

type StatusCountRow = {
  status: string;
  count: number | string;
};

type RecentJobRow = {
  id: string;
  company: string;
  title: string;
  status: string;
  updatedAt?: string;
  updated_at?: string;
};

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function noStoreJson(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...init?.headers,
    },
  });
}

async function countOrNull(
  db: D1DatabaseLike,
  query: string,
  issues: string[],
  bindings: unknown[] = [],
) {
  try {
    const statement = db.prepare(query);
    const row = await (bindings.length > 0 ? statement.bind(...bindings) : statement)
      .first<CountRow>();
    return toNumber(row?.count);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "D1 count query failed");
    return null;
  }
}

async function statusCountsOrEmpty(db: D1DatabaseLike, issues: string[]) {
  try {
    const rows = await db
      .prepare(
        `SELECT status, COUNT(*) as count
         FROM persistent_jobs
         GROUP BY status
         ORDER BY count DESC, status ASC`,
      )
      .all<StatusCountRow>();

    return rows.results.map((row) => ({
      status: row.status,
      count: toNumber(row.count),
    }));
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "D1 status query failed");
    return [];
  }
}

async function recentJobsOrEmpty(db: D1DatabaseLike, issues: string[]) {
  try {
    const rows = await db
      .prepare(
        `SELECT id, company, title, status, updated_at as updatedAt
         FROM persistent_jobs
         ORDER BY updated_at DESC
         LIMIT 8`,
      )
      .all<RecentJobRow>();

    return rows.results.map((row) => ({
      id: row.id,
      company: row.company,
      title: row.title,
      status: row.status,
      updatedAt: row.updatedAt || row.updated_at || null,
    }));
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "D1 recent jobs query failed");
    return [];
  }
}

function calculateAgeMinutes(generatedAt: string | undefined) {
  if (!generatedAt) return null;
  const generatedTime = Date.parse(generatedAt);
  if (!Number.isFinite(generatedTime)) return null;
  return Math.max(0, Math.round((Date.now() - generatedTime) / 60_000));
}

export async function GET(request: Request) {
  const access = await getAdminAccessForRequest(request);
  if (!access.ok) {
    return noStoreJson(
      {
        ok: false,
        message: access.message,
      },
      {
        status: access.status,
      },
    );
  }

  const issues: string[] = [];
  const db = await getD1DatabaseFromContext();
  let snapshot = null;

  try {
    snapshot = await readLatestFeedSnapshotFromD1();
  } catch (error) {
    issues.push(
      error instanceof Error ? error.message : "D1 feed snapshot query failed",
    );
  }

  const now = new Date().toISOString();

  const [
    userCount,
    activeSessionCount,
    totalJobCount,
    trackedUserCount,
    totalGoalCount,
  ] = db
    ? await Promise.all([
        countOrNull(db, "SELECT COUNT(*) as count FROM auth_users", issues),
        countOrNull(
          db,
          "SELECT COUNT(*) as count FROM auth_sessions WHERE expires_at > ?",
          issues,
          [now],
        ),
        countOrNull(db, "SELECT COUNT(*) as count FROM persistent_jobs", issues),
        countOrNull(
          db,
          "SELECT COUNT(DISTINCT user_id) as count FROM persistent_jobs",
          issues,
        ),
        countOrNull(db, "SELECT COUNT(*) as count FROM persistent_goals", issues),
      ])
    : [null, null, null, null, null];

  const [statusCounts, recentJobs] = db
    ? await Promise.all([statusCountsOrEmpty(db, issues), recentJobsOrEmpty(db, issues)])
    : [[], []];

  if (!db) {
    issues.push("D1 binding is unavailable in this runtime");
  }

  return noStoreJson({
    ok: true,
    generatedAt: new Date().toISOString(),
    admin: {
      id: access.user.id,
      email: access.user.email,
      name: access.user.name,
    },
    database: {
      available: Boolean(db),
      issues,
    },
    auth: {
      userCount,
      activeSessionCount,
    },
    feed: {
      generatedAt: snapshot?.generatedAt ?? null,
      ageMinutes: calculateAgeMinutes(snapshot?.generatedAt),
      sourceCount: snapshot?.sourceCount ?? 0,
      importedSourceCount: snapshot?.importedSourceCount ?? null,
      jobCount: snapshot?.jobs.length ?? 0,
      errorCount: snapshot?.errors.length ?? 0,
      failedSourceCount:
        snapshot?.sourceResults.filter((source) => !source.ok).length ?? 0,
      sourceResults: snapshot?.sourceResults ?? [],
      errors: snapshot?.errors ?? [],
      recoveryGuide: snapshot?.recoveryGuide ?? [],
    },
    jobs: {
      totalCount: totalJobCount,
      trackedUserCount,
      statusCounts,
      recentJobs,
    },
    goals: {
      totalCount: totalGoalCount,
    },
  });
}
