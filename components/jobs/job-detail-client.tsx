"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { statusOptions } from "@/lib/constants";
import { upsertJob } from "@/lib/local-jobs";
import { useLiveLocalJobs } from "@/lib/use-live-local-jobs";
import {
  mirrorLocalJobToPersistence,
  patchPersistentJobClient,
  toLocalJobFromPersistent,
} from "@/lib/persistence-client";
import {
  JobDetailHeader,
  JobDetailNotFound,
  JobInsightCards,
  JobNotesCard,
  JobOverviewCard,
} from "@/components/jobs/job-detail-sections";

export function JobDetailClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const { jobs, refreshJobs } = useLiveLocalJobs();
  const job = useMemo(
    () => jobs.find((item) => item.id === id) ?? null,
    [id, jobs],
  );
  const [newNote, setNewNote] = useState("");
  const [status, setStatus] = useState<(typeof statusOptions)[number] | "">("");
  const [nextActionInput, setNextActionInput] = useState("");
  const [followUpDateInput, setFollowUpDateInput] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!job) return;
    setNextActionInput(job.nextAction || "");
    setFollowUpDateInput(job.followUpDate || "");
  }, [job]);

  if (!job) {
    return <JobDetailNotFound />;
  }

  const today = new Date().toISOString().slice(0, 10);
  const isFollowUpOverdue =
    !!job.followUpDate &&
    job.followUpDate <= today &&
    job.status !== "ARCHIVE";

  const setFollowUpAfterDays = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setFollowUpDateInput(date.toISOString().slice(0, 10));
  };

  const ensurePersistentJob = async () => {
    if (job.persistentId) {
      return {
        id: job.persistentId,
        version: job.persistentVersion,
      };
    }

    const persisted = await mirrorLocalJobToPersistence(job);
    const merged = toLocalJobFromPersistent(persisted, job);
    upsertJob(merged);

    return {
      id: persisted.id,
      version: persisted.version,
    };
  };

  const saveStatus = async () => {
    setActionError(null);
    const persistent = await ensurePersistentJob();
    const updated = await patchPersistentJobClient(persistent.id, {
      op: "status",
      expectedVersion: persistent.version,
      status: status || job.status,
    });

    upsertJob(toLocalJobFromPersistent(updated, job));
    setStatus("");
    await refreshJobs();
  };

  const saveFollowUp = async () => {
    setActionError(null);
    const persistent = await ensurePersistentJob();
    const updated = await patchPersistentJobClient(persistent.id, {
      op: "update",
      expectedVersion: persistent.version,
      changes: {
        nextAction: nextActionInput.trim() || undefined,
        followUpDate: followUpDateInput.trim() || undefined,
      },
    });

    upsertJob(toLocalJobFromPersistent(updated, job));
    await refreshJobs();
  };

  const addNewNote = async () => {
    if (!newNote.trim()) return;
    setActionError(null);

    const persistent = await ensurePersistentJob();
    const updated = await patchPersistentJobClient(persistent.id, {
      op: "note",
      expectedVersion: persistent.version,
      content: newNote.trim(),
    });

    upsertJob(toLocalJobFromPersistent(updated, job));
    setNewNote("");
    await refreshJobs();
  };

  return (
    <div className="space-y-4">
      <JobDetailHeader job={job} />
      <JobOverviewCard
        job={job}
        statusValue={status}
        onStatusChange={setStatus}
        onSaveStatus={() => {
          void saveStatus().catch((error) => {
            setActionError(
              error instanceof Error
                ? error.message
                : "Failed to update job status",
            );
          });
        }}
        nextActionInput={nextActionInput}
        onNextActionChange={setNextActionInput}
        followUpDateInput={followUpDateInput}
        onFollowUpDateChange={setFollowUpDateInput}
        onSetFollowUpAfterDays={setFollowUpAfterDays}
        onSaveFollowUp={() => {
          void saveFollowUp().catch((error) => {
            setActionError(
              error instanceof Error
                ? error.message
                : "Failed to save follow-up",
            );
          });
        }}
        isFollowUpOverdue={isFollowUpOverdue}
      />
      {actionError ? (
        <p className="text-sm text-rose-600 dark:text-rose-300">{actionError}</p>
      ) : null}
      <JobInsightCards job={job} />
      <JobNotesCard
        notes={job.notes}
        newNote={newNote}
        onNewNoteChange={setNewNote}
        onAddNote={() => {
          void addNewNote().catch((error) => {
            setActionError(
              error instanceof Error ? error.message : "Failed to add note",
            );
          });
        }}
      />
    </div>
  );
}
