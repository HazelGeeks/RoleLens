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

type MemoryStorageSeed = Record<string, string>;

function createMemoryStorage(seed: MemoryStorageSeed = {}): Storage {
  const map = new Map(Object.entries(seed));

  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function installWindow(seed: MemoryStorageSeed = {}) {
  const localStorage = createMemoryStorage(seed);
  const dispatchEvent = vi.fn(() => true);

  const fakeWindow = {
    localStorage,
    dispatchEvent,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "window", {
    value: fakeWindow,
    writable: true,
    configurable: true,
  });

  if (typeof globalThis.CustomEvent === "undefined") {
    class CustomEventPolyfill<T = unknown> extends Event {
      detail: T;

      constructor(type: string, params?: CustomEventInit<T>) {
        super(type, params);
        this.detail = params?.detail as T;
      }
    }

    Object.defineProperty(globalThis, "CustomEvent", {
      value: CustomEventPolyfill,
      writable: true,
      configurable: true,
    });
  }

  return {
    localStorage,
    dispatchEvent,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

describe("local jobs reliability", () => {
  it("initializes with an empty array instead of sample data", () => {
    const { localStorage } = installWindow();

    const jobs = getJobsFromStorage();

    expect(jobs).toEqual([]);
    expect(localStorage.getItem(LOCAL_JOBS_STORAGE_KEY)).toBe("[]");
  });

  it("repairs malformed storage payloads", () => {
    const { localStorage } = installWindow({
      [LOCAL_JOBS_STORAGE_KEY]: "{not-json",
    });

    const jobs = getJobsFromStorage();

    expect(jobs).toEqual([]);
    expect(localStorage.getItem(LOCAL_JOBS_STORAGE_KEY)).toBe("[]");
  });

  it("repairs non-array storage payloads", () => {
    const { localStorage } = installWindow({
      [LOCAL_JOBS_STORAGE_KEY]: JSON.stringify({ invalid: true }),
    });

    const jobs = getJobsFromStorage();

    expect(jobs).toEqual([]);
    expect(localStorage.getItem(LOCAL_JOBS_STORAGE_KEY)).toBe("[]");
  });

  it("dispatches update events for save/status/note/follow-up mutations", () => {
    const { dispatchEvent } = installWindow();

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
      status: "SAVED",
      statusHistory: [
        {
          id: "h-1",
          status: "SAVED",
          changedAt: now,
        },
      ],
      tags: [],
      notes: [],
      createdAt: now,
      updatedAt: now,
    });

    updateStatus("job-1", "APPLIED");
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