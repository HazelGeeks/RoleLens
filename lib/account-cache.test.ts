import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AUTH_SESSION_STORAGE_KEY, signOutLocalAuth } from "@/lib/auth-client";
import {
  claimLocalJobsForActiveSession,
  mirrorLocalJobToPersistence,
  toLocalJobFromPersistent,
} from "@/lib/persistence-client";
import {
  getJobsFromStorage,
  LEGACY_JOBS_STORAGE_KEY,
  saveJobsToStorage,
  type LocalJobPosting,
} from "@/lib/local-jobs";
import {
  getJobsStorageKey,
  GUEST_JOBS_STORAGE_KEY,
} from "@/lib/job-cache-scope";
import {
  installMockWindow,
  uninstallMockWindow,
} from "@/lib/test-utils/mock-window-storage";
import {
  createPersistentJob,
  listPersistentJobs,
  resetPersistentStoreForTests,
} from "@/lib/persistence/store";
import { GET, POST } from "@/app/api/jobs/route";
import { GET as GET_JOB, PATCH } from "@/app/api/jobs/[id]/route";
const now = "2026-09-04T00:00:00.000Z";
const draft: LocalJobPosting = {
  id: "local-a",
  source: "LINKEDIN",
  company: "Company A",
  title: "Engineer",
  remoteType: "REMOTE",
  descriptionRaw: "React TypeScript engineering",
  salaryMin: 100000,
  salaryMax: 150000,
  salaryCurrency: "CAD",
  extractedSkills: ["react", "typescript"],
  fitScore: 90,
  fitBreakdown: { overall: 90 },
  status: "SAVE",
  statusHistory: [],
  notes: [{ id: "note-a", content: "My private note", createdAt: now }],
  tags: [],
  createdAt: now,
  updatedAt: now,
  publishedAt: now,
};
function session(id: string | null) {
  if (id)
    window.localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        user: { id, name: id, email: `${id}@example.test`, createdAt: now },
      }),
    );
  else window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}
beforeEach(() => {
  installMockWindow();
  resetPersistentStoreForTests();
  vi.stubEnv("PERSISTENCE_BACKEND", "memory");
  vi.stubEnv("PERSISTENCE_POC_TOKEN", "");
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === "/api/auth/logout") return Response.json({ ok: true });
      const request = new Request(new URL(url, "https://rolelens.test"), init);
      if (url === "/api/jobs")
        return init?.method === "POST" ? POST(request) : GET(request);
      const id = url.split("/").filter(Boolean).at(-1)!;
      const context = { params: Promise.resolve({ id }) };
      return init?.method === "PATCH"
        ? PATCH(request, context)
        : GET_JOB(request, context);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  uninstallMockWindow();
});

it("keeps account A's jobs private after logout and account B login", async () => {
  session("user-a");
  const saved = await mirrorLocalJobToPersistence(draft);
  saveJobsToStorage([toLocalJobFromPersistent(saved, draft)]);
  const accountAKey = getJobsStorageKey();
  await signOutLocalAuth();
  expect(getJobsFromStorage()).toEqual([]);
  session("user-b");
  expect(await claimLocalJobsForActiveSession()).toEqual({
    claimed: 0,
    failed: 0,
  });
  expect(await listPersistentJobs("account-user-b")).toEqual([]);
  expect(getJobsFromStorage()).toEqual([]);
  expect(getJobsFromStorage(accountAKey)[0].notes[0].content).toBe(
    "My private note",
  );
  session("user-a");
  expect(getJobsFromStorage()[0].company).toBe("Company A");
});

it("claims new guest drafts once and restores full metadata and notes with an empty cache", async () => {
  saveJobsToStorage([draft]);
  session("user-a");
  expect(await claimLocalJobsForActiveSession()).toEqual({
    claimed: 1,
    failed: 0,
  });
  expect(getJobsFromStorage(GUEST_JOBS_STORAGE_KEY)).toEqual([]);
  const persistent = (await listPersistentJobs("account-user-a"))[0];
  const restored = toLocalJobFromPersistent(persistent);
  expect(restored).toMatchObject({
    source: draft.source,
    remoteType: draft.remoteType,
    descriptionRaw: draft.descriptionRaw,
    salaryMin: 100000,
    salaryMax: 150000,
    salaryCurrency: "CAD",
    extractedSkills: draft.extractedSkills,
    fitScore: 90,
    publishedAt: now,
  });
  expect(restored.notes.map((note) => note.content)).toEqual([
    "My private note",
  ]);
  await claimLocalJobsForActiveSession();
  expect(await listPersistentJobs("account-user-a")).toHaveLength(1);
});

it("only recovers legacy shared cache records whose persistent IDs belong to the account", async () => {
  const owned = await createPersistentJob({
    userId: "account-user-a",
    deviceId: "test",
    actor: "test",
    input: { company: draft.company, title: draft.title },
  });
  window.localStorage.setItem(
    LEGACY_JOBS_STORAGE_KEY,
    JSON.stringify([
      { ...draft, persistentId: owned.id },
      {
        ...draft,
        id: "unowned",
        persistentId: "other-account-id",
        company: "Private B",
      },
    ]),
  );
  session("user-a");
  expect(await claimLocalJobsForActiveSession()).toEqual({
    claimed: 1,
    failed: 0,
  });
  const jobs = await listPersistentJobs("account-user-a");
  expect(jobs).toHaveLength(1);
  expect(jobs[0].meta?.descriptionRaw).toBe(draft.descriptionRaw);
  expect(jobs[0].notes[0].content).toBe("My private note");
  expect(getJobsFromStorage()).toHaveLength(1);
  expect(getJobsFromStorage(LEGACY_JOBS_STORAGE_KEY)).toHaveLength(2);
});

it("does not upload anything when the account listing fails", async () => {
  saveJobsToStorage([draft]);
  session("user-a");
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({ message: "Unavailable" }, { status: 503 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  await expect(claimLocalJobsForActiveSession()).rejects.toThrow("503");
  expect(fetchMock).toHaveBeenCalled();
  expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(
    true,
  );
  expect(getJobsFromStorage(GUEST_JOBS_STORAGE_KEY)).toHaveLength(1);
});

it("discards responses arriving after the user switches accounts", async () => {
  saveJobsToStorage([draft]);
  session("user-a");
  let respond!: (response: Response) => void;
  const fetchMock = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const pending = claimLocalJobsForActiveSession();
  session("user-b");
  respond(Response.json({ jobs: [] }));
  await expect(pending).rejects.toThrow("Account changed");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(getJobsFromStorage()).toEqual([]);
});

it("rejects a saved job if the account switches while its response body is being read", async () => {
  session("user-a");
  const originalFetch = fetch;
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const response = await originalFetch(input, init);
    const readBody = response.json.bind(response);
    vi.spyOn(response, "json").mockImplementation(async () => {
      session("user-b");
      return readBody();
    });
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  await expect(mirrorLocalJobToPersistence(draft)).rejects.toThrow(
    "Account changed",
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await listPersistentJobs("account-user-b")).toEqual([]);
  expect(getJobsFromStorage()).toEqual([]);
});
