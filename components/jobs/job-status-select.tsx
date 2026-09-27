"use client";

import { useRef, useState } from "react";
import { Select } from "@/components/ui/select";
import { statusLabels, statusOptions } from "@/lib/constants";
import type { JobStatus } from "@/lib/local-jobs";

type Props = {
  job: { id: string; title: string; company: string; status: JobStatus };
  onSave: (id: string, status: JobStatus) => Promise<void>;
  disabled?: boolean;
};

export function JobStatusSelect({ job, onSave, disabled }: Props) {
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(status: JobStatus) {
    if (lock.current || status === job.status) return;
    lock.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(job.id, status);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to save. Please try again.",
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="min-w-[150px]">
      <Select
        aria-label={`My status for ${job.title} at ${job.company}`}
        value={job.status}
        disabled={disabled || saving}
        onChange={(event) => void change(event.target.value as JobStatus)}
      >
        {statusOptions.map((status) => (
          <option key={status} value={status}>
            {status === "NONE" ? "No status" : statusLabels[status]}
          </option>
        ))}
      </Select>
      {saving ? (
        <p role="status" className="text-xs">
          Saving…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error} Select a status to retry.
        </p>
      ) : null}
    </div>
  );
}
