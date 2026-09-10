// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, expect, it, vi } from "vitest";
import { AuthFormCard } from "./auth-form-card";
const { signIn, replace } = vi.hoisted(() => ({
  signIn: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ status: "guest", user: null, signIn, signUp: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("shows a rejected request error and enables Login again", async () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  signIn.mockRejectedValue(
    new Error("Authentication request timed out. Please retry."),
  );
  render(
    <MantineProvider>
      <AuthFormCard mode="login" />
    </MantineProvider>,
  );
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "test@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "test-only-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Login" }));
  expect((await screen.findByRole("alert")).textContent).toContain("timed out");
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Login" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  expect(replace).not.toHaveBeenCalled();
});
