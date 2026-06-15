const DEFAULT_D1_BINDING = "DB";

export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  run(): Promise<{
    meta?: {
      changes?: number;
    };
  }>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
};

function isD1DatabaseLike(value: unknown): value is D1DatabaseLike {
  if (!value || typeof value !== "object") return false;
  return typeof (value as { prepare?: unknown }).prepare === "function";
}

function getD1FromGlobalScope(bindingName: string): D1DatabaseLike | undefined {
  const scope = globalThis as Record<string, unknown> & {
    __env__?: Record<string, unknown>;
    __ENV__?: Record<string, unknown>;
  };

  const direct = scope[bindingName];
  if (isD1DatabaseLike(direct)) return direct;

  const lowerEnvCandidate = scope.__env__?.[bindingName];
  if (isD1DatabaseLike(lowerEnvCandidate)) return lowerEnvCandidate;

  const upperEnvCandidate = scope.__ENV__?.[bindingName];
  if (isD1DatabaseLike(upperEnvCandidate)) return upperEnvCandidate;

  return undefined;
}

export async function getD1DatabaseFromContext(
  bindingName = process.env.PERSISTENCE_D1_BINDING?.trim() || DEFAULT_D1_BINDING,
): Promise<D1DatabaseLike | undefined> {
  try {
    const { getRequestContext } = await import("@cloudflare/next-on-pages");
    const context = getRequestContext();
    const env = context.env as Record<string, unknown> | undefined;
    const candidate = env?.[bindingName];
    if (isD1DatabaseLike(candidate)) {
      return candidate;
    }
  } catch {
    // Non-Cloudflare runtimes use process/global fallbacks.
  }

  return getD1FromGlobalScope(bindingName);
}
