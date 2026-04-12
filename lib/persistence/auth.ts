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

export function authorizePersistenceRequest(request: Request): AuthResult {
  const expectedToken = process.env.PERSISTENCE_POC_TOKEN?.trim();
  if (expectedToken) {
    const providedToken = getBearerToken(request);
    if (!providedToken || providedToken !== expectedToken) {
      return {
        ok: false,
        response: unauthorized("Unauthorized"),
      };
    }
  }

  const userId = request.headers.get(USER_HEADER)?.trim();
  if (!userId) {
    return {
      ok: false,
      response: unauthorized("Missing x-rolelens-user header"),
    };
  }

  const deviceId =
    request.headers.get(DEVICE_HEADER)?.trim() || "web-client-default";

  return {
    ok: true,
    identity: {
      userId,
      deviceId,
    },
  };
}
