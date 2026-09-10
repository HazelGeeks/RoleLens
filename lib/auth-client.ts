import { AUTH_SESSION_STORAGE_KEY } from "@/lib/job-cache-scope";
export { AUTH_SESSION_STORAGE_KEY } from "@/lib/job-cache-scope";
export type AuthSessionUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

type AuthSession = {
  user: AuthSessionUser;
};

type AuthFailureResult = {
  ok: false;
  message: string;
};

type AuthSuccessResult = {
  ok: true;
  user: AuthSessionUser;
};

export type AuthOperationResult = AuthFailureResult | AuthSuccessResult;

export type AuthMessageResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export const AUTH_SESSION_UPDATED_EVENT = "rolelens:auth-session-updated";

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parseSessionUser(value: unknown): AuthSessionUser | null {
  if (!value || typeof value !== "object") return null;

  const user = value as Partial<AuthSessionUser>;
  if (
    typeof user.id !== "string" ||
    typeof user.name !== "string" ||
    typeof user.email !== "string" ||
    typeof user.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

function readSession(): AuthSession | null {
  if (typeof window === "undefined") return null;

  const parsed = parseJson(
    window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY),
  );
  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as { user?: unknown };
  const user = parseSessionUser(record.user);
  if (!user) return null;

  return { user };
}

function writeSessionUser(user: AuthSessionUser | null) {
  if (typeof window === "undefined") return;

  if (!user) {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } else {
    window.localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({ user }),
    );
  }

  window.dispatchEvent(new CustomEvent(AUTH_SESSION_UPDATED_EVENT));
}

function getApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const maybeMessage = (payload as { message?: unknown }).message;
  return typeof maybeMessage === "string" ? maybeMessage : null;
}

const AUTH_REQUEST_TIMEOUT_MS = 15_000;

async function requestAuth<T>(
  url: string,
  options: RequestInit,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const result = await read(response);
    if (controller.signal.aborted)
      throw new Error("Authentication request timed out.");
    return result;
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new Error(
        "Authentication request timed out. Please check the server connection and try again.",
      );
    }
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

async function parseAuthResponse(
  response: Response,
): Promise<AuthOperationResult> {
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    return {
      ok: false,
      message:
        getApiErrorMessage(payload) ||
        "Authentication request failed (" + response.status + ")",
    };
  }

  const user = parseSessionUser((payload as { user?: unknown })?.user);
  if (!user) {
    return {
      ok: false,
      message: "Invalid auth response shape.",
    };
  }

  return {
    ok: true,
    user,
  };
}

export function getActiveAuthSessionUser(): AuthSessionUser | null {
  return readSession()?.user ?? null;
}

export function getActiveAuthSessionUserId() {
  return getActiveAuthSessionUser()?.id ?? null;
}

export async function syncAuthSessionFromServer() {
  try {
    const user = await requestAuth(
      "/api/auth/session",
      {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      },
      async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json().catch(() => null)) as {
          user?: unknown;
        } | null;
        return parseSessionUser(payload?.user);
      },
    );
    writeSessionUser(user);
    return user;
  } catch (cause) {
    writeSessionUser(null);
    throw cause;
  }
}

export async function signUpLocalAuth(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthOperationResult> {
  const result = await requestAuth(
    "/api/auth/signup",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        password: input.password,
      }),
    },
    parseAuthResponse,
  );

  if (result.ok) writeSessionUser(result.user);
  return result;
}

export async function signInLocalAuth(input: {
  email: string;
  password: string;
}): Promise<AuthOperationResult> {
  const result = await requestAuth(
    "/api/auth/login",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
      }),
    },
    parseAuthResponse,
  );

  if (result.ok) writeSessionUser(result.user);
  return result;
}

export async function signOutLocalAuth() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Unable to log out. Please retry.");

  writeSessionUser(null);
}

export async function resetPasswordLocalAuth(input: {
  token: string;
  password: string;
}): Promise<AuthMessageResult> {
  const response = await fetch("/api/auth/reset-password", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      token: input.token,
      password: input.password,
    }),
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  const messageFromApi = getApiErrorMessage(payload);
  if (!response.ok) {
    return {
      ok: false,
      message:
        messageFromApi || "Password reset failed (" + response.status + ")",
    };
  }

  writeSessionUser(null);
  return {
    ok: true,
    message:
      messageFromApi || "Password reset successful. Please log in again.",
  };
}

export async function requestPasswordResetLocalAuth(
  email: string,
): Promise<AuthMessageResult> {
  const response = await fetch("/api/auth/request-password-reset", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const payload: unknown = await response.json().catch(() => null);
  return {
    ok: response.ok,
    message:
      getApiErrorMessage(payload) ||
      "Unable to request a reset link. Please retry.",
  };
}
