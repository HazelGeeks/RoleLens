import postgres from "postgres";

const DEFAULT_HYPERDRIVE_BINDING = "HYPERDRIVE";

export type DatabasePreparedStatementLike = {
  bind(...values: unknown[]): DatabasePreparedStatementLike;
  run(): Promise<{
    meta?: {
      changes?: number;
    };
  }>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
};

export type DatabaseLike = {
  prepare(query: string): DatabasePreparedStatementLike;
};

type HyperdriveBindingLike = {
  connectionString: string;
};

function isHyperdriveBindingLike(value: unknown): value is HyperdriveBindingLike {
  if (!value || typeof value !== "object") return false;
  return typeof (value as { connectionString?: unknown }).connectionString === "string";
}

function toPostgresParameters(
  values: unknown[],
): postgres.ParameterOrJSON<never>[] {
  return values.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value instanceof Date ||
      value instanceof Uint8Array
    ) {
      return value;
    }

    throw new TypeError(
      `Unsupported Postgres query parameter type: ${typeof value}`,
    );
  });
}

/**
 * Keeps the existing repository SQL readable while moving from D1-style anonymous
 * placeholders to PostgreSQL's numbered placeholders. Alias quoting is needed
 * because PostgreSQL otherwise folds camelCase aliases to lowercase.
 */
export function normalizePostgresQuery(query: string) {
  let parameterIndex = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let normalized = "";

  for (let index = 0; index < query.length; index += 1) {
    const character = query[index];
    const previous = query[index - 1];

    if (character === "'" && !inDoubleQuote && previous !== "\\") {
      inSingleQuote = !inSingleQuote;
    } else if (character === '"' && !inSingleQuote && previous !== "\\") {
      inDoubleQuote = !inDoubleQuote;
    }

    if (character === "?" && !inSingleQuote && !inDoubleQuote) {
      parameterIndex += 1;
      normalized += `$${parameterIndex}`;
      continue;
    }

    normalized += character;
  }

  return normalized.replace(
    /\bAS\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
    (_match, alias: string) => `AS "${alias}"`,
  );
}

function createPostgresDatabase(connectionString: string): DatabaseLike {
  const sql = postgres(connectionString, {
    max: 5,
    fetch_types: false,
    prepare: true,
    idle_timeout: 5,
    max_lifetime: 60,
  });

  return {
    prepare(query: string) {
      const normalizedQuery = normalizePostgresQuery(query);
      let values: unknown[] = [];

      const statement: DatabasePreparedStatementLike = {
        bind(...nextValues: unknown[]) {
          values = nextValues;
          return statement;
        },
        async run() {
          const parameters = toPostgresParameters(values);
          const result = await sql.unsafe<Record<string, unknown>[]>(
            normalizedQuery,
            parameters,
          );
          return { meta: { changes: result.count } };
        },
        async all<T = unknown>() {
          const parameters = toPostgresParameters(values);
          const result = await sql.unsafe<Record<string, unknown>[]>(
            normalizedQuery,
            parameters,
          );
          return { results: result as T[] };
        },
        async first<T = unknown>() {
          const parameters = toPostgresParameters(values);
          const result = await sql.unsafe<Record<string, unknown>[]>(
            normalizedQuery,
            parameters,
          );
          return (result[0] as T | undefined) ?? null;
        },
      };

      return statement;
    },
  };
}

function getHyperdriveFromGlobalScope(bindingName: string) {
  const scope = globalThis as Record<string, unknown> & {
    __env__?: Record<string, unknown>;
    __ENV__?: Record<string, unknown>;
  };

  const candidates = [
    scope[bindingName],
    scope.__env__?.[bindingName],
    scope.__ENV__?.[bindingName],
  ];

  return candidates.find(isHyperdriveBindingLike);
}

export async function getDatabaseFromContext(
  bindingName =
    process.env.PERSISTENCE_DATABASE_BINDING?.trim() || DEFAULT_HYPERDRIVE_BINDING,
): Promise<DatabaseLike | undefined> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    const env = context.env as Record<string, unknown> | undefined;
    const candidate = env?.[bindingName];
    if (isHyperdriveBindingLike(candidate)) {
      return createPostgresDatabase(candidate.connectionString);
    }
  } catch {
    // Non-Cloudflare runtimes use the development fallbacks below.
  }

  const globalBinding = getHyperdriveFromGlobalScope(bindingName);
  if (globalBinding) {
    return createPostgresDatabase(globalBinding.connectionString);
  }

  if (process.env.NODE_ENV !== "production") {
    const localConnectionString = process.env.DATABASE_URL?.trim();
    if (localConnectionString) {
      return createPostgresDatabase(localConnectionString);
    }
  }

  return undefined;
}
