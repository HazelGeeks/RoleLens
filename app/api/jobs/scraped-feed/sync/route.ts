import { crawlAndSaveScrapedFeedSnapshot } from "@/lib/scraped-feed-crawler";
import { parseFeedPlatform } from "@/lib/feed-platform";

export const runtime = "edge";

const CRON_SECRET_HEADER = "x-cron-secret";
const SYNC_SECRET_HEADER = "x-rolelens-sync-secret";

function getExpectedSecret() {
  return process.env.SYNC_ADMIN_SECRET?.trim() || process.env.CRON_SECRET?.trim();
}

function parsePositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function isAuthorized(request: Request) {
  const expected = getExpectedSecret();
  if (!expected) {
    return {
      ok: false as const,
      response: Response.json(
        {
          ok: false,
          message: "SYNC_ADMIN_SECRET or CRON_SECRET is not configured",
        },
        { status: 500 },
      ),
    };
  }

  const provided =
    request.headers.get(SYNC_SECRET_HEADER)?.trim() ||
    request.headers.get(CRON_SECRET_HEADER)?.trim();
  if (provided && provided === expected) {
    return { ok: true as const };
  }

  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return {
      ok: false as const,
      response: Response.json(
        {
          ok: false,
          message: "Unauthorized",
        },
        { status: 401 },
      ),
    };
  }

  if (authorization.slice("Bearer ".length).trim() !== expected) {
    return {
      ok: false as const,
      response: Response.json(
        {
          ok: false,
          message: "Unauthorized",
        },
        { status: 401 },
      ),
    };
  }

  return { ok: true as const };
}

export async function GET() {
  return Response.json(
    {
      ok: false,
      message: "Method Not Allowed",
    },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    },
  );
}

export async function POST(request: Request) {
  const auth = isAuthorized(request);
  if (!auth.ok) return auth.response;

  const requestUrl = new URL(request.url);
  let body: Record<string, unknown> = {};

  try {
    if ((request.headers.get("content-type") || "").includes("application/json")) {
      const parsed = (await request.json()) as unknown;
      if (parsed && typeof parsed === "object") {
        body = parsed as Record<string, unknown>;
      }
    }
  } catch {
    return Response.json(
      {
        ok: false,
        message: "Invalid JSON payload",
      },
      { status: 400 },
    );
  }

  const platform = parseFeedPlatform(
    String(body.platform ?? requestUrl.searchParams.get("platform") ?? "all"),
  );

  const timeoutSeconds =
    parsePositiveInteger(body.timeoutSeconds) ??
    parsePositiveInteger(requestUrl.searchParams.get("timeoutSeconds"));

  const limitPerSource =
    parsePositiveInteger(body.limitPerSource) ??
    parsePositiveInteger(requestUrl.searchParams.get("limitPerSource"));

  const sourceUrls =
    asStringArray(body.sourceUrls) ??
    asStringArray(requestUrl.searchParams.getAll("sourceUrl"));

  const crawlResult = await crawlAndSaveScrapedFeedSnapshot(
    {
      platform,
      timeoutSeconds,
      limitPerSource,
      sourceUrls,
    },
    process.env,
  );

  return Response.json(
    {
      ok: true,
      platform,
      snapshotId: crawlResult.saved.snapshotId,
      generatedAt: crawlResult.snapshot.generatedAt,
      importedAt: crawlResult.saved.importedAt,
      sourceCount: crawlResult.snapshot.sourceCount,
      jobCount: crawlResult.snapshot.jobs.length,
      errorCount: crawlResult.snapshot.errors.length,
      errors: crawlResult.snapshot.errors,
      sourceResults: crawlResult.snapshot.sourceResults,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
