import { collectFeedJobs, writeFeedSnapshotToCache } from "@/lib/feed-import";
import {
  readLatestFeedSnapshotFromD1,
  writeLatestFeedSnapshotToD1,
} from "@/lib/feed-snapshot-store";
import { getRuntimeEnv, type RuntimeEnv } from "@/lib/runtime-env";

export const runtime = "edge";

const CRON_SECRET_HEADER = "x-cron-secret";

function isAuthorized(request: Request, env: RuntimeEnv) {
  const expected = env.CRON_SECRET?.trim();
  if (!expected) {
    return {
      ok: false as const,
      error: Response.json(
        {
          ok: false,
          message: "CRON_SECRET is not configured",
        },
        { status: 500 },
      ),
    };
  }

  const provided = request.headers.get(CRON_SECRET_HEADER);
  if (!provided || provided !== expected) {
    return {
      ok: false as const,
      error: Response.json(
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

async function runCronImport(request: Request) {
  const env = await getRuntimeEnv();
  const auth = isAuthorized(request, env);
  if (!auth.ok) {
    return auth.error;
  }

  const snapshot = await collectFeedJobs(env, {
    requestUrl: request.url,
  });

  if (snapshot.sourceCount === 0) {
    const existingSnapshot = await readLatestFeedSnapshotFromD1();
    if (existingSnapshot) {
      await writeFeedSnapshotToCache(request, existingSnapshot);
      return Response.json({
        ok: true,
        generatedAt: existingSnapshot.generatedAt,
        sourceCount: existingSnapshot.sourceCount,
        importedJobs: existingSnapshot.jobs.length,
        errors: existingSnapshot.errors,
        sourceResults: existingSnapshot.sourceResults,
        cacheSource: "d1",
      });
    }
  }

  await writeLatestFeedSnapshotToD1(snapshot);
  await writeFeedSnapshotToCache(request, snapshot);

  return Response.json({
    ok: true,
    generatedAt: snapshot.generatedAt,
    sourceCount: snapshot.sourceCount,
    importedJobs: snapshot.jobs.length,
    errors: snapshot.errors,
    sourceResults: snapshot.sourceResults,
  });
}

export async function POST(request: Request) {
  return runCronImport(request);
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
