import { getAuthSessionUserFromRequest } from "@/lib/auth-server";

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

function isProductionRuntime() {
  return process.env.NODE_ENV?.trim().toLowerCase() === "production";
}

export async function requireGoalUser(request: Request): Promise<AuthResult> {
  const user = await getAuthSessionUserFromRequest(request);
  if (user) {
    return {
      ok: true,
      userId: user.id,
    };
  }

  const headerUserId = request.headers.get(USER_HEADER)?.trim();
  if (headerUserId && !isProductionRuntime()) {
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
