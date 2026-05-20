"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getJobsFromStorage,
  LOCAL_JOBS_STORAGE_KEY,
  LOCAL_JOBS_UPDATED_EVENT,
  type LocalJobPosting,
} from "@/lib/local-jobs";
import {
  listPersistentJobsClient,
  mergeLocalWithPersistent,
} from "@/lib/persistence-client";

export function useLiveLocalJobs() {
  // Keep the first client render identical to SSR output.
  // We read localStorage after mount to avoid hydration mismatch.
  const [jobs, setJobs] = useState<LocalJobPosting[]>([]);

  const refreshJobs = useCallback(async () => {
    const localJobs = getJobsFromStorage();

    try {
      const persistentJobs = await listPersistentJobsClient();
      const merged = mergeLocalWithPersistent(localJobs, persistentJobs);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_JOBS_STORAGE_KEY, JSON.stringify(merged));
      }
      setJobs(merged);
    } catch {
      setJobs(localJobs);
    }
  }, []);

  useEffect(() => {
    void refreshJobs();

    const handleJobsUpdated = () => {
      void refreshJobs();
    };

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === LOCAL_JOBS_STORAGE_KEY) {
        void refreshJobs();
      }
    };

    window.addEventListener(
      LOCAL_JOBS_UPDATED_EVENT,
      handleJobsUpdated as EventListener,
    );
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      window.removeEventListener(
        LOCAL_JOBS_UPDATED_EVENT,
        handleJobsUpdated as EventListener,
      );
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [refreshJobs]);

  return {
    jobs,
    refreshJobs,
  };
}
