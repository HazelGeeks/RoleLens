// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
vi.mock("@/lib/persistence-client", () => ({
  claimLocalJobsForActiveSession: async () => ({ claimed: 0, failed: 0 }),
}));
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/forgot-password/");
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function renderForm() {
  return render(
    <MantineProvider env="test" forceColorScheme="light">
      <AuthProvider>
        <ForgotPasswordForm />
      </AuthProvider>
    </MantineProvider>,
  );
}
it("retains the reset link while hydrating an existing signed-in session", async () => {
  window.history.replaceState(
    null,
    "",
    `/forgot-password/#token=${"a".repeat(43)}`,
  );
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        user: {
          id: "user-a",
          email: "a@example.test",
          name: "User",
          createdAt: "2026-09-04T00:00:00.000Z",
        },
      }),
    ),
  );
  renderForm();
  expect(await screen.findByLabelText("New password")).toBeTruthy();
  expect(screen.queryByLabelText("Email")).toBeNull();
  expect(window.location.hash).toBe("");
});
it("requests an email link without accepting a new password in the request step", async () => {
  const fetchMock = vi.fn<typeof fetch>(async (url, init) =>
    String(url).includes("/session")
      ? Response.json({ user: null })
      : init?.method === "GET"
        ? Response.json({ available: true })
        : Response.json({
            ok: true,
            message: "Check your inbox for a reset link.",
          }),
  );
  vi.stubGlobal("fetch", fetchMock);
  renderForm();
  const email = await screen.findByLabelText("Email");
  await waitFor(() => expect(email.closest("fieldset")?.disabled).toBe(false));
  expect(screen.queryByLabelText("New password")).toBeNull();
  fireEvent.change(email, { target: { value: "user@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  expect((await screen.findByRole("status")).textContent).toContain(
    "Check your inbox",
  );
  const [, init] = fetchMock.mock.calls.find(
    ([url, init]) =>
      String(url).includes("request-password-reset") && init?.method === "POST",
  )!;
  expect(JSON.parse(String(init?.body))).toEqual({
    email: "user@example.test",
  });
});
it("shows a delivery failure without clearing the entered email", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) =>
      String(url).includes("/session")
        ? Response.json({ user: null })
        : init?.method === "GET"
          ? Response.json({ available: true })
          : Response.json(
              { ok: false, message: "Email temporarily unavailable" },
              { status: 503 },
            ),
    ),
  );
  renderForm();
  const email = (await screen.findByLabelText("Email")) as HTMLInputElement;
  await waitFor(() => expect(email.closest("fieldset")?.disabled).toBe(false));
  fireEvent.change(email, { target: { value: "user@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "temporarily unavailable",
  );
  expect(email.value).toBe("user@example.test");
});

it("disables email requests when no delivery service is configured", async () => {
  const fetchMock = vi.fn<typeof fetch>(async (url) =>
    String(url).includes("/session")
      ? Response.json({ user: null })
      : Response.json({ available: false }),
  );
  vi.stubGlobal("fetch", fetchMock);
  renderForm();
  expect(
    await screen.findByText(/Email recovery has not been enabled/),
  ).toBeTruthy();
  const email = screen.getByLabelText("Email");
  expect(email.closest("fieldset")?.disabled).toBe(true);
  fireEvent.submit(email.closest("form")!);
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
    false,
  );
});

it("keeps requests disabled when availability cannot be checked", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes("/session"))
        return Response.json({ user: null });
      throw new Error("Network unavailable");
    }),
  );
  renderForm();
  expect(
    await screen.findByText(/Password reset is currently unavailable/),
  ).toBeTruthy();
  expect(screen.getByLabelText("Email").closest("fieldset")?.disabled).toBe(
    true,
  );
});
