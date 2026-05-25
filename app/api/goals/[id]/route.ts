import { getAuthSessionUserFromRequest } from "@/lib/auth-server";
import { deleteGoal } from "@/lib/goals/store";
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

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireSessionUser(request);
  if (!auth.ok) return auth.response;

  const params = await context.params;
  const goalId = params.id;

  try {
    const removed = await deleteGoal({
      userId: auth.userId,
      goalId,
    });

    if (!removed) {
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
