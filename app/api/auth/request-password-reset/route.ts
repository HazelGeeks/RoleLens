import { getPasswordResetDelivery } from "@/lib/auth-email";
import { requestPasswordResetAuth } from "@/lib/auth-server";
import { toPublicServerError } from "@/lib/server-config-errors";

// Configuration check only: never generate a token or send a message here.
export async function GET() {
  let available = false;
  try {
    await getPasswordResetDelivery();
    available = true;
  } catch {
    // Recovery stays disabled when its delivery configuration cannot be resolved.
  }
  return Response.json(
    { available },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { ok: false, message: "Invalid JSON payload" },
      { status: 400 },
    );
  }
  const email =
    payload && typeof payload === "object" && "email" in payload
      ? payload.email
      : undefined;
  try {
    const result = await requestPasswordResetAuth(
      typeof email === "string" ? email : "",
    );
    return Response.json(
      result.ok
        ? { ok: true, message: result.message }
        : { ok: false, message: result.message },
      {
        status: result.ok ? 200 : result.status,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    const publicError = toPublicServerError(error);
    return Response.json(
      { ok: false, message: publicError.message },
      { status: publicError.status },
    );
  }
}
