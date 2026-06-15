import {
  readFeedSnapshotFromCache,
  writeFeedSnapshotToCache,
} from "@/lib/feed-snapshot-cache";
import { readLatestFeedSnapshotFromD1 } from "@/lib/feed-snapshot-store";
import { parseFeedPlatform } from "@/lib/feed-platform";
import { getRuntimeEnv, type RuntimeEnv } from "@/lib/runtime-env";
import {
  buildMissingD1FeedSnapshot,
  filterFeedSnapshotByPlatform,
} from "@/lib/feed-snapshot";

export const runtime = "edge";

const SYNC_SECRET_HEADER = "x-rolelens-sync-secret";
const CRON_SECRET_HEADER = "x-cron-secret";
const DEFAULT_PUBLIC_RATE_LIMIT_PER_MIN = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const publicImportBuckets = new Map<string, RateLimitBucket>();

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getPublicRateLimitPerMinute(env: RuntimeEnv) {
  return parsePositiveInteger(
    env.IMPORT_PUBLIC_RATE_LIMIT_PER_MIN,
    DEFAULT_PUBLIC_RATE_LIMIT_PER_MIN,
  );
}

function getClientIdentifier(request: Request) {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  const forwarded = request.headers.get("x-forwarded-for")?.trim();
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return "unknown";
}

function isLocalhostRequest(url: URL) {
  const host = url.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function getExpectedSyncSecret(env: RuntimeEnv) {
  return env.SYNC_ADMIN_SECRET?.trim() || env.CRON_SECRET?.trim();
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

function consumePublicRateLimit(key: string, env: RuntimeEnv) {
  const now = Date.now();
  const bucket = publicImportBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    publicImportBuckets.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return {
      limited: false,
      retryAfterSeconds: 0,
    };
  }

  bucket.count += 1;
  const limit = getPublicRateLimitPerMinute(env);
  if (bucket.count <= limit) {
    publicImportBuckets.set(key, bucket);
    return {
      limited: false,
      retryAfterSeconds: 0,
    };
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.resetAt - now) / 1000),
  );
  return {
    limited: true,
    retryAfterSeconds,
  };
}

export async function GET(request: Request) {
  const env = await getRuntimeEnv();
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const platform = parseFeedPlatform(url.searchParams.get("platform"));
  const platformScoped = platform !== "all";
  const localRequest = isLocalhostRequest(url);
  const syncAuthorized = hasValidSyncSecret(request, env);

  if (!localRequest && !syncAuthorized) {
    const clientId = getClientIdentifier(request);
    const limiter = consumePublicRateLimit(clientId, env);
    if (limiter.limited) {
      return Response.json(
        {
          ok: false,
          message: "Rate limit exceeded. Retry later.",
        },
        {
          status: 429,
          headers: {
            "cache-control": "no-store",
            "retry-after": String(limiter.retryAfterSeconds),
          },
        },
      );
    }
  }

  const d1Snapshot = await readLatestFeedSnapshotFromD1();
  if (d1Snapshot) {
    const snapshot = filterFeedSnapshotByPlatform(d1Snapshot, platform);
    if (!platformScoped) {
      await writeFeedSnapshotToCache(request, d1Snapshot);
    }
    return Response.json(
      {
        ...snapshot,
        cached: true,
        cacheSource: "d1",
        platform,
      },
      {
        headers: {
          "cache-control": "public, max-age=15, s-maxage=60, stale-while-revalidate=60",
        },
      },
    );
  }

  if (!refresh && !platformScoped) {
    const cached = await readFeedSnapshotFromCache(request);
    if (cached) {
      const snapshot = filterFeedSnapshotByPlatform(cached, platform);
      return Response.json(
        {
          ...snapshot,
          cached: true,
          cacheSource: "edge",
          platform,
        },
        {
          headers: {
            "cache-control": "public, max-age=15, s-maxage=60, stale-while-revalidate=60",
          },
        },
      );
    }
  }

  const snapshot = buildMissingD1FeedSnapshot();

  return Response.json(
    {
      ...snapshot,
      cached: false,
      platform,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
