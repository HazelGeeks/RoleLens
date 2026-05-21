type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
};

type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
};

type AuthBackend =
  | {
      kind: "memory";
    }
  | {
      kind: "d1";
      db: D1DatabaseLike;
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

const AUTH_COOKIE_NAME = "rolelens_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_HASH_ALGORITHM = "sha256";
const DEFAULT_D1_BINDING = "DB";
const DEV_AUTH_PASSWORD_PEPPER_FALLBACK = "rolelens-dev-insecure-pepper";

const memoryUsersById = new Map<string, AuthUserRecord>();
const memoryUserIdsByEmail = new Map<string, string>();
const memorySessionsByTokenHash = new Map<string, AuthSessionRecord>();

const textEncoder = new TextEncoder();
let didWarnMissingPepperInDev = false;

function resolveAuthPasswordPepper() {
  const pepper = process.env.AUTH_PASSWORD_PEPPER?.trim();
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

function isD1DatabaseLike(value: unknown): value is D1DatabaseLike {
  if (!value || typeof value !== "object") return false;
  const maybeDb = value as { prepare?: unknown };
  return typeof maybeDb.prepare === "function";
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
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
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
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
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
    return { ok: false as const, message: "Please enter a valid email address." };
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
  const pepper = resolveAuthPasswordPepper();
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

  const pepper = resolveAuthPasswordPepper();
  const actualBase64 = await createSha256Base64(password + ":" + saltBase64 + ":" + pepper);
  const actualBytes = base64ToBytes(actualBase64);
  const expectedBytes = base64ToBytes(expectedBase64);

  return safeEqualBytes(actualBytes, expectedBytes);
}

function findD1InEnv(
  env: Record<string, unknown> | undefined,
  preferredName: string,
): D1DatabaseLike | undefined {
  if (!env) return undefined;

  const preferred = env[preferredName];
  if (isD1DatabaseLike(preferred)) return preferred;

  const hinted = Object.entries(env).find(
    ([key, value]) => key.toLowerCase().includes("db") && isD1DatabaseLike(value),
  )?.[1];
  if (isD1DatabaseLike(hinted)) return hinted;

  const first = Object.values(env).find((value) => isD1DatabaseLike(value));
  return isD1DatabaseLike(first) ? first : undefined;
}

function getD1FromGlobalScope(bindingName: string): D1DatabaseLike | undefined {
  const scope = globalThis as Record<string, unknown> & {
    __env__?: Record<string, unknown>;
    __ENV__?: Record<string, unknown>;
  };

  const direct = scope[bindingName];
  if (isD1DatabaseLike(direct)) return direct;

  const lowerEnvCandidate = findD1InEnv(scope.__env__, bindingName);
  if (lowerEnvCandidate) return lowerEnvCandidate;

  const upperEnvCandidate = findD1InEnv(scope.__ENV__, bindingName);
  if (upperEnvCandidate) return upperEnvCandidate;

  return undefined;
}

async function getD1DatabaseFromRequestContext(): Promise<D1DatabaseLike | undefined> {
  const bindingName =
    process.env.PERSISTENCE_D1_BINDING?.trim() || DEFAULT_D1_BINDING;

  try {
    const { getRequestContext } = await import("@cloudflare/next-on-pages");
    const context = getRequestContext();
    const env = context.env as Record<string, unknown> | undefined;
    const candidate = findD1InEnv(env, bindingName);
    if (candidate) {
      return candidate;
    }
  } catch {
    // Ignore context lookup errors; global binding fallback is checked below.
  }

  const processCandidate = (process.env as Record<string, unknown>)[bindingName];
  if (isD1DatabaseLike(processCandidate)) {
    return processCandidate;
  }

  return getD1FromGlobalScope(bindingName);
}

async function resolveAuthBackend(): Promise<AuthBackend> {
  const configured = process.env.AUTH_BACKEND?.trim().toLowerCase();
  const persistenceBackend = process.env.PERSISTENCE_BACKEND?.trim().toLowerCase();

  if (configured && configured !== "memory" && configured !== "d1") {
    throw new Error(
      "Invalid AUTH_BACKEND value: " + configured + ". Expected memory or d1.",
    );
  }

  if (configured === "memory") {
    return { kind: "memory" };
  }

  const shouldUseD1 = configured === "d1" || persistenceBackend === "d1";
  const db = await getD1DatabaseFromRequestContext();

  if (!shouldUseD1 && db) {
    return { kind: "d1", db };
  }

  if (!shouldUseD1) {
    return { kind: "memory" };
  }

  if (!db) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "Auth backend is configured for d1 but D1 binding is unavailable in this runtime; falling back to memory backend.",
      );
      return { kind: "memory" };
    }

    throw new Error(
      "Auth backend is configured for d1, but no D1 binding is available in request context.",
    );
  }

  return { kind: "d1", db };
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
  const pepper = resolveAuthPasswordPepper();
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

type AuthD1UserRow = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

type AuthD1SessionJoinRow = {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  expiresAt: string;
};

async function getAuthUserByEmailD1(db: D1DatabaseLike, email: string) {
  const row = await db
    .prepare(
      "SELECT id, email, name, password_hash as passwordHash, created_at as createdAt, updated_at as updatedAt " +
        "FROM auth_users WHERE email = ? LIMIT 1",
    )
    .bind(email)
    .first<AuthD1UserRow>();

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

async function insertAuthSessionD1(db: D1DatabaseLike, session: AuthSessionRecord) {
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

export async function signUpAuth(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthMutationResult> {
  const validated = validateCredentials(input);
  if (!validated.ok) return { ok: false, status: 400, message: validated.message };

  const backend = await resolveAuthBackend();
  const now = new Date().toISOString();
  const user: AuthUserRecord = {
    id: "user-" + crypto.randomUUID(),
    email: validated.email,
    name: validated.name || "User",
    passwordHash: await hashPassword(validated.password),
    createdAt: now,
    updatedAt: now,
  };

  if (backend.kind === "memory") {
    if (memoryUserIdsByEmail.has(user.email)) {
      return { ok: false, status: 409, message: "This email is already registered." };
    }
    memoryUsersById.set(user.id, user);
    memoryUserIdsByEmail.set(user.email, user.id);
    const session = await createSessionRecord(user.id);
    memorySessionsByTokenHash.set(session.record.tokenHash, session.record);
    return { ok: true, user: toSessionUser(user), sessionToken: session.sessionToken };
  }

  try {
    await backend.db
      .prepare(
        "INSERT INTO auth_users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(user.id, user.email, user.name, user.passwordHash, user.createdAt, user.updatedAt)
      .run();
  } catch (error) {
    if (isLikelyUniqueConstraintError(error)) {
      return { ok: false, status: 409, message: "This email is already registered." };
    }
    throw error;
  }

  const session = await createSessionRecord(user.id);
  await insertAuthSessionD1(backend.db, session.record);
  return { ok: true, user: toSessionUser(user), sessionToken: session.sessionToken };
}

export async function signInAuth(input: {
  email: string;
  password: string;
}): Promise<AuthMutationResult> {
  const validated = validateCredentials(input);
  if (!validated.ok) return { ok: false, status: 400, message: validated.message };

  const backend = await resolveAuthBackend();

  let user: AuthUserRecord | undefined;
  if (backend.kind === "memory") {
    const userId = memoryUserIdsByEmail.get(validated.email);
    user = userId ? memoryUsersById.get(userId) : undefined;
  } else {
    user = await getAuthUserByEmailD1(backend.db, validated.email);
  }

  if (!user) return { ok: false, status: 401, message: "No account found for this email. Please sign up first." };

  const matches = await verifyPassword(validated.password, user.passwordHash);
  if (!matches) return { ok: false, status: 401, message: "Incorrect password." };

  const session = await createSessionRecord(user.id);
  if (backend.kind === "memory") {
    memorySessionsByTokenHash.set(session.record.tokenHash, session.record);
  } else {
    await insertAuthSessionD1(backend.db, session.record);
  }

  return { ok: true, user: toSessionUser(user), sessionToken: session.sessionToken };
}

export function getAuthSessionTokenFromRequest(request: Request) {
  const token = parseCookies(request.headers.get("cookie")).get(AUTH_COOKIE_NAME)?.trim();
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

  const pepper = resolveAuthPasswordPepper();
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
    .first<AuthD1SessionJoinRow>();

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

  const pepper = resolveAuthPasswordPepper();
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
  memoryUsersById.clear();
  memoryUserIdsByEmail.clear();
  memorySessionsByTokenHash.clear();
  didWarnMissingPepperInDev = false;
}
