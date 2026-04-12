"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getJobsFromStorage,
  LOCAL_JOBS_STORAGE_KEY,
  LOCAL_JOBS_UPDATED_EVENT,
  type LocalJobPosting,
} from "@/lib/local-jobs";

export function useLiveLocalJobs() {
  const [jobs, setJobs] = useState<LocalJobPosting[]>(() =>
    getJobsFromStorage(),
  );

  const refreshJobs = useCallback(() => {
    setJobs(getJobsFromStorage());
  }, []);

  useEffect(() => {
    const handleJobsUpdated = () => {
      refreshJobs();
    };

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === LOCAL_JOBS_STORAGE_KEY) {
        refreshJobs();
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
