// @vitest-environment jsdom
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppFrame } from "./app-frame";

vi.mock("next/navigation", () => ({ usePathname: () => "/jobs/" }));
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button>Toggle theme</button>,
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: { name: "Alex", email: "alex@example.com" },
    signOut: vi.fn(),
  }),
}));
const preferenceKey = "rolelens.sidebar.collapsed";
function Draft() {
  const [value, setValue] = useState("");
  return (
    <input
      aria-label="Draft"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("collapses and expands without resetting page state, retaining named navigation", () => {
  render(
    <AppFrame>
      <Draft />
    </AppFrame>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Draft" }), {
    target: { value: "Unsaved work" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  expect(
    screen
      .getByRole("button", { name: "Expand sidebar" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(localStorage.getItem(preferenceKey)).toBe("true");
  expect(
    screen.getByRole("link", { name: "Jobs" }).getAttribute("aria-current"),
  ).toBe("page");
  expect(
    screen.getByRole("link", { name: "Resume" }).getAttribute("href"),
  ).toBe("/resume");
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  expect(
    (screen.getByRole("textbox", { name: "Draft" }) as HTMLInputElement).value,
  ).toBe("Unsaved work");
  fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
  expect(localStorage.getItem(preferenceKey)).toBe("false");
  expect(
    screen
      .getByRole("button", { name: "Collapse sidebar" })
      .getAttribute("aria-expanded"),
  ).toBe("true");
});

it("restores the collapsed preference after remount", async () => {
  localStorage.setItem(preferenceKey, "true");
  render(<AppFrame>Page</AppFrame>);
  await screen.findByRole("button", { name: "Expand sidebar" });
});

it("still toggles when browser preference storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  render(<AppFrame>Page</AppFrame>);
  fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
});

it("keeps mobile menu state separate from the desktop sidebar preference", async () => {
  localStorage.setItem(preferenceKey, "true");
  render(<AppFrame>Page</AppFrame>);
  fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
  expect(
    screen
      .getByRole("button", { name: "Close navigation menu" })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
  const jobsLink = screen.getByRole("link", { name: "Jobs" });
  jobsLink.addEventListener("click", (event) => event.preventDefault(), {
    once: true,
  });
  fireEvent.click(jobsLink);
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Open navigation menu" })
        .getAttribute("aria-expanded"),
    ).toBe("false"),
  );
  expect(localStorage.getItem(preferenceKey)).toBe("true");
});
