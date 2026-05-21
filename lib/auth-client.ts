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

export const AUTH_SESSION_STORAGE_KEY = "rolelens.auth.session.v1";
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

  const parsed = parseJson(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY));
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
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ user }));
  }

  window.dispatchEvent(new CustomEvent(AUTH_SESSION_UPDATED_EVENT));
}

function getApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const maybeMessage = (payload as { message?: unknown }).message;
  return typeof maybeMessage === "string" ? maybeMessage : null;
}

async function parseAuthResponse(response: Response): Promise<AuthOperationResult> {
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

  writeSessionUser(user);
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
  const response = await fetch("/api/auth/session", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    writeSessionUser(null);
    return null;
  }

  const payload = (await response.json().catch(() => null)) as { user?: unknown } | null;
  const user = parseSessionUser(payload?.user);
  writeSessionUser(user);
  return user;
}

export async function signUpLocalAuth(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthOperationResult> {
  const response = await fetch("/api/auth/signup", {
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
  });

  return parseAuthResponse(response);
}

export async function signInLocalAuth(input: {
  email: string;
  password: string;
}): Promise<AuthOperationResult> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });

  return parseAuthResponse(response);
}

export async function signOutLocalAuth() {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  }).catch(() => null);

  writeSessionUser(null);
}
