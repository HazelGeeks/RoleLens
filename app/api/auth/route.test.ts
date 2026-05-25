import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as LOGIN } from "@/app/api/auth/login/route";
import { POST as LOGOUT } from "@/app/api/auth/logout/route";
import { POST as RESET_PASSWORD } from "@/app/api/auth/reset-password/route";
import { GET as SESSION } from "@/app/api/auth/session/route";
import { POST as SIGNUP } from "@/app/api/auth/signup/route";
import { resetAuthStoreForTests } from "@/lib/auth-server";

describe("auth API routes", () => {
  beforeEach(() => {
    resetAuthStoreForTests();
    delete process.env.AUTH_BACKEND;
    delete process.env.PERSISTENCE_BACKEND;
    delete process.env.AUTH_PASSWORD_PEPPER;
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

    const cookieHeader = signupResponse.headers.get("set-cookie")?.split(";")[0] || "";

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

  it("resets password and invalidates previous sessions", async () => {
    const signupResponse = await SIGNUP(
      new Request("https://rolelens.pages.dev/api/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Sungjun",
          email: "reset@example.com",
          password: "password123",
        }),
      }),
    );

    const cookieHeader = signupResponse.headers.get("set-cookie")?.split(";")[0] || "";

    const resetResponse = await RESET_PASSWORD(
      new Request("https://rolelens.pages.dev/api/auth/reset-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "reset@example.com",
          password: "new-password123",
        }),
      }),
    );
    expect(resetResponse.status).toBe(200);

    const oldPasswordLogin = await LOGIN(
      new Request("https://rolelens.pages.dev/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "reset@example.com",
          password: "password123",
        }),
      }),
    );
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await LOGIN(
      new Request("https://rolelens.pages.dev/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "reset@example.com",
          password: "new-password123",
        }),
      }),
    );
    expect(newPasswordLogin.status).toBe(200);

    const staleSessionResponse = await SESSION(
      new Request("https://rolelens.pages.dev/api/auth/session", {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
      }),
    );
    const staleSessionPayload = (await staleSessionResponse.json()) as { user: unknown };
    expect(staleSessionPayload.user).toBeNull();
  });

  it("returns generic success for reset-password when account does not exist", async () => {
    const response = await RESET_PASSWORD(
      new Request("https://rolelens.pages.dev/api/auth/reset-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "missing@example.com",
          password: "new-password123",
        }),
      }),
    );

    const payload = (await response.json()) as { ok: boolean; message: string };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.message).toContain("If an account exists");
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
});
