// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-provider";
const { claim, complete } = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
}));
vi.mock("@/lib/persistence-client", () => ({
  claimLocalJobsForActiveSession: claim,
}));
vi.mock("@/lib/auth-client", () => ({
  AUTH_SESSION_STORAGE_KEY: "test-session",
  AUTH_SESSION_UPDATED_EVENT: "test-session-updated",
  getActiveAuthSessionUser: () => null,
  syncAuthSessionFromServer: async () => null,
  signInLocalAuth: async () => ({
    ok: true,
    user: {
      id: "a",
      name: "A",
      email: "a@example.com",
      createdAt: "2026-01-01",
    },
  }),
  signUpLocalAuth: vi.fn(),
  signOutLocalAuth: vi.fn(),
}));
function Harness() {
  const { status, signIn } = useAuth();
  return (
    <>
      <p>{status}</p>
      <button
        onClick={() => {
          void signIn({
            email: "a@example.com",
            password: "test-only-password",
          }).then(complete);
        }}
      >
        Sign in
      </button>
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("completes login while job synchronization is still pending", async () => {
  claim.mockReturnValue(new Promise(() => {}));
  render(
    <AuthProvider>
      <Harness />
    </AuthProvider>,
  );
  await screen.findByText("guest");
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(complete).toHaveBeenCalledWith({ ok: true }));
  expect(screen.getByText("authenticated")).toBeTruthy();
  expect(claim).toHaveBeenCalledOnce();
});
