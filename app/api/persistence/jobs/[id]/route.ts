import { z } from "zod";
import { authorizePersistenceRequest } from "@/lib/persistence/auth";
import { getPersistentJob, patchPersistentJob } from "@/lib/persistence/store";
import { patchPersistentJobSchema } from "@/lib/persistence/validators";
import { toPublicServerError } from "@/lib/server-config-errors";

export const runtime = "edge";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function badRequest(message: string, details?: unknown) {
  return Response.json(
    {
      ok: false,
      message,
      details,
    },
    {
      status: 400,
    },
  );
}

function formatValidation(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

async function getRouteJobId(request: Request, context: RouteContext) {
  const pathId = new URL(request.url).pathname
    .replace(/\/+$/g, "")
    .split("/")
    .pop();
  if (pathId) return decodeURIComponent(pathId);

  const params = await context.params;
  return params.id.replace(/\/+$/g, "");
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await authorizePersistenceRequest(request);
    if (!auth.ok) return auth.response;

    const jobId = await getRouteJobId(request, context);
    const job = await getPersistentJob(auth.identity.userId, jobId);

    if (!job) {
      return Response.json(
        {
          ok: false,
          message: "Job not found",
        },
        {
          status: 404,
        },
      );
    }

    return Response.json(
      {
        ok: true,
        job,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    const publicError = toPublicServerError(error);
    return Response.json(
      {
        ok: false,
        message: publicError.message,
      },
      { status: publicError.status },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await authorizePersistenceRequest(request);
    if (!auth.ok) return auth.response;

    const jobId = await getRouteJobId(request, context);

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return badRequest("Invalid JSON payload");
    }

    const parsed = patchPersistentJobSchema.safeParse(payload);
    if (!parsed.success) {
      return badRequest("Validation failed", formatValidation(parsed.error));
    }

    const result = await patchPersistentJob({
      userId: auth.identity.userId,
      jobId,
      operation: parsed.data,
      actor: auth.identity.userId,
      deviceId: auth.identity.deviceId,
    });

    if (!result.ok && result.reason === "NOT_FOUND") {
      return Response.json(
        {
          ok: false,
          message: "Job not found",
        },
        {
          status: 404,
        },
      );
    }

    if (!result.ok && result.reason === "VERSION_CONFLICT") {
      return Response.json(
        {
          ok: false,
          message: "Version conflict",
          retryable: true,
          current: result.current,
        },
        {
          status: 409,
        },
      );
    }

    return Response.json({
      ok: true,
      job: result.job,
    });
  } catch (error) {
    const publicError = toPublicServerError(error);
    return Response.json(
      {
        ok: false,
        message: publicError.message,
      },
      { status: publicError.status },
    );
  }
}
