import {
  GET as RESET_AVAILABILITY,
  POST as REQUEST_RESET,
} from "@/app/api/auth/request-password-reset/route";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as LOGIN } from "@/app/api/auth/login/route";
import { POST as LOGOUT } from "@/app/api/auth/logout/route";
import { POST as RESET_PASSWORD } from "@/app/api/auth/reset-password/route";
import { GET as SESSION } from "@/app/api/auth/session/route";
import { POST as SIGNUP } from "@/app/api/auth/signup/route";
import { resetAuthStoreForTests } from "@/lib/auth-server";

const { deliverReset, getDelivery } = vi.hoisted(() => ({
  deliverReset: vi.fn<(email: string, token: string) => Promise<void>>(),
  getDelivery: vi.fn(),
}));
vi.mock("@/lib/auth-email", () => ({ getPasswordResetDelivery: getDelivery }));

const testGlobal = globalThis as typeof globalThis & {
  __env__?: Record<string, unknown>;
  __ENV__?: Record<string, unknown>;
};

describe("auth API routes", () => {
  beforeEach(() => {
    resetAuthStoreForTests();
    vi.useRealTimers();
    deliverReset.mockReset().mockResolvedValue(undefined);
    getDelivery.mockReset().mockResolvedValue(deliverReset);
    delete process.env.AUTH_BACKEND;
    delete process.env.PERSISTENCE_BACKEND;
    delete process.env.AUTH_PASSWORD_PEPPER;
    delete testGlobal.__env__;
    delete testGlobal.__ENV__;
    vi.unstubAllEnvs();
  });

  it("creates account and returns active session", async () => {
    const signupResponse = await SIGNUP(
      new Request("https://rolelens.pages.dev/api/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Sungjun",
          email: "sungjun@example.com",
          password: "password123",
        }),
      }),
    );

    expect(signupResponse.status).toBe(201);

    const setCookie = signupResponse.headers.get("set-cookie");
    expect(setCookie).toContain("rolelens_session=");

    const cookieHeader = setCookie?.split(";")[0] || "";
    const sessionResponse = await SESSION(
      new Request("https://rolelens.pages.dev/api/auth/session", {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
      }),
    );

    const payload = (await sessionResponse.json()) as {
      ok: boolean;
      user: { email: string } | null;
    };
    expect(sessionResponse.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.user?.email).toBe("sungjun@example.com");
  });

  it("rejects duplicate sign-up email", async () => {
    await SIGNUP(
      new Request("https://rolelens.pages.dev/api/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "First",
          email: "dup@example.com",
          password: "password123",
        }),
      }),
    );

    const duplicateResponse = await SIGNUP(
      new Request("https://rolelens.pages.dev/api/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Second",
          email: "dup@example.com",
          password: "password123",
        }),
      }),
    );

    expect(duplicateResponse.status).toBe(409);
  });

  it("rejects incorrect password on login", async () => {
    await SIGNUP(
      new Request("https://rolelens.pages.dev/api/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Sungjun",
          email: "login@example.com",
          password: "password123",
        }),
      }),
    );

    const loginResponse = await LOGIN(
      new Request("https://rolelens.pages.dev/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "login@example.com",
          password: "wrong-password",
        }),
      }),
    );

    expect(loginResponse.status).toBe(401);
  });

  it("logs out and clears session", async () => {
    const signupResponse = await SIGNUP(
      new Request("https://rolelens.pages.dev/api/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Sungjun",
          email: "logout@example.com",
          password: "password123",
        }),
      }),
    );

    const cookieHeader =
      signupResponse.headers.get("set-cookie")?.split(";")[0] || "";

    const logoutResponse = await LOGOUT(
      new Request("https://rolelens.pages.dev/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
        },
      }),
    );

    expect(logoutResponse.status).toBe(200);

    const sessionResponse = await SESSION(
      new Request("https://rolelens.pages.dev/api/auth/session", {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
      }),
    );

    const payload = (await sessionResponse.json()) as {
      user: unknown;
    };
    expect(payload.user).toBeNull();
  });

  const authRequest = (path: string, body: object, cookie?: string) =>
    new Request(`https://rolelens.test/api/auth/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  async function createResetUser() {
    const signup = await SIGNUP(
      authRequest("signup", {
        name: "Test",
        email: "reset@example.com",
        password: "original-password",
      }),
    );
    expect(signup.status).toBe(201);
    return signup.headers.get("set-cookie")!.split(";")[0];
  }
  async function requestToken() {
    const response = await REQUEST_RESET(
      authRequest("request-password-reset", { email: "reset@example.com" }),
    );
    expect(response.status).toBe(200);
    const token = deliverReset.mock.calls.at(-1)![1];
    expect(JSON.stringify(await response.json())).not.toContain(token);
    return token;
  }

  it("rejects the former unauthenticated email/password reset", async () => {
    await createResetUser();
    const response = await RESET_PASSWORD(
      authRequest("reset-password", {
        email: "reset@example.com",
        password: "attacker-password",
      }),
    );
    expect(response.status).toBe(400);
    expect(
      (
        await LOGIN(
          authRequest("login", {
            email: "reset@example.com",
            password: "original-password",
          }),
        )
      ).status,
    ).toBe(200);
  });

  it("requires the emailed token, consumes it once, and revokes old sessions", async () => {
    const cookie = await createResetUser();
    const token = await requestToken();
    expect(
      (
        await LOGIN(
          authRequest("login", {
            email: "reset@example.com",
            password: "original-password",
          }),
        )
      ).status,
    ).toBe(200);
    const reset = await RESET_PASSWORD(
      authRequest("reset-password", { token, password: "new-password123" }),
    );
    expect(reset.status).toBe(200);
    expect(reset.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(
      (
        await RESET_PASSWORD(
          authRequest("reset-password", {
            token,
            password: "another-password",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await LOGIN(
          authRequest("login", {
            email: "reset@example.com",
            password: "original-password",
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await LOGIN(
          authRequest("login", {
            email: "reset@example.com",
            password: "new-password123",
          }),
        )
      ).status,
    ).toBe(200);
    const session = await SESSION(
      new Request("https://rolelens.test/api/auth/session", {
        headers: { cookie },
      }),
    );
    expect(((await session.json()) as { user: unknown }).user).toBeNull();
  });

  it("rejects expired tokens without changing the password", async () => {
    await createResetUser();
    const token = await requestToken();
    const current = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(current + 16 * 60_000);
    const response = await RESET_PASSWORD(
      authRequest("reset-password", { token, password: "new-password123" }),
    );
    vi.useRealTimers();
    expect(response.status).toBe(400);
    expect(
      (
        await LOGIN(
          authRequest("login", {
            email: "reset@example.com",
            password: "original-password",
          }),
        )
      ).status,
    ).toBe(200);
  });

  it("allows only one of two concurrent token redemptions", async () => {
    await createResetUser();
    const token = await requestToken();
    const results = await Promise.all(
      ["one-password", "two-password"].map((password) =>
        RESET_PASSWORD(authRequest("reset-password", { token, password })),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 400,
    ]);
  });

  it("returns the same response for unknown and known emails and throttles repeat sends", async () => {
    await createResetUser();
    const known = await REQUEST_RESET(
      authRequest("request-password-reset", { email: "reset@example.com" }),
    );
    const unknown = await REQUEST_RESET(
      authRequest("request-password-reset", { email: "missing@example.com" }),
    );
    expect(await known.json()).toEqual(await unknown.json());
    await REQUEST_RESET(
      authRequest("request-password-reset", { email: "reset@example.com" }),
    );
    expect(deliverReset).toHaveBeenCalledTimes(1);
  });

  it("invalidates a token if email delivery fails and does not expose provider errors", async () => {
    await createResetUser();
    deliverReset.mockRejectedValueOnce(new Error("private-provider-details"));
    const response = await REQUEST_RESET(
      authRequest("request-password-reset", { email: "reset@example.com" }),
    );
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "private-provider-details",
    );
    const token = deliverReset.mock.calls[0][1];
    expect(
      (
        await RESET_PASSWORD(
          authRequest("reset-password", { token, password: "new-password123" }),
        )
      ).status,
    ).toBe(400);
  });

  it("reports recovery as unavailable without sending email when configuration is missing", async () => {
    getDelivery.mockRejectedValueOnce(
      new Error("Password reset email is not configured"),
    );
    const response = await RESET_AVAILABILITY();
    expect(await response.json()).toEqual({ available: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(deliverReset).not.toHaveBeenCalled();
  });

  it("reports configured recovery without issuing a reset email", async () => {
    const response = await RESET_AVAILABILITY();
    expect(await response.json()).toEqual({ available: true });
    expect(deliverReset).not.toHaveBeenCalled();
  });

  it("fails closed when email delivery is not configured", async () => {
    getDelivery.mockRejectedValueOnce(
      new Error("Password reset email is not configured"),
    );
    expect(
      (
        await REQUEST_RESET(
          authRequest("request-password-reset", { email: "reset@example.com" }),
        )
      ).status,
    ).toBe(503);
  });

  it("requires AUTH_PASSWORD_PEPPER in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_PASSWORD_PEPPER", "");

    const response = await SIGNUP(
      new Request("https://rolelens.pages.dev/api/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Prod",
          email: "prod@example.com",
          password: "password123",
        }),
      }),
    );

    const payload = (await response.json()) as { message: string };
    expect(response.status).toBe(500);
    expect(payload.message).toBe(
      "Server auth configuration is incomplete. Set AUTH_PASSWORD_PEPPER for Production.",
    );
  });

  it("reads AUTH_PASSWORD_PEPPER from Cloudflare runtime env in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_PASSWORD_PEPPER", "");
    vi.stubEnv("AUTH_BACKEND", "memory");
    testGlobal.__env__ = {
      AUTH_PASSWORD_PEPPER: "cloudflare-runtime-pepper",
    };

    const response = await SIGNUP(
      new Request("https://rolelens.pages.dev/api/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Cloudflare",
          email: "cloudflare@example.com",
          password: "password123",
        }),
      }),
    );

    const payload = (await response.json()) as {
      ok: boolean;
      user?: { email: string };
    };
    expect(response.status).toBe(201);
    expect(payload.ok).toBe(true);
    expect(payload.user?.email).toBe("cloudflare@example.com");
  });

  it("fails closed when production has no Hyperdrive binding", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_PASSWORD_PEPPER", "production-pepper");

    const response = await SIGNUP(
      new Request("https://rolelens.workers.dev/api/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Prod",
          email: "prod-db@example.com",
          password: "password123",
        }),
      }),
    );

    const payload = (await response.json()) as { message: string };
    expect(response.status).toBe(500);
    expect(payload.message).toBe(
      "Server database binding is unavailable. Ensure the Cloudflare Worker has the HYPERDRIVE binding.",
    );
  });
});
