import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addNote,
  getJobsFromStorage,
  LOCAL_JOBS_STORAGE_KEY,
  LOCAL_JOBS_UPDATED_EVENT,
  updateFollowUp,
  updateStatus,
  upsertJob,
  type LocalJobsUpdatedDetail,
} from "@/lib/local-jobs";
import {
  installMockWindow,
  uninstallMockWindow,
  type MemoryStorageSeed,
} from "@/lib/test-utils/mock-window-storage";

function setupWindow(seed: MemoryStorageSeed = {}) {
  const dispatchEvent = vi.fn(() => true);
  const { localStorage } = installMockWindow(seed, {
    dispatchEvent,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });

  return {
    localStorage,
    dispatchEvent,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  uninstallMockWindow();
});

describe("local jobs reliability", () => {
  it("initializes with an empty array instead of sample data", () => {
    const { localStorage } = setupWindow();

    const jobs = getJobsFromStorage();

    expect(jobs).toEqual([]);
    expect(localStorage.getItem(LOCAL_JOBS_STORAGE_KEY)).toBe("[]");
  });

  it("repairs malformed storage payloads", () => {
    const { localStorage } = setupWindow({
      [LOCAL_JOBS_STORAGE_KEY]: "{not-json",
    });

    const jobs = getJobsFromStorage();

    expect(jobs).toEqual([]);
    expect(localStorage.getItem(LOCAL_JOBS_STORAGE_KEY)).toBe("[]");
  });

  it("repairs non-array storage payloads", () => {
    const { localStorage } = setupWindow({
      [LOCAL_JOBS_STORAGE_KEY]: JSON.stringify({ invalid: true }),
    });

    const jobs = getJobsFromStorage();

    expect(jobs).toEqual([]);
    expect(localStorage.getItem(LOCAL_JOBS_STORAGE_KEY)).toBe("[]");
  });

  it("maps legacy statuses to the new 4-state model when reading storage", () => {
    const now = new Date().toISOString();
    setupWindow({
      [LOCAL_JOBS_STORAGE_KEY]: JSON.stringify([
        {
          id: "legacy-1",
          source: "MANUAL",
          company: "Legacy Co",
          title: "Frontend Engineer",
          remoteType: "REMOTE",
          descriptionRaw: "Legacy posting",
          extractedSkills: ["React"],
          fitScore: 80,
          status: "INTERVIEW",
          statusHistory: [
            {
              id: "h-legacy-1",
              status: "REJECTED",
              changedAt: now,
            },
          ],
          tags: [],
          notes: [],
          createdAt: now,
          updatedAt: now,
        },
      ]),
    });

    const jobs = getJobsFromStorage();

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("SUBMITTED");
    expect(jobs[0]?.statusHistory[0]?.status).toBe("ARCHIVE");
  });

  it("dispatches update events for save/status/note/follow-up mutations", () => {
    const { dispatchEvent } = setupWindow();

    const now = new Date().toISOString();
    upsertJob({
      id: "job-1",
      source: "MANUAL",
      company: "Acme",
      title: "Frontend Engineer",
      remoteType: "REMOTE",
      descriptionRaw: "React and TypeScript",
      extractedSkills: ["React", "TypeScript"],
      fitScore: 82,
      status: "SAVE",
      statusHistory: [
        {
          id: "h-1",
          status: "SAVE",
          changedAt: now,
        },
      ],
      tags: [],
      notes: [],
      createdAt: now,
      updatedAt: now,
    });

    updateStatus("job-1", "SUBMITTED");
    addNote("job-1", "Applied with tailored resume");
    updateFollowUp("job-1", {
      nextAction: "Follow up with recruiter",
      followUpDate: "2026-04-20",
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(4);

    const reasons = dispatchEvent.mock.calls.map((args) => {
      const event = args[0] as CustomEvent<LocalJobsUpdatedDetail>;
      expect(event.type).toBe(LOCAL_JOBS_UPDATED_EVENT);
      return event.detail.reason;
    });

    expect(reasons).toEqual(["upsert", "status", "note", "follow-up"]);
  });
});
