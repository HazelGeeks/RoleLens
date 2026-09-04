import { getPasswordResetDelivery } from "@/lib/auth-email";
import { getDatabaseFromContext, type DatabaseLike } from "@/lib/database";

type AuthBackend =
  | {
      kind: "memory";
    }
  | {
      kind: "postgres";
      db: DatabaseLike;
    };

type AuthUserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

type AuthSessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
};

export type AuthSessionUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

type AuthMutationSuccess = {
  ok: true;
  user: AuthSessionUser;
  sessionToken: string;
};

type AuthMutationFailure = {
  ok: false;
  status: number;
  message: string;
};

export type AuthMutationResult = AuthMutationSuccess | AuthMutationFailure;

type AuthPasswordResetSuccess = {
  ok: true;
  message: string;
};

type AuthPasswordResetFailure = {
  ok: false;
  status: number;
  message: string;
};

export type AuthPasswordResetResult =
  AuthPasswordResetSuccess | AuthPasswordResetFailure;

const AUTH_COOKIE_NAME = "rolelens_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_HASH_ALGORITHM = "sha256";
const DEV_AUTH_PASSWORD_PEPPER_FALLBACK = "rolelens-dev-insecure-pepper";

const memoryUsersById = new Map<string, AuthUserRecord>();
const memoryUserIdsByEmail = new Map<string, string>();
const memorySessionsByTokenHash = new Map<string, AuthSessionRecord>();

type PasswordResetRecord = {
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
};
const memoryPasswordResets = new Map<string, PasswordResetRecord>();
const PASSWORD_RESET_MAX_AGE_SECONDS = 15 * 60;
const PASSWORD_RESET_MESSAGE =
  "If an account exists for this email, a password reset link will be sent. Check your inbox.";

const textEncoder = new TextEncoder();
let didWarnMissingPepperInDev = false;

function getRuntimeEnvValueFromGlobalScope(name: string) {
  const scope = globalThis as Record<string, unknown> & {
    __env__?: Record<string, unknown>;
    __ENV__?: Record<string, unknown>;
  };

  const direct = scope[name];
  if (typeof direct === "string") return direct.trim();

  const lowerEnvCandidate = scope.__env__?.[name];
  if (typeof lowerEnvCandidate === "string") return lowerEnvCandidate.trim();

  const upperEnvCandidate = scope.__ENV__?.[name];
  if (typeof upperEnvCandidate === "string") return upperEnvCandidate.trim();

  return undefined;
}

async function getRuntimeEnvValue(name: string) {
  const processValue = process.env[name]?.trim();
  if (processValue) return processValue;

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    const env = context.env as Record<string, unknown> | undefined;
    const value = env?.[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  } catch {
    // Ignore context lookup errors; global binding fallback is checked below.
  }

  return getRuntimeEnvValueFromGlobalScope(name);
}

async function resolveAuthPasswordPepper() {
  const pepper = await getRuntimeEnvValue("AUTH_PASSWORD_PEPPER");
  if (pepper) return pepper;

  const environment = process.env.NODE_ENV?.trim().toLowerCase();
  if (environment === "production") {
    throw new Error(
      "AUTH_PASSWORD_PEPPER is required in production. Set AUTH_PASSWORD_PEPPER=<long-random-value> in your runtime secrets.",
    );
  }

  if (environment !== "test" && !didWarnMissingPepperInDev) {
    didWarnMissingPepperInDev = true;
    console.warn(
      "AUTH_PASSWORD_PEPPER is not set. Using a development-only fallback pepper; set AUTH_PASSWORD_PEPPER in .env.local to keep local auth hashes stable.",
    );
  }

  return DEV_AUTH_PASSWORD_PEPPER_FALLBACK;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toBase64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createRandomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function safeEqualBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }

  return diff === 0;
}

async function createSha256Base64(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(value),
  );
  return bytesToBase64(new Uint8Array(digest));
}

function parseCookies(rawCookieHeader: string | null) {
  const result = new Map<string, string>();
  if (!rawCookieHeader) return result;

  rawCookieHeader.split(";").forEach((segment) => {
    const [rawName, ...rawValue] = segment.split("=");
    const name = rawName?.trim();
    if (!name) return;
    result.set(name, rawValue.join("=").trim());
  });

  return result;
}

function addSecondsAsIso(iso: string, seconds: number) {
  const next = new Date(iso);
  next.setSeconds(next.getSeconds() + seconds);
  return next.toISOString();
}

function isLikelyUniqueConstraintError(error: unknown) {
  if (!error) return false;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.toLowerCase();
  return normalized.includes("unique") || normalized.includes("constraint");
}

function validateCredentials(input: {
  email: string;
  password: string;
  name?: string;
}) {
  const email = normalizeEmail(input.email);
  const password = input.password;
  const name = input.name?.trim();

  if (!email || !email.includes("@")) {
    return {
      ok: false as const,
      message: "Please enter a valid email address.",
    };
  }

  if (password.trim().length < 8) {
    return {
      ok: false as const,
      message: "Password must be at least 8 characters.",
    };
  }

  if (name != null && name.length < 2) {
    return {
      ok: false as const,
      message: "Name must be at least 2 characters.",
    };
  }

  return { ok: true as const, email, password, name };
}

async function hashPassword(password: string) {
  const pepper = await resolveAuthPasswordPepper();
  const salt = createRandomBytes(16);
  const digestBase64 = await createSha256Base64(
    password + ":" + bytesToBase64(salt) + ":" + pepper,
  );
  return [PASSWORD_HASH_ALGORITHM, bytesToBase64(salt), digestBase64].join("$");
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, saltBase64, expectedBase64] = storedHash.split("$");
  if (algorithm !== PASSWORD_HASH_ALGORITHM || !saltBase64 || !expectedBase64) {
    return false;
  }

  const pepper = await resolveAuthPasswordPepper();
  const actualBase64 = await createSha256Base64(
    password + ":" + saltBase64 + ":" + pepper,
  );
  const actualBytes = base64ToBytes(actualBase64);
  const expectedBytes = base64ToBytes(expectedBase64);

  return safeEqualBytes(actualBytes, expectedBytes);
}

async function resolveAuthBackend(): Promise<AuthBackend> {
  const configured = process.env.AUTH_BACKEND?.trim().toLowerCase();
  const persistenceBackend =
    process.env.PERSISTENCE_BACKEND?.trim().toLowerCase();
  const isProduction =
    process.env.NODE_ENV?.trim().toLowerCase() === "production";

  if (configured && configured !== "memory" && configured !== "postgres") {
    throw new Error(
      "Invalid AUTH_BACKEND value: " +
        configured +
        ". Expected memory or postgres.",
    );
  }

  if (configured === "memory") {
    return { kind: "memory" };
  }

  const shouldUsePostgres =
    configured === "postgres" ||
    persistenceBackend === "postgres" ||
    isProduction;
  const db = await getDatabaseFromContext();

  if (!shouldUsePostgres && db) {
    return { kind: "postgres", db };
  }

  if (!shouldUsePostgres) {
    return { kind: "memory" };
  }

  if (!db) {
    if (!isProduction) {
      console.warn(
        "Auth backend is configured for postgres but Hyperdrive binding is unavailable in this runtime; falling back to memory backend.",
      );
      return { kind: "memory" };
    }

    throw new Error(
      "Auth requires postgres, but no Hyperdrive binding is available in request context.",
    );
  }

  return { kind: "postgres", db };
}

function toSessionUser(user: AuthUserRecord): AuthSessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}

async function createSessionRecord(userId: string) {
  const now = new Date().toISOString();
  const sessionToken = toBase64Url(createRandomBytes(32));
  const pepper = await resolveAuthPasswordPepper();
  const tokenHash = await createSha256Base64(sessionToken + ":" + pepper);
  return {
    sessionToken,
    record: {
      id: crypto.randomUUID(),
      userId,
      tokenHash,
      createdAt: now,
      expiresAt: addSecondsAsIso(now, SESSION_MAX_AGE_SECONDS),
      lastSeenAt: now,
    } satisfies AuthSessionRecord,
  };
}

type AuthPostgresUserRow = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

type AuthPostgresSessionJoinRow = {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  expiresAt: string;
};

async function getAuthUserByEmailPostgres(db: DatabaseLike, email: string) {
  const row = await db
    .prepare(
      "SELECT id, email, name, password_hash as passwordHash, created_at as createdAt, updated_at as updatedAt " +
        "FROM auth_users WHERE email = ? LIMIT 1",
    )
    .bind(email)
    .first<AuthPostgresUserRow>();

  return row
    ? {
        id: row.id,
        email: row.email,
        name: row.name,
        passwordHash: row.passwordHash,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    : undefined;
}

async function insertAuthSessionPostgres(
  db: DatabaseLike,
  session: AuthSessionRecord,
) {
  await db
    .prepare(
      "INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      session.id,
      session.userId,
      session.tokenHash,
      session.createdAt,
      session.expiresAt,
      session.lastSeenAt,
    )
    .run();
}

function clearAuthSessionsForUserMemory(userId: string) {
  for (const [tokenHash, session] of memorySessionsByTokenHash.entries()) {
    if (session.userId === userId) {
      memorySessionsByTokenHash.delete(tokenHash);
    }
  }
}

export async function signUpAuth(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthMutationResult> {
  const validated = validateCredentials(input);
  if (!validated.ok)
    return { ok: false, status: 400, message: validated.message };

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(validated.password);
  const backend = await resolveAuthBackend();
  const user: AuthUserRecord = {
    id: "user-" + crypto.randomUUID(),
    email: validated.email,
    name: validated.name || "User",
    passwordHash,
    createdAt: now,
    updatedAt: now,
  };

  if (backend.kind === "memory") {
    if (memoryUserIdsByEmail.has(user.email)) {
      return {
        ok: false,
        status: 409,
        message: "This email is already registered.",
      };
    }
    memoryUsersById.set(user.id, user);
    memoryUserIdsByEmail.set(user.email, user.id);
    const session = await createSessionRecord(user.id);
    memorySessionsByTokenHash.set(session.record.tokenHash, session.record);
    return {
      ok: true,
      user: toSessionUser(user),
      sessionToken: session.sessionToken,
    };
  }

  try {
    await backend.db
      .prepare(
        "INSERT INTO auth_users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        user.id,
        user.email,
        user.name,
        user.passwordHash,
        user.createdAt,
        user.updatedAt,
      )
      .run();
  } catch (error) {
    if (isLikelyUniqueConstraintError(error)) {
      return {
        ok: false,
        status: 409,
        message: "This email is already registered.",
      };
    }
    throw error;
  }

  const session = await createSessionRecord(user.id);
  await insertAuthSessionPostgres(backend.db, session.record);
  return {
    ok: true,
    user: toSessionUser(user),
    sessionToken: session.sessionToken,
  };
}

export async function signInAuth(input: {
  email: string;
  password: string;
}): Promise<AuthMutationResult> {
  const validated = validateCredentials(input);
  if (!validated.ok)
    return { ok: false, status: 400, message: validated.message };

  const backend = await resolveAuthBackend();

  let user: AuthUserRecord | undefined;
  if (backend.kind === "memory") {
    const userId = memoryUserIdsByEmail.get(validated.email);
    user = userId ? memoryUsersById.get(userId) : undefined;
  } else {
    user = await getAuthUserByEmailPostgres(backend.db, validated.email);
  }

  if (!user)
    return {
      ok: false,
      status: 401,
      message: "No account found for this email. Please sign up first.",
    };

  const matches = await verifyPassword(validated.password, user.passwordHash);
  if (!matches)
    return { ok: false, status: 401, message: "Incorrect password." };

  const session = await createSessionRecord(user.id);
  if (backend.kind === "memory") {
    memorySessionsByTokenHash.set(session.record.tokenHash, session.record);
  } else {
    await insertAuthSessionPostgres(backend.db, session.record);
  }

  return {
    ok: true,
    user: toSessionUser(user),
    sessionToken: session.sessionToken,
  };
}

export async function requestPasswordResetAuth(
  emailInput: string,
): Promise<AuthPasswordResetResult> {
  const email = normalizeEmail(emailInput);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false,
      status: 400,
      message: "Please enter a valid email address.",
    };
  }
  const deliver = await getPasswordResetDelivery();
  const backend = await resolveAuthBackend();
  const user =
    backend.kind === "memory"
      ? memoryUsersById.get(memoryUserIdsByEmail.get(email) ?? "")
      : await getAuthUserByEmailPostgres(backend.db, email);
  if (!user) return { ok: true, message: PASSWORD_RESET_MESSAGE };

  const token = toBase64Url(createRandomBytes(32));
  const pepper = await resolveAuthPasswordPepper();
  const tokenHash = await createSha256Base64(
    "password-reset:" + token + ":" + pepper,
  );
  const now = new Date().toISOString();
  const threshold = addSecondsAsIso(now, -60);
  const record = {
    userId: user.id,
    tokenHash,
    createdAt: now,
    expiresAt: addSecondsAsIso(now, PASSWORD_RESET_MAX_AGE_SECONDS),
  };
  if (backend.kind === "memory") {
    const previous = memoryPasswordResets.get(user.id);
    if (previous && previous.createdAt > threshold)
      return { ok: true, message: PASSWORD_RESET_MESSAGE };
    memoryPasswordResets.set(user.id, record);
  } else {
    const issued = await backend.db
      .prepare(
        "INSERT INTO auth_password_reset_tokens (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at " +
          "WHERE auth_password_reset_tokens.created_at <= ? RETURNING user_id AS userId",
      )
      .bind(user.id, tokenHash, now, record.expiresAt, threshold)
      .first<{ userId: string }>();
    if (!issued) return { ok: true, message: PASSWORD_RESET_MESSAGE };
  }
  try {
    await deliver(user.email, token);
  } catch {
    if (backend.kind === "memory") {
      if (memoryPasswordResets.get(user.id)?.tokenHash === tokenHash)
        memoryPasswordResets.delete(user.id);
    } else {
      await backend.db
        .prepare(
          "DELETE FROM auth_password_reset_tokens WHERE user_id = ? AND token_hash = ?",
        )
        .bind(user.id, tokenHash)
        .run();
    }
    // Do not expose the provider response, recipient, or recovery token.
    throw new Error("Password reset email delivery failed");
  }
  return { ok: true, message: PASSWORD_RESET_MESSAGE };
}

export async function resetPasswordAuth(input: {
  token: string;
  password: string;
}): Promise<AuthPasswordResetResult> {
  const invalid = {
    ok: false as const,
    status: 400,
    message: "This reset link is invalid or expired. Request a new link.",
  };
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) return invalid;
  if (input.password.trim().length < 8 || input.password.length > 1024) {
    return {
      ok: false,
      status: 400,
      message: "Password must be between 8 and 1024 characters.",
    };
  }
  const backend = await resolveAuthBackend();
  const pepper = await resolveAuthPasswordPepper();
  const tokenHash = await createSha256Base64(
    "password-reset:" + input.token + ":" + pepper,
  );
  const passwordHash = await hashPassword(input.password);
  const now = new Date().toISOString();
  if (backend.kind === "memory") {
    const record = Array.from(memoryPasswordResets.values()).find(
      (entry) => entry.tokenHash === tokenHash,
    );
    if (!record || record.expiresAt <= now) return invalid;
    const user = memoryUsersById.get(record.userId);
    if (!user) return invalid;
    // No await between consumption and mutation: concurrent attempts cannot reuse the token.
    memoryPasswordResets.delete(user.id);
    memoryUsersById.set(user.id, { ...user, passwordHash, updatedAt: now });
    clearAuthSessionsForUserMemory(user.id);
  } else {
    // One SQL statement atomically consumes the token, updates the password, and revokes sessions.
    const updated = await backend.db
      .prepare(
        "WITH consumed AS (DELETE FROM auth_password_reset_tokens WHERE token_hash = ? AND expires_at > ? RETURNING user_id), " +
          "updated AS (UPDATE auth_users SET password_hash = ?, updated_at = ? FROM consumed WHERE auth_users.id = consumed.user_id RETURNING auth_users.id), " +
          "revoked AS (DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM updated)) SELECT id FROM updated",
      )
      .bind(tokenHash, now, passwordHash, now)
      .first<{ id: string }>();
    if (!updated) return invalid;
  }
  return {
    ok: true,
    message: "Password reset successful. Please log in with your new password.",
  };
}

export function getAuthSessionTokenFromRequest(request: Request) {
  const token = parseCookies(request.headers.get("cookie"))
    .get(AUTH_COOKIE_NAME)
    ?.trim();
  return token || null;
}

export function buildAuthSessionCookie(requestUrl: string, token: string) {
  const secure = requestUrl.startsWith("https://");
  return (
    AUTH_COOKIE_NAME +
    "=" +
    token +
    "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" +
    SESSION_MAX_AGE_SECONDS +
    (secure ? "; Secure" : "")
  );
}

export function buildAuthSessionClearCookie(requestUrl: string) {
  const secure = requestUrl.startsWith("https://");
  return (
    AUTH_COOKIE_NAME +
    "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT" +
    (secure ? "; Secure" : "")
  );
}

export async function getAuthSessionUserFromRequest(request: Request) {
  const token = getAuthSessionTokenFromRequest(request);
  if (!token) return null;

  const pepper = await resolveAuthPasswordPepper();
  const tokenHash = await createSha256Base64(token + ":" + pepper);
  const now = new Date().toISOString();
  const backend = await resolveAuthBackend();

  if (backend.kind === "memory") {
    const session = memorySessionsByTokenHash.get(tokenHash);
    if (!session || session.expiresAt <= now) return null;

    const user = memoryUsersById.get(session.userId);
    return user ? toSessionUser(user) : null;
  }

  const row = await backend.db
    .prepare(
      "SELECT u.id as userId, u.email as email, u.name as name, u.created_at as createdAt, s.expires_at as expiresAt " +
        "FROM auth_sessions s INNER JOIN auth_users u ON u.id = s.user_id " +
        "WHERE s.token_hash = ? LIMIT 1",
    )
    .bind(tokenHash)
    .first<AuthPostgresSessionJoinRow>();

  if (!row || row.expiresAt <= now) return null;

  return {
    id: row.userId,
    email: row.email,
    name: row.name,
    createdAt: row.createdAt,
  };
}

export async function signOutAuth(request: Request) {
  const token = getAuthSessionTokenFromRequest(request);
  if (!token) return;

  const pepper = await resolveAuthPasswordPepper();
  const tokenHash = await createSha256Base64(token + ":" + pepper);
  const backend = await resolveAuthBackend();

  if (backend.kind === "memory") {
    memorySessionsByTokenHash.delete(tokenHash);
    return;
  }

  await backend.db
    .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .run();
}

export function resetAuthStoreForTests() {
  memoryPasswordResets.clear();
  memoryUsersById.clear();
  memoryUserIdsByEmail.clear();
  memorySessionsByTokenHash.clear();
  didWarnMissingPepperInDev = false;
}
