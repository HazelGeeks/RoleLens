"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { statusOptions } from "@/lib/constants";
import { addNote, updateFollowUp, updateStatus } from "@/lib/local-jobs";
import { useLiveLocalJobs } from "@/lib/use-live-local-jobs";
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
    job.status !== "CLOSED" &&
    job.status !== "REJECTED";

  const setFollowUpAfterDays = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setFollowUpDateInput(date.toISOString().slice(0, 10));
  };

  const saveStatus = () => {
    updateStatus(
      job.id,
      (status || job.status) as (typeof statusOptions)[number],
    );
    setStatus("");
    refreshJobs();
  };

  const saveFollowUp = () => {
    updateFollowUp(job.id, {
      nextAction: nextActionInput,
      followUpDate: followUpDateInput,
    });
    refreshJobs();
  };

  const addNewNote = () => {
    if (!newNote.trim()) return;
    addNote(job.id, newNote.trim());
    setNewNote("");
    refreshJobs();
  };

  return (
    <div className="space-y-4">
      <JobDetailHeader job={job} />
      <JobOverviewCard
        job={job}
        statusValue={status}
        onStatusChange={setStatus}
        onSaveStatus={saveStatus}
        nextActionInput={nextActionInput}
        onNextActionChange={setNextActionInput}
        followUpDateInput={followUpDateInput}
        onFollowUpDateChange={setFollowUpDateInput}
        onSetFollowUpAfterDays={setFollowUpAfterDays}
        onSaveFollowUp={saveFollowUp}
        isFollowUpOverdue={isFollowUpOverdue}
      />
      <JobInsightCards job={job} />
      <JobNotesCard
        notes={job.notes}
        newNote={newNote}
        onNewNoteChange={setNewNote}
        onAddNote={addNewNote}
      />
    </div>
  );
}
