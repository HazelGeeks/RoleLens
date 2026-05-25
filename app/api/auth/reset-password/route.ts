import { resetPasswordAuth } from "@/lib/auth-server";
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
    const result = await resetPasswordAuth({
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

    return Response.json({
      ok: true,
      message: result.message,
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
