// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyCoverLetter } from "@/lib/cover-letter/profile";
import { type SavedDocument } from "@/lib/documents/types";
import { CoverLetterPageClient } from "./cover-letter-page-client";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "a" }, status: "authenticated" }),
}));
const fetchMock = vi.fn();
let stored: SavedDocument[];
function mount() {
  return render(
    <MantineProvider>
      <CoverLetterPageClient />
    </MantineProvider>,
  );
}
function input(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}
function fill(label: string, value: string) {
  fireEvent.change(input(label), { target: { value } });
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}
beforeEach(() => {
  stored = [];
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fetchMock.mockReset().mockImplementation(async (_url, options) => {
    if (options.method === "PUT") {
      const request = JSON.parse(options.body);
      const saved = {
        ...request,
        version: request.version + 1,
        updatedAt: "2026-09-10",
      };
      stored = [...stored.filter((doc) => doc.id !== saved.id), saved];
      return Response.json({ document: saved });
    }
    if (options.method === "DELETE") {
      const request = JSON.parse(options.body);
      stored = stored.filter((doc) => doc.id !== request.id);
      return Response.json({ deleted: true });
    }
    return Response.json({ documents: stored });
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("writes, previews, saves, reloads and duplicates separate cover letters", async () => {
  const view = mount();
  await screen.findByText("Add your details, then save your document.");
  fill("Document name", "Acme — Engineer");
  fill("Full name", "Alex Kim");
  fill("Company", "Acme");
  fill("Position applying for", "Engineer");
  fill("Letter date", "2026-09-10");
  fill(
    "Body",
    "I build accessible interfaces.\n\nThank you for your consideration.",
  );
  const preview = within(
    screen.getByRole("article", { name: "Cover letter preview" }),
  );
  expect(preview.getByText("Acme")).toBeTruthy();
  expect(preview.getByText("September 10, 2026")).toBeTruthy();
  expect(preview.queryByText("Acme — Engineer")).toBeNull();
  click("Save cover letter");
  await screen.findByText("Cover Letter saved.");
  expect(stored[0]).toMatchObject({
    title: "Acme — Engineer",
    data: { name: "Alex Kim", company: "Acme" },
  });
  click("Duplicate");
  fill("Document name", "Beta — Engineer");
  fill("Company", "Beta");
  click("Save cover letter");
  await screen.findByText("Cover Letter saved.");
  expect(stored).toHaveLength(2);
  expect(stored[0].data).toMatchObject({ company: "Acme" });
  view.unmount();
  mount();
  await screen.findByText("Saved cover letter loaded.");
  expect(input("Company").value).toBe("Acme");
  fireEvent.change(screen.getByLabelText("Saved cover letters (2/5)"), {
    target: { value: stored[1].id },
  });
  expect(input("Company").value).toBe("Beta");
});

it("disables creation at five, permits editing and frees a slot after confirmed deletion", async () => {
  stored = Array.from({ length: 5 }, (_, index) => ({
    id: `letter-${index}`,
    kind: "cover-letter",
    title: `Letter ${index}`,
    data: emptyCoverLetter(),
    version: 1,
    updatedAt: "2026-09-10",
  }));
  mount();
  await screen.findByText("Saved cover letter loaded.");
  expect(
    (
      screen.getByRole("button", {
        name: "New cover letter",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Duplicate" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fill("Body", "An updated application.");
  click("Save cover letter");
  await screen.findByText("Cover Letter saved.");
  expect(stored).toHaveLength(5);
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  click("Delete");
  expect(stored).toHaveLength(5);
  click("Delete");
  await screen.findByText("Document deleted.");
  expect(stored).toHaveLength(4);
  expect(
    (
      screen.getByRole("button", {
        name: "New cover letter",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});

it("preserves unsaved text on failed save and canceled document switches", async () => {
  stored = [
    {
      id: "saved",
      kind: "cover-letter",
      title: "Saved",
      data: emptyCoverLetter(),
      version: 1,
      updatedAt: "2026-09-10",
    },
  ];
  mount();
  await screen.findByText("Saved cover letter loaded.");
  fill("Body", "Keep this draft");
  vi.mocked(window.confirm).mockReturnValue(false);
  click("New cover letter");
  expect(input("Body").value).toBe("Keep this draft");
  fetchMock.mockResolvedValueOnce(
    Response.json({ message: "Please retry" }, { status: 503 }),
  );
  click("Save cover letter");
  await screen.findByRole("alert");
  expect(input("Body").value).toBe("Keep this draft");
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Save cover letter",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  click("Save cover letter");
  await screen.findByText("Cover Letter saved.");
  expect(stored[0].data).toMatchObject({ body: "Keep this draft" });
});
