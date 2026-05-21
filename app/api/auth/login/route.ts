import { buildAuthSessionCookie, signInAuth } from "@/lib/auth-server";
import { toPublicServerError } from "@/lib/server-config-errors";

export const runtime = "edge";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      {
        ok: false,
        message: "Invalid JSON payload",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const input = payload as Partial<{ email: string; password: string }>;
    const result = await signInAuth({
      email: typeof input.email === "string" ? input.email : "",
      password: typeof input.password === "string" ? input.password : "",
    });

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          message: result.message,
        },
        {
          status: result.status,
        },
      );
    }

    const response = Response.json({
      ok: true,
      user: result.user,
    });
    response.headers.set(
      "set-cookie",
      buildAuthSessionCookie(request.url, result.sessionToken),
    );
    return response;
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
