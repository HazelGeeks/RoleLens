import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalJobPosting } from "@/lib/local-jobs";
import type { PersistentJob } from "@/lib/persistence/types";
import {
  getPersistentJobClient,
  isPersistenceNotFoundError,
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

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, job: basePersistentJob }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await mirrorLocalJobToPersistence(baseLocalJob, {
      clientRequestId: "recovery:local-1:1",
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { clientRequestId?: string };
    expect(payload.clientRequestId).toBe("recovery:local-1:1");
  });
});
