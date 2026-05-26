import {
  readLatestScrapedFeedSnapshot,
  saveScrapedFeedSnapshot,
} from "@/lib/scraped-feed-store";

export const runtime = "edge";

const CRON_SECRET_HEADER = "x-cron-secret";
const SYNC_SECRET_HEADER = "x-rolelens-sync-secret";

function getExpectedSecret() {
  return process.env.SYNC_ADMIN_SECRET?.trim() || process.env.CRON_SECRET?.trim();
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
  if (!authorization) {
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

  const bearerPrefix = "Bearer ";
  if (!authorization.startsWith(bearerPrefix)) {
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

  if (authorization.slice(bearerPrefix.length).trim() !== expected) {
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

export async function GET(request: Request) {
  const auth = isAuthorized(request);
  if (!auth.ok) return auth.response;

  const snapshot = await readLatestScrapedFeedSnapshot(process.env);
  if (!snapshot) {
    return Response.json(
      {
        ok: true,
        hasSnapshot: false,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  return Response.json(
    {
      ok: true,
      hasSnapshot: true,
      snapshotId: snapshot.snapshotId,
      generatedAt: snapshot.generatedAt,
      importedAt: snapshot.importedAt,
      sourceCount: snapshot.sourceCount,
      jobCount: snapshot.jobs.length,
      errorCount: snapshot.errors.length,
      sourceResultCount: snapshot.sourceResults.length,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  const auth = isAuthorized(request);
  if (!auth.ok) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      {
        ok: false,
        message: "Invalid JSON payload",
      },
      { status: 400 },
    );
  }

  const saved = await saveScrapedFeedSnapshot(payload, process.env);

  return Response.json(
    {
      ok: true,
      snapshotId: saved.snapshotId,
      generatedAt: saved.generatedAt,
      importedAt: saved.importedAt,
      sourceCount: saved.sourceCount,
      jobCount: saved.jobCount,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
