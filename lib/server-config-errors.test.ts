import { afterEach, describe, expect, it, vi } from "vitest";
import { toPublicServerError } from "./server-config-errors";

afterEach(() => vi.unstubAllEnvs());
describe("public server errors", () => {
  it("gives actionable local connection guidance without exposing raw credentials", () => {
    vi.stubEnv("NODE_ENV", "development");
    const error = Object.assign(
      new Error("connect ECONNREFUSED postgres://private:secret@host/db"),
      { code: "ECONNREFUSED" },
    );
    const result = toPublicServerError(error);
    expect(result.status).toBe(503);
    expect(result.message).toContain("DATABASE_URL in .env.local");
    expect(result.message).not.toMatch(/private|secret|host\/db/);
  });
  it("reports connection codes even when the driver message is empty", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(toPublicServerError({ code: "CONNECT_TIMEOUT" })).toEqual({
      status: 503,
      message:
        "Database connection failed. Check the Hyperdrive database connection and retry.",
    });
  });
  it("distinguishes database authentication from a user's login", () => {
    const result = toPublicServerError({ code: "28P01" });
    expect(result.status).toBe(503);
    expect(result.message).toContain(
      "separate from your RoleLens login password",
    );
  });
  it("explains incorrect URL schemes without leaking the configured address", () => {
    const result = toPublicServerError(
      new Error("Invalid Postgres connection URL"),
    );
    expect(result.status).toBe(503);
    expect(result.message).toContain(
      "not an https:// project or dashboard URL",
    );
  });
  it("keeps unknown failures private", () => {
    expect(toPublicServerError(new Error("private connection info"))).toEqual({
      status: 500,
      message: "Internal server error",
    });
  });
});
