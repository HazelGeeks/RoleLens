import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalJobPosting } from "@/lib/local-jobs";
import { LOCAL_JOBS_STORAGE_KEY } from "@/lib/local-jobs";
import type { PersistentJob } from "@/lib/persistence/types";
import { AUTH_SESSION_STORAGE_KEY } from "@/lib/auth-client";
import {
  claimLocalJobsForActiveSession,
  getPersistentJobClient,
  isPersistenceNotFoundError,
  LOCAL_JOBS_CLAIMED_EVENT,
  mirrorLocalJobToPersistence,
} from "@/lib/persistence-client";
import {
  installMockWindow,
  uninstallMockWindow,
} from "@/lib/test-utils/mock-window-storage";

const baseLocalJob: LocalJobPosting = {
  id: "local-1",
  source: "MANUAL",
  company: "RoleLens",
  title: "Frontend Engineer",
  location: "Seoul",
  remoteType: "REMOTE",
  descriptionRaw: "job description",
  extractedSkills: ["react"],
  fitScore: 80,
  status: "NONE",
  statusHistory: [],
  tags: ["frontend"],
  notes: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const basePersistentJob: PersistentJob = {
  id: "job-1",
  userId: "user-1",
  company: "RoleLens",
  title: "Frontend Engineer",
  location: "Seoul",
  status: "NONE",
  tags: ["frontend"],
  notes: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedByDevice: "web-1",
  version: 1,
};

function setupWindow() {
  const dispatchEvent = vi.fn(() => true);
  installMockWindow({}, { dispatchEvent });
}

afterEach(() => {
  vi.restoreAllMocks();
  uninstallMockWindow();
});

describe("persistence client recovery helpers", () => {
  it("detects persistence 404 errors", () => {
    expect(
      isPersistenceNotFoundError(
        new Error("Persistence request failed (404): Job not found"),
      ),
    ).toBe(true);
    expect(isPersistenceNotFoundError(new Error("Other error"))).toBe(false);
  });

  it("returns null when fetching a missing persistent job", async () => {
    setupWindow();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, message: "Job not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(getPersistentJobClient("missing-id")).resolves.toBeNull();
  });

  it("uses clientRequestId override when recreating a persistent job", async () => {
    setupWindow();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/jobs") {
        if (init?.method === "GET") {
          return new Response(JSON.stringify({ ok: true, jobs: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ ok: true, job: basePersistentJob }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }

      if (url === "/api/jobs/job-1") {
        return new Response(JSON.stringify({ ok: true, job: basePersistentJob }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      throw new Error("Unexpected fetch URL: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);

    await mirrorLocalJobToPersistence(baseLocalJob, {
      clientRequestId: "recovery:local-1:1",
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { clientRequestId?: string };
    expect(payload.clientRequestId).toBe("recovery:local-1:1");
  });

  it("claims local jobs for the active account session", async () => {
    const dispatchEvent = vi.fn(() => true);
    const { localStorage } = installMockWindow({
      [AUTH_SESSION_STORAGE_KEY]: JSON.stringify({
        user: {
          id: "user-1",
          email: "user@example.com",
          name: "User",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }),
      [LOCAL_JOBS_STORAGE_KEY]: JSON.stringify([
        {
          ...baseLocalJob,
          persistentId: "anonymous-job-1",
          persistentVersion: 3,
        },
      ]),
    }, {
      dispatchEvent,
    });

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, job: basePersistentJob }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimLocalJobsForActiveSession()).resolves.toEqual({
      claimed: 1,
      failed: 0,
    });

    const init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as {
      clientRequestId?: string;
    };
    expect(payload.clientRequestId).toBe("account-claim:local-1");
    expect(payload).not.toHaveProperty("persistentId");

    const stored = JSON.parse(
      localStorage.getItem(LOCAL_JOBS_STORAGE_KEY) || "[]",
    ) as LocalJobPosting[];
    expect(stored[0]?.persistentId).toBe("job-1");
    expect(stored[0]?.persistentVersion).toBe(1);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: LOCAL_JOBS_CLAIMED_EVENT,
        detail: {
          claimed: 1,
          failed: 0,
        },
      }),
    );
  });

  it("does not recreate local jobs already present in the active account", async () => {
    const { localStorage } = installMockWindow({
      [AUTH_SESSION_STORAGE_KEY]: JSON.stringify({
        user: {
          id: "user-1",
          email: "user@example.com",
          name: "User",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }),
      [LOCAL_JOBS_STORAGE_KEY]: JSON.stringify([
        {
          ...baseLocalJob,
          persistentId: "job-1",
          persistentVersion: 1,
        },
      ]),
    });

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, jobs: [basePersistentJob] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimLocalJobsForActiveSession()).resolves.toEqual({
      claimed: 1,
      failed: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("GET");

    const stored = JSON.parse(
      localStorage.getItem(LOCAL_JOBS_STORAGE_KEY) || "[]",
    ) as LocalJobPosting[];
    expect(stored[0]?.persistentId).toBe("job-1");
    expect(stored[0]?.persistentVersion).toBe(1);
  });
});
