import { getAuthSessionUserFromRequest } from "@/lib/auth-server";

export const runtime = "edge";

export async function GET(request: Request) {
  const user = await getAuthSessionUserFromRequest(request);

  return Response.json({
    ok: true,
    user,
  });
}
