import {
  getAuthSessionUserFromRequest,
  type AuthSessionUser,
} from "@/lib/auth-server";
import { getRuntimeEnv, type RuntimeEnv } from "@/lib/runtime-env";

type AdminAccessResult =
  | {
      ok: true;
      env: RuntimeEnv;
      user: AuthSessionUser;
    }
  | {
      ok: false;
      env: RuntimeEnv;
      status: 401 | 403;
      message: string;
      user: AuthSessionUser | null;
    };

function normalizeAdminEmail(value: string) {
  return value.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

export function getConfiguredAdminEmails(env: RuntimeEnv) {
  const configuredEmails = [
    env.ADMIN_EMAILS || "",
    env.ROLELENS_ADMIN_EMAILS || "",
    env.SYNC_ADMIN_EMAILS || "",
    env.SYNC_ADMIN_EMAIL || "",
  ].join(",");

  return new Set(
    configuredEmails
      .split(",")
      .map(normalizeAdminEmail)
      .filter(Boolean),
  );
}

export async function getAdminAccessForRequest(
  request: Request,
): Promise<AdminAccessResult> {
  const env = await getRuntimeEnv();
  const user = await getAuthSessionUserFromRequest(request);

  if (!user) {
    return {
      ok: false,
      env,
      status: 401,
      message: "Login required",
      user: null,
    };
  }

  const adminEmails = getConfiguredAdminEmails(env);
  if (adminEmails.size === 0) {
    return {
      ok: false,
      env,
      status: 403,
      message: "Admin emails are not configured",
      user,
    };
  }

  if (!adminEmails.has(normalizeAdminEmail(user.email))) {
    return {
      ok: false,
      env,
      status: 403,
      message: "Admin access required",
      user,
    };
  }

  return {
    ok: true,
    env,
    user,
  };
}
