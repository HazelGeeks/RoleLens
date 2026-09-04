"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getJobsFromStorage,
  LOCAL_JOBS_UPDATED_EVENT,
  type LocalJobPosting,
} from "@/lib/local-jobs";
import { getJobsStorageKey } from "@/lib/job-cache-scope";
import { useAuth } from "@/components/providers/auth-provider";
import {
  listPersistentJobsClient,
  mergeLocalWithPersistent,
} from "@/lib/persistence-client";

export function useLiveLocalJobs() {
  const { status } = useAuth();
  const refreshSequence = useRef(0);
  // Keep the first client render identical to SSR output.
  // We read localStorage after mount to avoid hydration mismatch.
  const [jobs, setJobs] = useState<LocalJobPosting[]>([]);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);

  const refreshJobs = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const scope = getJobsStorageKey();
    if (status === "loading") return;
    const localJobs = getJobsFromStorage();
    setJobs(localJobs);
    if (status !== "authenticated") {
      setPersistenceError(null);
      return;
    }
    try {
      const persistentJobs = await listPersistentJobsClient();
      if (sequence !== refreshSequence.current || scope !== getJobsStorageKey())
        return;
      const merged = mergeLocalWithPersistent(
        getJobsFromStorage(),
        persistentJobs,
      );
      window.localStorage.setItem(scope, JSON.stringify(merged));
      setPersistenceError(null);
      setJobs(merged);
    } catch (error) {
      if (sequence !== refreshSequence.current || scope !== getJobsStorageKey())
        return;
      setPersistenceError(
        error instanceof Error
          ? error.message
          : "Unable to load account postings.",
      );
      setJobs(getJobsFromStorage());
    }
  }, [status]);

  useEffect(() => {
    void refreshJobs();

    const handleJobsUpdated = () => {
      void refreshJobs();
    };

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === getJobsStorageKey()) {
        void refreshJobs();
      }
    };

    window.addEventListener(
      LOCAL_JOBS_UPDATED_EVENT,
      handleJobsUpdated as EventListener,
    );
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      refreshSequence.current += 1;
      window.removeEventListener(
        LOCAL_JOBS_UPDATED_EVENT,
        handleJobsUpdated as EventListener,
      );
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [refreshJobs]);

  return {
    jobs,
    persistenceError,
    refreshJobs,
  };
}
