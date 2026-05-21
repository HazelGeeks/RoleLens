import { z } from "zod";
import { authorizePersistenceRequest } from "@/lib/persistence/auth";
import {
  createPersistentJob,
  listPersistentJobs,
} from "@/lib/persistence/store";
import { createPersistentJobSchema } from "@/lib/persistence/validators";

export const runtime = "edge";

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

export async function GET(request: Request) {
  const auth = await authorizePersistenceRequest(request);
  if (!auth.ok) return auth.response;

  const jobs = await listPersistentJobs(auth.identity.userId);
  return Response.json({
    ok: true,
    count: jobs.length,
    jobs,
  });
}

export async function POST(request: Request) {
  const auth = await authorizePersistenceRequest(request);
  if (!auth.ok) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Invalid JSON payload");
  }

  const parsed = createPersistentJobSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest("Validation failed", formatValidation(parsed.error));
  }

  const job = await createPersistentJob({
    userId: auth.identity.userId,
    deviceId: auth.identity.deviceId,
    actor: auth.identity.userId,
    input: parsed.data,
  });

  return Response.json(
    {
      ok: true,
      job,
    },
    {
      status: 201,
    },
  );
}
