import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabaseFromContext, normalizePostgresQuery } from "@/lib/database";

describe("normalizePostgresQuery", () => {
  it("numbers compatibility placeholders and preserves camelCase aliases", () => {
    expect(
      normalizePostgresQuery(
        "SELECT user_id AS userId FROM auth_users WHERE email = ? AND id = ?",
      ),
    ).toBe(
      'SELECT user_id AS "userId" FROM auth_users WHERE email = $1 AND id = $2',
    );
  });

  it("does not rewrite question marks inside string literals", () => {
    expect(
      normalizePostgresQuery(
        "SELECT '?' AS marker FROM auth_users WHERE id = ?",
      ),
    ).toBe("SELECT '?' AS \"marker\" FROM auth_users WHERE id = $1");
  });
});

const { connect, getContext } = vi.hoisted(() => ({
  connect: vi.fn(() => ({ unsafe: vi.fn(), begin: vi.fn() })),
  getContext: vi.fn(),
}));
vi.mock("postgres", () => ({ default: connect }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: getContext }));

describe("database connection selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(
      "DATABASE_URL",
      "postgres://test:test@configured.example.test/db",
    );
    getContext.mockResolvedValue({
      env: {
        HYPERDRIVE: {
          connectionString: "postgres://test:test@binding.example.test/db",
        },
      },
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses explicit local DATABASE_URL before an emulated Hyperdrive binding", async () => {
    await getDatabaseFromContext();
    expect(connect).toHaveBeenCalledWith(
      "postgres://test:test@configured.example.test/db",
      expect.any(Object),
    );
    expect(getContext).not.toHaveBeenCalled();
  });
  it.each(["https://project.supabase.co", "not-a-url"])(
    "rejects an invalid database URL before connecting: %s",
    async (url) => {
      vi.stubEnv("DATABASE_URL", url);
      await expect(getDatabaseFromContext()).rejects.toThrow(
        "Invalid Postgres connection URL",
      );
      expect(connect).not.toHaveBeenCalled();
    },
  );
  it("always uses Hyperdrive in production even when DATABASE_URL is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await getDatabaseFromContext();
    expect(connect).toHaveBeenCalledWith(
      "postgres://test:test@binding.example.test/db",
      expect.any(Object),
    );
  });
  it("uses the binding when no local URL is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await getDatabaseFromContext();
    expect(connect).toHaveBeenCalledWith(
      "postgres://test:test@binding.example.test/db",
      expect.any(Object),
    );
  });
  it("returns no database when neither local URL nor binding exists", async () => {
    vi.stubEnv("DATABASE_URL", "");
    getContext.mockRejectedValue(new Error("No Cloudflare runtime"));
    expect(await getDatabaseFromContext()).toBeUndefined();
    expect(connect).not.toHaveBeenCalled();
  });
});
