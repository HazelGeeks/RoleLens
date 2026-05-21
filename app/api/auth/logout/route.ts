import { buildAuthSessionClearCookie, signOutAuth } from "@/lib/auth-server";

export const runtime = "edge";

export async function POST(request: Request) {
  await signOutAuth(request);

  const response = Response.json({ ok: true });
  response.headers.set(
    "set-cookie",
    buildAuthSessionClearCookie(request.url),
  );
  return response;
}
