import { getAuthSessionUserFromRequest } from "@/lib/auth-server";
import { writeFeedSnapshotToCache } from "@/lib/feed-snapshot-cache";
import {
  readLatestFeedSnapshotFromD1,
  writeLatestFeedSnapshotToD1,
} from "@/lib/feed-snapshot-store";
import { parseFeedPlatform } from "@/lib/feed-platform";
import { getRuntimeEnv, type RuntimeEnv } from "@/lib/runtime-env";
import {
  buildMissingD1FeedSnapshot,
  filterFeedSnapshotByPlatform,
} from "@/lib/feed-snapshot";
import { parseFeedSnapshotPayload } from "@/lib/feed-snapshot-payload";

export const runtime = "edge";

const SYNC_SECRET_HEADER = "x-rolelens-sync-secret";
const CRON_SECRET_HEADER = "x-cron-secret";

type SyncRequestPayload = {
  platform?: string | null;
};

function isLocalhostRequest(url: URL) {
  const host = url.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function getExpectedSyncSecret(env: RuntimeEnv) {
  return env.SYNC_ADMIN_SECRET?.trim() || env.CRON_SECRET?.trim();
}

function getSyncAdminEmails(env: RuntimeEnv) {
  const configuredEmails = [
    env.SYNC_ADMIN_EMAILS || "",
    env.SYNC_ADMIN_EMAIL || "",
  ].join(",");

  return new Set(
    configuredEmails
      .split(",")
      .map((email) => email.trim().replace(/^["']|["']$/g, "").toLowerCase())
      .filter(Boolean),
  );
}

function hasValidSyncSecret(request: Request, env: RuntimeEnv) {
  const expected = getExpectedSyncSecret(env);
  if (!expected) return false;

  const provided =
    request.headers.get(SYNC_SECRET_HEADER)?.trim() ||
    request.headers.get(CRON_SECRET_HEADER)?.trim();
  if (provided && provided === expected) return true;

  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return false;

  const bearerPrefix = "Bearer ";
  if (!authorization.startsWith(bearerPrefix)) return false;
  return authorization.slice(bearerPrefix.length).trim() === expected;
}

function badRequest(message: string) {
  return Response.json(
    {
      ok: false,
      message,
    },
    {
      status: 400,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

function unauthorized(message: string) {
  return Response.json(
    {
      ok: false,
      message,
    },
    {
      status: 401,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

function forbidden(message: string) {
  return Response.json(
    {
      ok: false,
      message,
    },
    {
      status: 403,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

function parsePayload(value: unknown): SyncRequestPayload {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid JSON payload");
  }

  return value as SyncRequestPayload;
}

function getScrapedFeedUrl(env: RuntimeEnv) {
  return env.PYTHON_SCRAPED_FEED_URL?.trim() || "";
}

async function refreshD1SnapshotFromFeed(env: RuntimeEnv) {
  const feedUrl = getScrapedFeedUrl(env);
  if (!feedUrl) return null;

  const response = await fetch(feedUrl, {
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`feed source returned ${response.status}`);
  }

  const payload = await response.json();
  const snapshot = parseFeedSnapshotPayload(payload);
  if (!snapshot) {
    throw new Error("feed source returned an invalid snapshot payload");
  }

  const stored = await writeLatestFeedSnapshotToD1(snapshot);
  if (!stored) {
    throw new Error("D1 feed snapshot store is unavailable");
  }

  return snapshot;
}

export async function POST(request: Request) {
  const env = await getRuntimeEnv();
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const url = new URL(request.url);
  const localRequest = isLocalhostRequest(url);
  const syncSecretAuthorized = hasValidSyncSecret(request, env);
  const sessionUser =
    localRequest || syncSecretAuthorized
      ? null
      : await getAuthSessionUserFromRequest(request);

  if (!localRequest && !syncSecretAuthorized && !sessionUser) {
    return unauthorized("Login required");
  }

  if (!localRequest && !syncSecretAuthorized && sessionUser) {
    const syncAdminEmails = getSyncAdminEmails(env);
    if (syncAdminEmails.size === 0) {
      return forbidden("Sync admin emails are not configured");
    }

    if (!syncAdminEmails.has(sessionUser.email.trim().toLowerCase())) {
      return forbidden("Admin access required to sync feeds");
    }
  }

  let payload: SyncRequestPayload;
  try {
    const rawBody = await request.text();
    payload = parsePayload(rawBody ? JSON.parse(rawBody) : {});
  } catch {
    return badRequest("Invalid JSON payload");
  }

  const platform = parseFeedPlatform(payload.platform);
  let refreshedSnapshot = null;
  try {
    refreshedSnapshot = await refreshD1SnapshotFromFeed(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return Response.json(
      {
        ok: false,
        message: `Feed refresh failed: ${message}`,
        requestId,
      },
      {
        status: 502,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  const d1Snapshot = refreshedSnapshot || (await readLatestFeedSnapshotFromD1());
  const snapshot = d1Snapshot
    ? filterFeedSnapshotByPlatform(d1Snapshot, platform)
    : buildMissingD1FeedSnapshot();

  if (platform === "all" && d1Snapshot) {
    await writeFeedSnapshotToCache(request, d1Snapshot);
  }

  const latencyMs = Date.now() - startedAt;
  console.info("jobs.sync.completed", {
    requestId,
    actor: syncSecretAuthorized ? "secret" : localRequest ? "localhost" : "session",
    userId: sessionUser?.id,
    platform,
    sourceCount: snapshot.sourceCount,
    importedJobs: snapshot.jobs.length,
    errorCount: snapshot.errors.length,
    refreshed: Boolean(refreshedSnapshot),
    latencyMs,
  });

  return Response.json(
    {
      ...snapshot,
      cached: false,
      platform,
      refreshed: Boolean(refreshedSnapshot),
      requestId,
      latencyMs,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
