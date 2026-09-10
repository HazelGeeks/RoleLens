import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_SESSION_STORAGE_KEY,
  getActiveAuthSessionUser,
  resetPasswordLocalAuth,
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
      vi.fn(
        async () =>
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
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toContain(
      "sungjun@example.com",
    );
  });

  it("returns API error message for failed login", async () => {
    setupWindow();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
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
      vi.fn(
        async () =>
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

  it("returns success message for password reset", async () => {
    setupWindow();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: true,
              message:
                "Password reset successful. Please log in with your new password.",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    const result = await resetPasswordLocalAuth({
      token: "a".repeat(43),
      password: "new-password123",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toContain("Password reset successful");
    }
  });
});

describe("authentication request deadline", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("aborts a stalled login so the form can retry", async () => {
    setupWindow();
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options: RequestInit) => {
        requestSignal = options.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }),
    );
    const pending = signInLocalAuth({
      email: "test@example.com",
      password: "test-only-password",
    });
    const assertion = expect(pending).rejects.toThrow(
      "Authentication request timed out",
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(requestSignal?.aborted).toBe(true);
    expect(getActiveAuthSessionUser()).toBeNull();
  });
  it("keeps the deadline active while reading the response body", async () => {
    setupWindow();
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options: RequestInit) => ({
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      })),
    );
    const pending = signInLocalAuth({
      email: "test@example.com",
      password: "test-only-password",
    });
    const assertion = expect(pending).rejects.toThrow(
      "Authentication request timed out",
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(getActiveAuthSessionUser()).toBeNull();
  });
});
