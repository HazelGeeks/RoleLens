import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AUTH_SESSION_STORAGE_KEY } from "@/lib/job-cache-scope";
import {
  createPersistentJobClient,
  listPersistentJobsClient,
} from "@/lib/persistence-client";
import {
  installMockWindow,
  uninstallMockWindow,
} from "@/lib/test-utils/mock-window-storage";

beforeEach(() => {
  installMockWindow();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  uninstallMockWindow();
});

it("recovers an account list after a temporary gateway outage", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response("Worker unavailable", { status: 503 }))
    .mockResolvedValueOnce(Response.json({ jobs: [{ id: "restored-job" }] }));
  vi.stubGlobal("fetch", fetchMock);
  const result = listPersistentJobsClient();
  await vi.runAllTimersAsync();
  await expect(result).resolves.toEqual([{ id: "restored-job" }]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("bounds retries and permits a fresh attempt after a sustained outage", async () => {
  const fetchMock = vi.fn(
    async () => new Response("Unavailable", { status: 503 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const failed = expect(listPersistentJobsClient()).rejects.toThrow("503");
  await vi.runAllTimersAsync();
  await failed;
  expect(fetchMock).toHaveBeenCalledTimes(3);
  fetchMock.mockImplementation(async () => Response.json({ jobs: [] }));
  await expect(listPersistentJobsClient()).resolves.toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it("shares simultaneous account lists but fetches again after completion", async () => {
  let resolveResponse!: (response: Response) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const first = listPersistentJobsClient();
  const second = listPersistentJobsClient();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  resolveResponse(Response.json({ jobs: [] }));
  await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
  const fresh = listPersistentJobsClient();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  resolveResponse(Response.json({ jobs: [{ id: "new-job" }] }));
  await expect(fresh).resolves.toEqual([{ id: "new-job" }]);
});

it("stops a pending retry if the account changes", async () => {
  const fetchMock = vi.fn(
    async () => new Response("Unavailable", { status: 503 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const failed = expect(listPersistentJobsClient()).rejects.toThrow(
    "Account changed",
  );
  await vi.advanceTimersByTimeAsync(0);
  window.localStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({ user: { id: "another-account" } }),
  );
  await vi.runAllTimersAsync();
  await failed;
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("starts a new list after a successful write instead of sharing a pre-write response", async () => {
  const resolveLists: Array<(response: Response) => void> = [];
  const fetchMock = vi.fn<typeof fetch>((_input, init) => {
    if (init?.method === "POST")
      return Promise.resolve(Response.json({ job: { id: "new-job" } }));
    return new Promise<Response>((resolve) => resolveLists.push(resolve));
  });
  vi.stubGlobal("fetch", fetchMock);
  const beforeWrite = listPersistentJobsClient();
  await createPersistentJobClient({ company: "Example", title: "Engineer" });
  const afterWrite = listPersistentJobsClient();
  expect(resolveLists).toHaveLength(2);
  resolveLists[0](Response.json({ jobs: [] }));
  await beforeWrite;
  const sharedAfterWrite = listPersistentJobsClient();
  expect(resolveLists).toHaveLength(2);
  resolveLists[1](Response.json({ jobs: [{ id: "new-job" }] }));
  await expect(Promise.all([afterWrite, sharedAfterWrite])).resolves.toEqual([
    [{ id: "new-job" }],
    [{ id: "new-job" }],
  ]);
});

it("does not retry authentication failures", async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({ message: "Unauthorized" }, { status: 401 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  await expect(listPersistentJobsClient()).rejects.toThrow("401");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not replay writes when the server returns 503", async () => {
  const fetchMock = vi.fn(
    async () => new Response("Unavailable", { status: 503 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    createPersistentJobClient({ company: "Example", title: "Engineer" }),
  ).rejects.toThrow("503");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
