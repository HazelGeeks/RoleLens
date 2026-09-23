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
import { emptyResumeProfile } from "@/lib/resume/profile";
import { ResumePageClient } from "./resume-page-client";
const { auth } = vi.hoisted(() => ({
  auth: { user: { id: "a" }, status: "authenticated" },
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => auth,
}));
const fetchMock = vi.fn();
const { extractPdfText } = vi.hoisted(() => ({
  extractPdfText: vi.fn(),
}));
vi.mock("@/lib/documents/pdf-text", () => ({ extractPdfText }));
function mount() {
  return render(
    <MantineProvider>
      <ResumePageClient />
    </MantineProvider>,
  );
}
beforeEach(() => {
  auth.user = { id: "a" };
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
  fetchMock.mockReset().mockResolvedValue(Response.json({ documents: [] }));
  extractPdfText.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("creates entries, updates preview, saves and reloads details", async () => {
  const view = mount();
  await screen.findByText("Add your details, then save your document.");
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "Alex Kim" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add career history" }));
  fireEvent.change(screen.getByLabelText("Job title"), {
    target: { value: "Frontend Engineer" },
  });
  expect(screen.getByRole("heading", { name: "Alex Kim" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Portfolio / website"), {
    target: { value: "portfolio.example.com" },
  });
  const website = screen.getByRole("link", { name: "portfolio.example.com" });
  expect(website.getAttribute("href")).toBe("https://portfolio.example.com/");
  expect(website.getAttribute("target")).toBe("_blank");
  fetchMock.mockImplementation(async (_url, options) => {
    const saved = JSON.parse(options.body);
    return Response.json({
      document: { ...saved, version: 1, updatedAt: "2026-09-10" },
    });
  });
  fireEvent.click(screen.getByRole("button", { name: "Save resume" }));
  await screen.findByText("Resume saved.");
  const body = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(body.data.experience[0].title).toBe("Frontend Engineer");
  view.unmount();
  fetchMock.mockResolvedValue(
    Response.json({
      documents: [{ ...body, version: 1, updatedAt: "2026-09-10" }],
    }),
  );
  mount();
  await screen.findByText("Saved resume loaded.");
  expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe(
    "Alex Kim",
  );
  expect((screen.getByLabelText("Job title") as HTMLInputElement).value).toBe(
    "Frontend Engineer",
  );
});
it("keeps input after failed save and allows retry", async () => {
  mount();
  await screen.findByText("Add your details, then save your document.");
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "Unsaved" },
  });
  fetchMock.mockResolvedValue(
    Response.json({ message: "Please retry" }, { status: 503 }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save resume" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe(
    "Unsaved",
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Save resume",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
});
it("clears account state and ignores a late response from the previous account", async () => {
  let resolveOld: (value: Response) => void = () => {};
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        resolveOld = resolve;
      }),
  );
  const view = mount();
  auth.user = { id: "b" };
  view.rerender(
    <MantineProvider>
      <ResumePageClient />
    </MantineProvider>,
  );
  await screen.findByText("Add your details, then save your document.");
  resolveOld(
    Response.json({
      documents: [
        {
          id: "private",
          kind: "resume",
          title: "Private",
          data: { ...emptyResumeProfile(), name: "Private A" },
          version: 1,
          updatedAt: "2026-09-10",
        },
      ],
    }),
  );
  await waitFor(() =>
    expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe(
      "",
    ),
  );
  expect(fetchMock.mock.calls[1][1].headers["x-rolelens-account"]).toBe("b");
});

it("saves separate education fields with compact dates and optional details", async () => {
  const view = mount();
  await screen.findByText("Add your details, then save your document.");
  fireEvent.click(screen.getByRole("button", { name: "Add education" }));
  const fill = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fill("School", "Example University");
  fill("Major / field of study", "Computer Science");
  expect(screen.queryByLabelText("Degree / qualification")).toBeNull();
  expect(screen.queryByLabelText("Degree level")).toBeNull();
  fill("Degree", "other");
  fill("Custom degree", "BSc");
  fill("Degree", "bachelor");
  expect(screen.queryByLabelText("Custom degree")).toBeNull();
  fill("GPA", "3.8");
  fill("GPA scale", "4.5");
  fill("Major type", "double");
  fill("Second major", "Economics");
  fill("Academic status", "graduated");
  fill("Admission type", "transfer");
  fill("Admission date", "2018-03");
  fill("Completion / expected end date", "2020-02");
  fill("School location", "Seoul, South Korea");
  fill("Highlights / coursework", "Graduated with honors");
  const preview = within(
    screen.getByRole("article", { name: "Resume preview" }),
  );
  expect(preview.getByText("Example University")).toBeTruthy();
  expect(
    preview.getByText(
      "Computer Science & Economics (Double major) · Bachelor's · GPA 3.8/4.5 · Transfer · Graduated",
    ),
  ).toBeTruthy();
  expect(preview.getByText("2020.02")).toBeTruthy();
  expect(preview.queryByText("Seoul, South Korea")).toBeNull();
  expect(preview.queryByText("Graduated with honors")).toBeNull();
  fireEvent.click(screen.getByLabelText("Show school location on resume"));
  fireEvent.click(screen.getByLabelText("Show education highlights on resume"));
  expect(preview.getByText("Seoul, South Korea")).toBeTruthy();
  expect(preview.getByText("Graduated with honors")).toBeTruthy();
  fill("Dates shown on resume", "end-year");
  expect(preview.getByText("2020")).toBeTruthy();
  fill("GPA", "5");
  fireEvent.click(screen.getByRole("button", { name: "Save resume" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "GPA cannot exceed the scale",
  );
  expect((screen.getByLabelText("GPA") as HTMLInputElement).value).toBe("5");
  fill("GPA", "3.8");
  let saved: unknown;
  fetchMock.mockImplementationOnce(async (_url, options) => {
    saved = {
      ...JSON.parse(options.body),
      version: 1,
      updatedAt: "2026-09-10",
    };
    return Response.json({ document: saved });
  });
  fireEvent.click(screen.getByRole("button", { name: "Save resume" }));
  await screen.findByText("Resume saved.");
  view.unmount();
  fetchMock.mockResolvedValue(Response.json({ documents: [saved] }));
  mount();
  await screen.findByText("Saved resume loaded.");
  expect(
    (screen.getByLabelText("Major / field of study") as HTMLInputElement).value,
  ).toBe("Computer Science");
  expect(
    screen
      .getByLabelText("Academic status")
      .querySelector("option:checked")
      ?.getAttribute("value"),
  ).toBe("graduated");
  expect(
    screen
      .getByLabelText("Admission type")
      .querySelector("option:checked")
      ?.getAttribute("value"),
  ).toBe("transfer");
  expect(
    (screen.getByLabelText("Admission date") as HTMLInputElement).value,
  ).toBe("2018-03");
  expect(
    (screen.getByLabelText("Second major") as HTMLInputElement).value,
  ).toBe("Economics");
  expect(
    screen
      .getByLabelText("Degree")
      .querySelector("option:checked")
      ?.getAttribute("value"),
  ).toBe("bachelor");
  expect((screen.getByLabelText("GPA") as HTMLInputElement).value).toBe("3.8");
  expect((screen.getByLabelText("GPA scale") as HTMLInputElement).value).toBe(
    "4.5",
  );
  fill("Degree", "other");
  expect(
    (screen.getByLabelText("Custom degree") as HTMLInputElement).value,
  ).toBe("BSc");
  fill("Degree", "bachelor");
  fill("Major type", "single");
  expect(screen.queryByLabelText("Second major")).toBeNull();
  fill("Major type", "minor");
  expect(
    (screen.getByLabelText("Minor field of study") as HTMLInputElement).value,
  ).toBe("Economics");
  expect(
    within(screen.getByRole("article", { name: "Resume preview" })).getByText(
      "Computer Science · Minor in Economics · Bachelor's · GPA 3.8/4.5 · Transfer · Graduated",
    ),
  ).toBeTruthy();
});

it("switches preview and print paper sizes between A4 and Letter", async () => {
  mount();
  await screen.findByText("Add your details, then save your document.");
  const selector = screen.getByRole("combobox", { name: "Paper size" });
  const paper = screen.getByRole("article", { name: "Resume preview" });
  expect(paper.style.width).toBe("210mm");
  expect(paper.style.height).toBe("297mm");
  fireEvent.change(selector, { target: { value: "Letter" } });
  expect(paper.style.width).toBe("215.9mm");
  expect(paper.style.height).toBe("279.4mm");
  expect(document.head.innerHTML + document.body.innerHTML).toContain(
    "size: Letter;",
  );
  fireEvent.change(selector, { target: { value: "A4" } });
  expect(paper.style.width).toBe("210mm");
  expect(paper.style.height).toBe("297mm");
  expect(document.head.innerHTML + document.body.innerHTML).toContain(
    "size: A4;",
  );
});

it("uses the resume name as the PDF file name when printing", async () => {
  const previousPrint = window.print;
  const printSpy = vi.fn();
  window.print = printSpy;
  try {
    mount();
    await screen.findByText("Add your details, then save your document.");
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Alex Kim" },
    });
    fireEvent.change(screen.getByLabelText("Document name"), {
      target: { value: "Alex Kim - Frontend" },
    });
    const originalTitle = document.title;
    fireEvent.click(screen.getByRole("button", { name: "Print / Save PDF" }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(document.title).toBe("Alex Kim - Frontend");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe(originalTitle);
  } finally {
    window.print = previousPrint;
  }
});

it("sanitizes illegal file name characters when printing", async () => {
  const previousPrint = window.print;
  const printSpy = vi.fn();
  window.print = printSpy;
  try {
    mount();
    await screen.findByText("Add your details, then save your document.");
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Alex Kim" },
    });
    fireEvent.change(screen.getByLabelText("Document name"), {
      target: { value: "  a/b:c  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Print / Save PDF" }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(document.title).toBe("a b c");
    window.dispatchEvent(new Event("afterprint"));
  } finally {
    window.print = previousPrint;
  }
});

it("imports resume details from an uploaded PDF", async () => {
  extractPdfText.mockResolvedValue(
    "Jordan Lee\nProduct Designer\njordan@example.com | 010-1111-2222\nExperience\nDesigner @ Acme 2020-05 - Present\n- Shipped onboarding",
  );
  mount();
  await screen.findByText("Add your details, then save your document.");
  const picker = screen.getByLabelText("Import PDF");
  fireEvent.change(picker, {
    target: {
      files: [
        new File(["%PDF-1.4"], "resume.pdf", { type: "application/pdf" }),
      ],
    },
  });
  await screen.findByText(
    "Imported from resume.pdf. Review the details and save.",
  );
  expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe(
    "Jordan Lee",
  );
  expect(extractPdfText).toHaveBeenCalledTimes(1);
});

it("keeps the form unchanged when PDF import fails", async () => {
  extractPdfText.mockRejectedValue(
    new Error("This file does not look like a PDF."),
  );
  mount();
  await screen.findByText("Add your details, then save your document.");
  fireEvent.change(screen.getByLabelText("Import PDF"), {
    target: {
      files: [new File(["nope"], "notes.txt", { type: "text/plain" })],
    },
  });
  await screen.findByText("This file does not look like a PDF.");
  expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe(
    "",
  );
});

it("rechecks the page overflow warning when the paper size changes", async () => {
  mount();
  await screen.findByText("Add your details, then save your document.");
  const paper = screen.getByRole("article", { name: "Resume preview" });
  Object.defineProperties(paper, {
    scrollHeight: { configurable: true, get: () => 150 },
    clientHeight: {
      configurable: true,
      get: () => (paper.style.height === "279.4mm" ? 100 : 200),
    },
  });
  const selector = screen.getByRole("combobox", { name: "Paper size" });
  fireEvent.change(selector, { target: { value: "Letter" } });
  expect(screen.getByText(/This content exceeds one page/)).toBeTruthy();
  fireEvent.change(selector, { target: { value: "A4" } });
  expect(screen.queryByText(/This content exceeds one page/)).toBeNull();
});
