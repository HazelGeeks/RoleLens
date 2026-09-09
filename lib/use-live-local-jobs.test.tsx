// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  AUTH_SESSION_STORAGE_KEY,
  getJobsStorageKey,
} from "@/lib/job-cache-scope";
import { useLiveLocalJobs } from "@/lib/use-live-local-jobs";

const { listJobs } = vi.hoisted(() => ({ listJobs: vi.fn() }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated" }),
}));
vi.mock("@/lib/persistence-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/persistence-client")>()),
  listPersistentJobsClient: listJobs,
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

it("preserves local postings during an outage and clears the notice after retry", async () => {
  window.localStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({ user: { id: "account-a" } }),
  );
  const localJobs = [
    {
      id: "local-job",
      company: "Example",
      title: "Engineer",
      source: "MANUAL",
      remoteType: "REMOTE",
      descriptionRaw: "Preserve this description",
      extractedSkills: [],
      fitScore: 0,
      status: "SAVE",
      statusHistory: [
        {
          id: "saved-status",
          status: "SAVE",
          changedAt: "2026-09-09T00:00:00.000Z",
        },
      ],
      lastStatusChangedAt: "2026-09-09T00:00:00.000Z",
      tags: [],
      notes: [
        {
          id: "draft-note",
          content: "Keep this note",
          createdAt: "2026-09-09T00:00:00.000Z",
        },
      ],
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
    },
  ];
  window.localStorage.setItem(getJobsStorageKey(), JSON.stringify(localJobs));
  listJobs.mockRejectedValueOnce(new Error("Persistence request failed (503)"));
  const { result } = renderHook(() => useLiveLocalJobs());
  await waitFor(() => expect(result.current.persistenceError).toContain("503"));
  expect(result.current.jobs).toEqual(localJobs);
  expect(JSON.parse(window.localStorage.getItem(getJobsStorageKey())!)).toEqual(
    localJobs,
  );

  listJobs.mockResolvedValueOnce([]);
  await act(() => result.current.refreshJobs());
  expect(result.current.persistenceError).toBeNull();
  expect(result.current.jobs).toEqual(localJobs);
});
