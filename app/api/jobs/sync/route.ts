import { getAuthSessionUserFromRequest } from "@/lib/auth-server";
import { collectFeedJobs, writeFeedSnapshotToCache } from "@/lib/feed-import";
import { parseFeedPlatform } from "@/lib/feed-platform";

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

function getExpectedSyncSecret() {
  return process.env.SYNC_ADMIN_SECRET?.trim() || process.env.CRON_SECRET?.trim();
}

function getSyncAdminEmails() {
  const configuredEmails = [
    process.env.SYNC_ADMIN_EMAILS || "",
    process.env.SYNC_ADMIN_EMAIL || "",
  ].join(",");

  return new Set(
    configuredEmails
      .split(",")
      .map((email) => email.trim().replace(/^["']|["']$/g, "").toLowerCase())
      .filter(Boolean),
  );
}

function hasValidSyncSecret(request: Request) {
  const expected = getExpectedSyncSecret();
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

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const url = new URL(request.url);
  const localRequest = isLocalhostRequest(url);
  const syncSecretAuthorized = hasValidSyncSecret(request);
  const sessionUser =
    localRequest || syncSecretAuthorized
      ? null
      : await getAuthSessionUserFromRequest(request);

  if (!localRequest && !syncSecretAuthorized && !sessionUser) {
    return unauthorized("Login required");
  }

  if (!localRequest && !syncSecretAuthorized && sessionUser) {
    const syncAdminEmails = getSyncAdminEmails();
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
  const snapshot = await collectFeedJobs(process.env, {
    requestUrl: request.url,
    platform,
  });

  if (platform === "all") {
    await writeFeedSnapshotToCache(request, snapshot);
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
    latencyMs,
  });

  return Response.json(
    {
      ...snapshot,
      cached: false,
      platform,
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
