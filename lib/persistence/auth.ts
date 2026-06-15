import { getAuthSessionUserFromRequest } from "@/lib/auth-server";

const USER_HEADER = "x-rolelens-user";
const DEVICE_HEADER = "x-rolelens-device";

export type PersistenceIdentity = {
  userId: string;
  deviceId: string;
};

type AuthResult =
  | {
      ok: true;
      identity: PersistenceIdentity;
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

function getBearerToken(request: Request) {
  const raw = request.headers.get("authorization");
  if (!raw) return null;

  const [scheme, token] = raw.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;

  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isProductionRuntime() {
  return process.env.NODE_ENV?.trim().toLowerCase() === "production";
}

export async function authorizePersistenceRequest(
  request: Request,
): Promise<AuthResult> {
  const userId = request.headers.get(USER_HEADER)?.trim();
  if (!userId) {
    return {
      ok: false,
      response: unauthorized("Missing x-rolelens-user header"),
    };
  }

  const deviceId =
    request.headers.get(DEVICE_HEADER)?.trim() || "web-client-default";

  const expectedToken = process.env.PERSISTENCE_POC_TOKEN?.trim();
  if (expectedToken) {
    const providedToken = getBearerToken(request);
    if (providedToken === expectedToken) {
      return {
        ok: true,
        identity: {
          userId,
          deviceId,
        },
      };
    }
  }

  const authUser = await getAuthSessionUserFromRequest(request);
  const expectedUserId = authUser ? `account-${authUser.id}` : null;

  if (expectedUserId) {
    if (expectedUserId !== userId) {
      return {
        ok: false,
        response: unauthorized("Unauthorized"),
      };
    }

    return {
      ok: true,
      identity: {
        userId,
        deviceId,
      },
    };
  }

  if (expectedToken || isProductionRuntime()) {
    return {
      ok: false,
      response: unauthorized("Unauthorized"),
    };
  }

  return {
    ok: true,
    identity: {
      userId,
      deviceId,
    },
  };
}
