import { z } from "zod";
import { getAuthSessionUserFromRequest } from "@/lib/auth-server";
import { createGoalFollowUp } from "@/lib/goals/store";
import { createGoalFollowUpSchema } from "@/lib/goals/validators";
import { toPublicServerError } from "@/lib/server-config-errors";

export const runtime = "edge";
const USER_HEADER = "x-rolelens-user";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireSessionUser(request);
  if (!auth.ok) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Invalid JSON payload");
  }

  const parsed = createGoalFollowUpSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest("Validation failed", formatValidation(parsed.error));
  }

  const params = await context.params;
  const goalId = params.id;

  try {
    const goal = await createGoalFollowUp({
      userId: auth.userId,
      goalId,
      input: parsed.data,
    });

    if (!goal) {
      return Response.json(
        {
          ok: false,
          message: "Goal not found",
        },
        {
          status: 404,
        },
      );
    }

    return Response.json({
      ok: true,
      goal,
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
