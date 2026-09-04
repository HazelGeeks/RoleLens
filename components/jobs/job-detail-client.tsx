"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { statusOptions } from "@/lib/constants";
import { upsertJob, getJobById } from "@/lib/local-jobs";
import { useLiveLocalJobs } from "@/lib/use-live-local-jobs";
import {
  isPersistenceNotFoundError,
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
import styles from "./job-detail-sections.module.css";

export function JobDetailClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const { jobs, refreshJobs } = useLiveLocalJobs();
  const job = useMemo(
    () => jobs.find((item) => item.id === id) ?? null,
    [id, jobs],
  );
  const [newNote, setNewNote] = useState("");
  const [nextActionInput, setNextActionInput] = useState("");
  const [followUpDateInput, setFollowUpDateInput] = useState("");
  const isSaving = useRef(false);
  const [saving, setSaving] = useState(false);
  const currentDraft = useRef({ newNote, nextActionInput, followUpDateInput });
  const noteRequest = useRef<{
    id: string;
    content: string;
    createdAt: string;
  } | null>(null);
  useEffect(() => {
    currentDraft.current = { newNote, nextActionInput, followUpDateInput };
  }, [newNote, nextActionInput, followUpDateInput]);
  const retryAction = useRef<(() => Promise<void>) | null>(null);
  const initializedJobId = useRef<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!job || initializedJobId.current === job.id) return;
    initializedJobId.current = job.id;
    setNextActionInput(job.nextAction || "");
    setFollowUpDateInput(job.followUpDate || "");
  }, [job]);

  if (!job) {
    return <JobDetailNotFound />;
  }

  const today = new Date().toISOString().slice(0, 10);
  const isFollowUpOverdue =
    !!job.followUpDate && job.followUpDate <= today && job.status !== "ARCHIVE";

  const setFollowUpAfterDays = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setFollowUpDateInput(date.toISOString().slice(0, 10));
  };

  const recreatePersistentJob = async () => {
    const detachedJob = {
      ...job,
      persistentId: undefined,
      persistentVersion: undefined,
    };

    const persisted = await mirrorLocalJobToPersistence(detachedJob, {
      clientRequestId: `recovery:${job.id}:${crypto.randomUUID()}`,
    });
    const merged = toLocalJobFromPersistent(persisted, detachedJob);
    upsertJob(merged);

    return {
      id: persisted.id,
      version: persisted.version,
    };
  };

  const ensurePersistentJob = async () => {
    const latest = getJobById(job.id) ?? job;
    if (latest.persistentId) {
      return {
        id: latest.persistentId,
        version: latest.persistentVersion,
      };
    }

    return recreatePersistentJob();
  };

  const patchPersistentJobWithRecovery = async (
    buildPatch: (
      expectedVersion: number | undefined,
    ) => Parameters<typeof patchPersistentJobClient>[1],
  ) => {
    const persistent = await ensurePersistentJob();

    try {
      return await patchPersistentJobClient(
        persistent.id,
        buildPatch(persistent.version),
      );
    } catch (error) {
      if (!isPersistenceNotFoundError(error)) {
        throw error;
      }

      const recovered = await recreatePersistentJob();
      return patchPersistentJobClient(
        recovered.id,
        buildPatch(recovered.version),
      );
    }
  };

  const runAction = async (action: () => Promise<void>) => {
    if (isSaving.current) return;
    isSaving.current = true;
    setSaving(true);
    setActionError(null);
    retryAction.current = action;
    try {
      await action();
      retryAction.current = null;
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to save. Please retry.",
      );
      // Fetch the current version for an explicit retry; keep the user's draft inputs.
      await refreshJobs();
    } finally {
      isSaving.current = false;
      setSaving(false);
    }
  };

  const saveStatus = async (nextStatus: (typeof statusOptions)[number]) => {
    const updated = await patchPersistentJobWithRecovery((expectedVersion) => ({
      op: "status",
      expectedVersion,
      status: nextStatus,
    }));
    upsertJob(toLocalJobFromPersistent(updated, job));
  };

  const saveFollowUp = async () => {
    const updated = await patchPersistentJobWithRecovery((expectedVersion) => ({
      op: "update",
      expectedVersion,
      changes: {
        nextAction: currentDraft.current.nextActionInput.trim() || null,
        followUpDate: currentDraft.current.followUpDateInput.trim() || null,
      },
    }));
    upsertJob(toLocalJobFromPersistent(updated, job));
  };

  const addNewNote = async () => {
    const content = currentDraft.current.newNote.trim();
    if (!content) return;
    if (noteRequest.current?.content !== content)
      noteRequest.current = {
        id: crypto.randomUUID(),
        content,
        createdAt: new Date().toISOString(),
      };
    const note = noteRequest.current;
    const updated = await patchPersistentJobWithRecovery((expectedVersion) => ({
      op: "import-notes",
      expectedVersion,
      notes: [note],
    }));
    upsertJob(toLocalJobFromPersistent(updated, job));
    noteRequest.current = null;
    setNewNote("");
  };

  return (
    <fieldset
      disabled={saving}
      className={styles.detailStack}
      aria-busy={saving}
    >
      <JobDetailHeader job={job} />
      <JobOverviewCard
        job={job}
        onSaveStatus={(nextStatus) => {
          void runAction(() => saveStatus(nextStatus));
        }}
        nextActionInput={nextActionInput}
        onNextActionChange={setNextActionInput}
        followUpDateInput={followUpDateInput}
        onFollowUpDateChange={setFollowUpDateInput}
        onSetFollowUpAfterDays={setFollowUpAfterDays}
        onSaveFollowUp={() => {
          void runAction(saveFollowUp);
        }}
        isFollowUpOverdue={isFollowUpOverdue}
      />
      {actionError ? (
        <div role="alert" className="text-sm text-rose-600 dark:text-rose-300">
          <p>{actionError}</p>
          <button
            type="button"
            onClick={() => {
              if (retryAction.current) void runAction(retryAction.current);
            }}
          >
            Retry save
          </button>
        </div>
      ) : null}
      <JobInsightCards
        job={job}
        notesCard={
          <JobNotesCard
            notes={job.notes}
            newNote={newNote}
            onNewNoteChange={setNewNote}
            onAddNote={() => {
              void runAction(addNewNote);
            }}
          />
        }
      />
    </fieldset>
  );
}
