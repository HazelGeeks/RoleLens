import { getAuthSessionUserFromRequest } from "@/lib/auth-server";

export async function GET(request: Request) {
  const user = await getAuthSessionUserFromRequest(request);

  return Response.json({
    ok: true,
    user,
  });
}
