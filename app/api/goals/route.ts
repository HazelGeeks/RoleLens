import { z } from "zod";
import { getAuthSessionUserFromRequest } from "@/lib/auth-server";
import { createGoal, listGoals } from "@/lib/goals/store";
import { createGoalSchema } from "@/lib/goals/validators";
import { toPublicServerError } from "@/lib/server-config-errors";

export const runtime = "edge";
const USER_HEADER = "x-rolelens-user";

type AuthResult =
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      response: Response;
    };

function unauthorized(message: string) {
  return Response.json(
    {
      ok: false,
      message,
    },
    {
      status: 401,
    },
  );
}

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

async function requireSessionUser(request: Request): Promise<AuthResult> {
  const user = await getAuthSessionUserFromRequest(request);
  if (user) {
    return {
      ok: true,
      userId: user.id,
    };
  }

  const headerUserId = request.headers.get(USER_HEADER)?.trim();
  if (headerUserId) {
    return {
      ok: true,
      userId: headerUserId,
    };
  }

  return {
    ok: false,
    response: unauthorized("Login required"),
  };
}

export async function GET(request: Request) {
  const auth = await requireSessionUser(request);
  if (!auth.ok) return auth.response;

  try {
    const goals = await listGoals(auth.userId);
    return Response.json({
      ok: true,
      count: goals.length,
      goals,
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

export async function POST(request: Request) {
  const auth = await requireSessionUser(request);
  if (!auth.ok) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Invalid JSON payload");
  }

  const parsed = createGoalSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest("Validation failed", formatValidation(parsed.error));
  }

  try {
    const goal = await createGoal({
      userId: auth.userId,
      input: parsed.data,
    });

    return Response.json(
      {
        ok: true,
        goal,
      },
      {
        status: 201,
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
