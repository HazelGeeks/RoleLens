import {
  collectFeedJobs,
  readFeedSnapshotFromCache,
  writeFeedSnapshotToCache,
} from "@/lib/feed-import";
import { parseFeedPlatform } from "@/lib/feed-platform";
import { crawlAndSaveScrapedFeedSnapshot } from "@/lib/scraped-feed-crawler";

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

function getPublicRateLimitPerMinute() {
  return parsePositiveInteger(
    process.env.IMPORT_PUBLIC_RATE_LIMIT_PER_MIN,
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

function getExpectedSyncSecret() {
  return process.env.SYNC_ADMIN_SECRET?.trim() || process.env.CRON_SECRET?.trim();
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

function allowPublicFeedRefresh() {
  return process.env.ALLOW_PUBLIC_FEED_REFRESH?.trim() === "1";
}

function consumePublicRateLimit(key: string) {
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
  const limit = getPublicRateLimitPerMinute();
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

function buildGuardedResponse(payload: Record<string, unknown>, status: number) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

function isD1ScrapedFeedBackend() {
  return process.env.PYTHON_SCRAPED_FEED_BACKEND?.trim().toLowerCase() === "d1";
}

function hasD1BootstrapError(snapshot: Awaited<ReturnType<typeof collectFeedJobs>>) {
  return snapshot.errors.some((entry) => {
    const message = entry.message.toLowerCase();
    return (
      message.includes("d1 scraped feed snapshot is missing") ||
      message.includes("d1 scraped feed schema is missing")
    );
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const platform = parseFeedPlatform(url.searchParams.get("platform"));
  const platformScoped = platform !== "all";
  const expensiveSyncRequest = refresh || platformScoped;
  const localRequest = isLocalhostRequest(url);
  const syncAuthorized = hasValidSyncSecret(request);

  if (!localRequest && !syncAuthorized) {
    const clientId = getClientIdentifier(request);
    const limiter = consumePublicRateLimit(clientId);
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

  if (
    expensiveSyncRequest &&
    !localRequest &&
    !syncAuthorized &&
    !allowPublicFeedRefresh()
  ) {
    return buildGuardedResponse(
      {
        ok: false,
        message:
          "Manual feed refresh is disabled on public deployments. Use cached /api/jobs/import responses, or trigger /api/jobs/cron with x-cron-secret.",
      },
      403,
    );
  }

  if (!refresh && !platformScoped) {
    const cached = await readFeedSnapshotFromCache(request);
    if (cached) {
      return Response.json(
        {
          ...cached,
          cached: true,
          platform,
        },
        {
          headers: {
            "cache-control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
          },
        },
      );
    }
  }

  const collectOptions = {
    requestUrl: request.url,
    platform,
  };

  let snapshot = await collectFeedJobs(process.env, collectOptions);
  let autoBootstrapped = false;

  if (
    expensiveSyncRequest &&
    isD1ScrapedFeedBackend() &&
    hasD1BootstrapError(snapshot) &&
    (localRequest || syncAuthorized)
  ) {
    try {
      await crawlAndSaveScrapedFeedSnapshot(
        {
          platform,
        },
        process.env,
      );
      snapshot = await collectFeedJobs(process.env, collectOptions);
      autoBootstrapped = true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown crawler bootstrap error";
      snapshot = {
        ...snapshot,
        errors: [
          ...snapshot.errors,
          {
            source: "crawler-bootstrap",
            message: `Auto bootstrap crawl failed: ${message}`,
          },
        ],
      };
    }
  }

  if (!platformScoped) {
    await writeFeedSnapshotToCache(request, snapshot);
  }

  return Response.json(
    {
      ...snapshot,
      cached: false,
      platform,
      autoBootstrapped,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
