import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/local-jobs", () => ({
  getJobsFromStorage: vi.fn(() => []),
  saveJobsToStorage: vi.fn(),
}));

import { getLastFeedSyncSummary, syncJobsFromFeeds } from "@/lib/feed-sync";

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

  const fakeWindow = {
    localStorage,
    dispatchEvent: vi.fn(() => true),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "window", {
    value: fakeWindow,
    writable: true,
    configurable: true,
  });

  return { localStorage };
}

beforeEach(() => {
  installWindow();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as { window?: unknown }).window;
});

describe("feed sync observability", () => {
  it("returns source-level results and persists last sync summary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            generatedAt: "2026-04-13T00:00:00.000Z",
            sourceCount: 2,
            jobs: [
              {
                externalId: "gh:acme:1",
                source: "COMPANY_SITE",
                sourceLabel: "Greenhouse",
                company: "Acme",
                title: "Frontend Engineer",
                descriptionRaw: "React TypeScript",
                extractedSkills: ["React", "TypeScript"],
                tags: ["greenhouse"],
              },
            ],
            errors: [
              {
                source: "Lever",
                message: "Timed out",
              },
            ],
            sourceResults: [
              {
                source: "Greenhouse",
                ok: true,
                importedJobs: 1,
              },
              {
                source: "Lever",
                ok: false,
                importedJobs: 0,
                message: "Timed out",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
    );

    const result = await syncJobsFromFeeds({ refresh: true });

    expect(result.totalImported).toBe(1);
    expect(result.sourceCount).toBe(2);
    expect(result.sourceResults).toEqual([
      {
        source: "Greenhouse",
        ok: true,
        importedJobs: 1,
      },
      {
        source: "Lever",
        ok: false,
        importedJobs: 0,
        message: "Timed out",
      },
    ]);

    const summary = getLastFeedSyncSummary();
    expect(summary).not.toBeNull();
    expect(summary?.sourceCount).toBe(2);
    expect(summary?.errors).toHaveLength(1);
    expect(summary?.sourceResults[1]?.source).toBe("Lever");
  });
});