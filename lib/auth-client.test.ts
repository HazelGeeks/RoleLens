import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_SESSION_STORAGE_KEY,
  AUTH_USERS_STORAGE_KEY,
  getActiveAuthSessionUser,
  signInLocalAuth,
  signOutLocalAuth,
  signUpLocalAuth,
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

describe("auth client scaffold", () => {
  it("creates an account and stores active session", () => {
    const { localStorage } = setupWindow();

    const result = signUpLocalAuth({
      name: "Sungjun",
      email: "sungjun@example.com",
      password: "password123",
    });

    expect(result.ok).toBe(true);
    expect(getActiveAuthSessionUser()?.email).toBe("sungjun@example.com");
    expect(localStorage.getItem(AUTH_USERS_STORAGE_KEY)).toContain(
      "sungjun@example.com",
    );
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toContain("Sungjun");
  });

  it("rejects duplicate sign-up with same email", () => {
    setupWindow();

    signUpLocalAuth({
      name: "Sungjun",
      email: "dup@example.com",
      password: "password123",
    });
    const duplicate = signUpLocalAuth({
      name: "Another",
      email: "dup@example.com",
      password: "password123",
    });

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.message).toContain("already registered");
    }
  });

  it("supports login and logout for existing account", () => {
    setupWindow();

    signUpLocalAuth({
      name: "Sungjun",
      email: "login@example.com",
      password: "password123",
    });
    signOutLocalAuth();

    const login = signInLocalAuth({
      email: "login@example.com",
      password: "password123",
    });

    expect(login.ok).toBe(true);
    expect(getActiveAuthSessionUser()?.email).toBe("login@example.com");
  });
});
