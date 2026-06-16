import { parseFeedSnapshotPayload } from "@/lib/feed-snapshot-payload";
import { writeLatestFeedSnapshotToD1 } from "@/lib/feed-snapshot-store";
import { getRuntimeEnv, type RuntimeEnv } from "@/lib/runtime-env";

export const runtime = "edge";

const CRON_SECRET_HEADER = "x-cron-secret";
const SYNC_SECRET_HEADER = "x-rolelens-sync-secret";

function getExpectedSecret(env: RuntimeEnv) {
  return env.SYNC_ADMIN_SECRET?.trim() || env.CRON_SECRET?.trim();
}

function isAuthorized(request: Request, env: RuntimeEnv) {
  const expected = getExpectedSecret(env);
  if (!expected) {
    return {
      ok: false as const,
      response: Response.json(
        {
          ok: false,
          message: "CRON_SECRET or SYNC_ADMIN_SECRET is not configured",
        },
        { status: 500 },
      ),
    };
  }

  const provided =
    request.headers.get(CRON_SECRET_HEADER)?.trim() ||
    request.headers.get(SYNC_SECRET_HEADER)?.trim();
  if (provided === expected) return { ok: true as const };

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

export async function POST(request: Request) {
  const env = await getRuntimeEnv();
  const auth = isAuthorized(request, env);
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

  const snapshot = parseFeedSnapshotPayload(payload);
  if (!snapshot) {
    return Response.json(
      {
        ok: false,
        message: "Invalid feed snapshot payload",
      },
      { status: 400 },
    );
  }

  const stored = await writeLatestFeedSnapshotToD1(snapshot);
  if (!stored) {
    return Response.json(
      {
        ok: false,
        message: "D1 feed snapshot store is unavailable",
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    generatedAt: snapshot.generatedAt,
    sourceCount: snapshot.sourceCount,
    importedJobs: snapshot.jobs.length,
    errors: snapshot.errors,
    sourceResults: snapshot.sourceResults,
  });
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
