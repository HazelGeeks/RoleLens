import type { FeedImportSnapshot } from "@/lib/feed-types";
import {
  buildFeedImportSnapshotFromImportedJobs,
} from "@/lib/feed-import";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseSnapshot(value: unknown): FeedImportSnapshot | null {
  if (!isRecord(value)) return null;
  if (typeof value.sourceCount !== "number") return null;
  if (!Array.isArray(value.jobs)) return null;
  if (!Array.isArray(value.errors)) return null;
  if (!Array.isArray(value.sourceResults)) return null;
  if (typeof value.generatedAt !== "string") return null;

  if (!isRecord(value.diagnostics) || !Array.isArray(value.recoveryGuide)) {
    return buildFeedImportSnapshotFromImportedJobs({
      generatedAt: value.generatedAt,
      sourceCount: value.sourceCount,
      jobs: value.jobs as FeedImportSnapshot["jobs"],
      errors: value.errors as FeedImportSnapshot["errors"],
      sourceResults: value.sourceResults as FeedImportSnapshot["sourceResults"],
    });
  }

  return value as FeedImportSnapshot;
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

  const snapshot = parseSnapshot(payload);
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
