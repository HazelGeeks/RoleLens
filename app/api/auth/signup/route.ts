import { buildAuthSessionCookie, signUpAuth } from "@/lib/auth-server";
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

  const input = payload as Partial<{
    name: string;
    email: string;
    password: string;
  }>;

  try {
    const result = await signUpAuth({
      name: typeof input.name === "string" ? input.name : "",
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

    const response = Response.json(
      {
        ok: true,
        user: result.user,
      },
      { status: 201 },
    );
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
