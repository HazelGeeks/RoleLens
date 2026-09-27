// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { getJobById, upsertJob, type LocalJobPosting } from "./local-jobs";
import { saveJobStatus } from "./save-job-status";
import { patchPersistentJobClient } from "./persistence-client";

vi.mock("./persistence-client", async (original) => ({
  ...(await original<typeof import("./persistence-client")>()),
  patchPersistentJobClient: vi.fn(),
}));
const job: LocalJobPosting = {
  id: "job-1",
  persistentId: "remote-1",
  persistentVersion: 2,
  company: "Acme",
  title: "Engineer",
  source: "MANUAL",
  remoteType: "UNKNOWN",
  descriptionRaw: "",
  extractedSkills: [],
  fitScore: 0,
  status: "NONE",
  statusHistory: [],
  tags: [],
  notes: [],
  createdAt: "2026-09-25",
  updatedAt: "2026-09-25",
};
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  upsertJob(job);
});
it("retains guest status and history after rereading storage", async () => {
  await saveJobStatus(job.id, "NOT_APPLYING", false);
  expect(getJobById(job.id)?.status).toBe("NOT_APPLYING");
  expect(getJobById(job.id)?.statusHistory[0].status).toBe("NOT_APPLYING");
  expect(patchPersistentJobClient).not.toHaveBeenCalled();
});
it("uses version checks and preserves local status on server failure", async () => {
  vi.mocked(patchPersistentJobClient).mockRejectedValue(
    new Error("Version conflict"),
  );
  await expect(saveJobStatus(job.id, "ON_HOLD", true)).rejects.toThrow(
    "Version conflict",
  );
  expect(patchPersistentJobClient).toHaveBeenCalledWith("remote-1", {
    op: "status",
    expectedVersion: 2,
    status: "ON_HOLD",
  });
  expect(getJobById(job.id)?.status).toBe("NONE");
});
