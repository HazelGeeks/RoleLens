import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_SESSION_STORAGE_KEY,
  getActiveAuthSessionUser,
  signInLocalAuth,
  signOutLocalAuth,
  signUpLocalAuth,
  syncAuthSessionFromServer,
} from "@/lib/auth-client";
import {
  installMockWindow,
  uninstallMockWindow,
} from "@/lib/test-utils/mock-window-storage";

function setupWindow() {
  const dispatchEvent = vi.fn(() => true);
  const { localStorage } = installMockWindow({}, { dispatchEvent });
  return { localStorage, dispatchEvent };
}

afterEach(() => {
  vi.restoreAllMocks();
  uninstallMockWindow();
});

describe("auth client API session cache", () => {
  it("stores active session after sign-up success", async () => {
    const { localStorage } = setupWindow();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            user: {
              id: "user-1",
              name: "Sungjun",
              email: "sungjun@example.com",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const result = await signUpLocalAuth({
      name: "Sungjun",
      email: "sungjun@example.com",
      password: "password123",
    });

    expect(result.ok).toBe(true);
    expect(getActiveAuthSessionUser()?.email).toBe("sungjun@example.com");
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toContain("sungjun@example.com");
  });

  it("returns API error message for failed login", async () => {
    setupWindow();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: false, message: "Incorrect password." }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const result = await signInLocalAuth({
      email: "login@example.com",
      password: "wrong-pass",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Incorrect password");
    }
  });

  it("loads session from /api/auth/session", async () => {
    setupWindow();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            user: {
              id: "user-2",
              name: "RoleLens User",
              email: "user@example.com",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const user = await syncAuthSessionFromServer();

    expect(user?.id).toBe("user-2");
    expect(getActiveAuthSessionUser()?.email).toBe("user@example.com");
  });

  it("clears cached session on sign-out", async () => {
    setupWindow();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/auth/signup")) {
          return new Response(
            JSON.stringify({
              ok: true,
              user: {
                id: "user-3",
                name: "Sungjun",
                email: "sungjun@example.com",
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            }),
            { status: 201, headers: { "content-type": "application/json" } },
          );
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await signUpLocalAuth({
      name: "Sungjun",
      email: "sungjun@example.com",
      password: "password123",
    });

    await signOutLocalAuth();

    expect(getActiveAuthSessionUser()).toBeNull();
  });
});
