export type AuthSessionUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

type StoredAuthUser = AuthSessionUser & {
  passwordHash: string;
  updatedAt: string;
};

type AuthSession = {
  user: AuthSessionUser;
  signedInAt: string;
};

type AuthFailure = {
  ok: false;
  message: string;
};

type AuthSuccess = {
  ok: true;
  user: AuthSessionUser;
};

export type AuthOperationResult = AuthFailure | AuthSuccess;

export const AUTH_USERS_STORAGE_KEY = "rolelens.auth.users.v1";
export const AUTH_SESSION_STORAGE_KEY = "rolelens.auth.session.v1";
export const AUTH_SESSION_UPDATED_EVENT = "rolelens:auth-session-updated";

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function hashPasswordForLocalPreview(password: string) {
  // Local scaffold only. This is not a production-grade password strategy.
  let hash = 2166136261;
  for (let index = 0; index < password.length; index += 1) {
    hash ^= password.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `h${(hash >>> 0).toString(16)}`;
}

function readUsers(): StoredAuthUser[] {
  if (typeof window === "undefined") return [];

  const parsed = parseJson<unknown>(
    window.localStorage.getItem(AUTH_USERS_STORAGE_KEY),
  );
  if (!Array.isArray(parsed)) return [];

  return parsed.filter((entry): entry is StoredAuthUser => {
    if (!entry || typeof entry !== "object") return false;
    const value = entry as Partial<StoredAuthUser>;
    return (
      typeof value.id === "string" &&
      typeof value.email === "string" &&
      typeof value.name === "string" &&
      typeof value.createdAt === "string" &&
      typeof value.updatedAt === "string" &&
      typeof value.passwordHash === "string"
    );
  });
}

function writeUsers(users: StoredAuthUser[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_USERS_STORAGE_KEY, JSON.stringify(users));
}

function readSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const parsed = parseJson<unknown>(
    window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY),
  );

  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Partial<AuthSession>;
  if (!value.user || typeof value.user !== "object") return null;

  const user = value.user as Partial<AuthSessionUser>;
  if (
    typeof user.id !== "string" ||
    typeof user.name !== "string" ||
    typeof user.email !== "string" ||
    typeof user.createdAt !== "string" ||
    typeof value.signedInAt !== "string"
  ) {
    return null;
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    },
    signedInAt: value.signedInAt,
  };
}

function writeSession(session: AuthSession | null) {
  if (typeof window === "undefined") return;

  if (!session) {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } else {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  window.dispatchEvent(new CustomEvent(AUTH_SESSION_UPDATED_EVENT));
}

export function getActiveAuthSessionUser() {
  return readSession()?.user ?? null;
}

export function getActiveAuthSessionUserId() {
  return getActiveAuthSessionUser()?.id ?? null;
}

export function signUpLocalAuth(input: {
  name: string;
  email: string;
  password: string;
}): AuthOperationResult {
  if (typeof window === "undefined") {
    return { ok: false, message: "Local auth is only available in the browser." };
  }

  const normalizedName = input.name.trim();
  const normalizedEmail = normalizeEmail(input.email);

  if (normalizedName.length < 2) {
    return { ok: false, message: "Name must be at least 2 characters." };
  }

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { ok: false, message: "Please enter a valid email address." };
  }

  if (input.password.trim().length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }

  const users = readUsers();
  if (users.some((user) => normalizeEmail(user.email) === normalizedEmail)) {
    return { ok: false, message: "This email is already registered." };
  }

  const now = new Date().toISOString();
  const user: StoredAuthUser = {
    id: `user-${crypto.randomUUID()}`,
    email: normalizedEmail,
    name: normalizedName,
    createdAt: now,
    updatedAt: now,
    passwordHash: hashPasswordForLocalPreview(input.password),
  };

  writeUsers([...users, user]);
  writeSession({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
    signedInAt: now,
  });

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
  };
}

export function signInLocalAuth(input: {
  email: string;
  password: string;
}): AuthOperationResult {
  const normalizedEmail = normalizeEmail(input.email);
  const users = readUsers();
  const matchedUser = users.find(
    (user) => normalizeEmail(user.email) === normalizedEmail,
  );

  if (!matchedUser) {
    return { ok: false, message: "No account found for this email." };
  }

  const passwordHash = hashPasswordForLocalPreview(input.password);
  if (matchedUser.passwordHash !== passwordHash) {
    return { ok: false, message: "Incorrect password." };
  }

  const user: AuthSessionUser = {
    id: matchedUser.id,
    email: matchedUser.email,
    name: matchedUser.name,
    createdAt: matchedUser.createdAt,
  };
  writeSession({ user, signedInAt: new Date().toISOString() });
  return { ok: true, user };
}

export function signOutLocalAuth() {
  writeSession(null);
}
