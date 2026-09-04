// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JobDetailClient } from "@/components/jobs/job-detail-client";
import {
  createPersistentJob,
  getPersistentJob,
  patchPersistentJob,
  resetPersistentStoreForTests,
} from "@/lib/persistence/store";
import { toLocalJobFromPersistent } from "@/lib/persistence-client";
import { getJobsFromStorage, saveJobsToStorage } from "@/lib/local-jobs";
import { AUTH_SESSION_STORAGE_KEY } from "@/lib/auth-client";
import { GET, POST } from "@/app/api/jobs/route";
import { PATCH } from "@/app/api/jobs/[id]/route";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("id=local-job"),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated" }),
}));
vi.mock("@/lib/persistence/auth", () => ({
  authorizePersistenceRequest: async () => ({
    ok: true,
    identity: { userId: "account-user-a", deviceId: "test-device" },
  }),
}));
let jobId: string;
let nextPatchFailure: number | undefined;
let patches: number;
let dropNextPatchResponse: boolean;
beforeEach(async () => {
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
  vi.stubEnv("PERSISTENCE_BACKEND", "memory");
  resetPersistentStoreForTests();
  localStorage.clear();
  localStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      user: {
        id: "user-a",
        name: "Test",
        email: "test@example.test",
        createdAt: "2026-09-04T00:00:00.000Z",
      },
    }),
  );
  const job = await createPersistentJob({
    userId: "account-user-a",
    deviceId: "test-device",
    actor: "test",
    input: {
      company: "Company",
      title: "Frontend Engineer",
      status: "SAVE",
      nextAction: "Send application",
      followUpDate: "2026-09-08",
      meta: {
        source: "LINKEDIN",
        remoteType: "REMOTE",
        descriptionRaw: "React engineering",
        extractedSkills: ["react"],
        fitScore: 85,
      },
    },
  });
  jobId = job.id;
  nextPatchFailure = undefined;
  patches = 0;
  dropNextPatchResponse = false;
  saveJobsToStorage([{ ...toLocalJobFromPersistent(job), id: "local-job" }]);
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(
        new URL(String(input), "https://rolelens.test"),
        init,
      );
      if (init?.method === "PATCH") {
        patches += 1;
        if (nextPatchFailure) {
          const status = nextPatchFailure;
          nextPatchFailure = undefined;
          return Response.json({ message: "Test failure" }, { status });
        }
        const response = await PATCH(request, {
          params: Promise.resolve({ id: jobId }),
        });
        if (dropNextPatchResponse) {
          dropNextPatchResponse = false;
          throw new Error("Connection lost after commit");
        }
        return response;
      }
      return init?.method === "POST" ? POST(request) : GET(request);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("preserves a note draft on failure and saves it once after explicit retry", async () => {
  render(
    <MantineProvider env="test" forceColorScheme="light">
      <JobDetailClient />
    </MantineProvider>,
  );
  const input = (await screen.findByLabelText(
    "Add Note",
  )) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: "Keep my draft" } });
  nextPatchFailure = 500;
  fireEvent.click(screen.getByRole("button", { name: "Add Note" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(input.value).toBe("Keep my draft");
  expect((await getPersistentJob("account-user-a", jobId))?.notes).toHaveLength(
    0,
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(() => expect(input.value).toBe(""));
  expect(
    (await getPersistentJob("account-user-a", jobId))?.notes.map(
      (note) => note.content,
    ),
  ).toEqual(["Keep my draft"]);
  expect(patches).toBe(2);
});

it("persists clearing both follow-up fields", async () => {
  render(
    <MantineProvider env="test" forceColorScheme="light">
      <JobDetailClient />
    </MantineProvider>,
  );
  const nextAction = (await screen.findByLabelText(
    "Next Action",
  )) as HTMLTextAreaElement;
  const date = screen.getByLabelText("Follow-up Date") as HTMLInputElement;
  await waitFor(() => expect(nextAction.value).toBe("Send application"));
  fireEvent.change(nextAction, { target: { value: "" } });
  fireEvent.change(date, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Follow-up" }));
  await waitFor(() =>
    expect(getJobsFromStorage()[0].persistentVersion).toBe(2),
  );
  const saved = await getPersistentJob("account-user-a", jobId);
  expect(saved?.nextAction).toBeUndefined();
  expect(saved?.followUpDate).toBeUndefined();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("reports a version conflict, preserves the draft, and retries with the refreshed version", async () => {
  render(
    <MantineProvider env="test" forceColorScheme="light">
      <JobDetailClient />
    </MantineProvider>,
  );
  const input = (await screen.findByLabelText(
    "Next Action",
  )) as HTMLTextAreaElement;
  await waitFor(() => expect(input.value).toBe("Send application"));
  fireEvent.change(input, { target: { value: "Ask recruiter" } });
  await patchPersistentJob({
    userId: "account-user-a",
    jobId,
    actor: "other",
    deviceId: "other",
    operation: { op: "status", expectedVersion: 1, status: "INTEREST" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Follow-up" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "another device",
  );
  await waitFor(() =>
    expect(getJobsFromStorage()[0].persistentVersion).toBe(2),
  );
  expect(input.value).toBe("Ask recruiter");
  fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(() =>
    expect(getJobsFromStorage()[0].persistentVersion).toBe(3),
  );
  expect((await getPersistentJob("account-user-a", jobId))?.nextAction).toBe(
    "Ask recruiter",
  );
});

it("does not duplicate a note when the first response is lost after server commit", async () => {
  render(
    <MantineProvider env="test" forceColorScheme="light">
      <JobDetailClient />
    </MantineProvider>,
  );
  const input = (await screen.findByLabelText(
    "Add Note",
  )) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: "One note only" } });
  dropNextPatchResponse = true;
  fireEvent.click(screen.getByRole("button", { name: "Add Note" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  await waitFor(() =>
    expect(getJobsFromStorage()[0].persistentVersion).toBe(2),
  );
  expect(input.value).toBe("One note only");
  fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(() => expect(input.value).toBe(""));
  expect((await getPersistentJob("account-user-a", jobId))?.notes).toHaveLength(
    1,
  );
});

it("keeps edits made after a failed note save when retrying", async () => {
  render(
    <MantineProvider env="test" forceColorScheme="light">
      <JobDetailClient />
    </MantineProvider>,
  );
  const input = (await screen.findByLabelText(
    "Add Note",
  )) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: "First draft" } });
  nextPatchFailure = 500;
  fireEvent.click(screen.getByRole("button", { name: "Add Note" }));
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Retry save" }).closest("fieldset")
        ?.disabled,
    ).toBe(false),
  );
  fireEvent.change(input, { target: { value: "Revised draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(() => expect(input.value).toBe(""));
  expect(
    (await getPersistentJob("account-user-a", jobId))?.notes.map(
      (note) => note.content,
    ),
  ).toEqual(["Revised draft"]);
});
