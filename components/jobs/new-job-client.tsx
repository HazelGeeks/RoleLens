"use client";

import { useRouter } from "next/navigation";
import { JobSaveForm } from "@/components/jobs/job-save-form";
import type { CreateJobParsed } from "@/lib/validators";

export function NewJobClient() {
  const router = useRouter();

  const handleSubmit = async (values: CreateJobParsed) => {
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });

    const payload = (await response.json()) as { id?: string; error?: string };

    if (!response.ok || !payload.id) {
      throw new Error(payload.error ?? "Failed to save posting");
    }

    router.push(`/jobs/${payload.id}`);
    router.refresh();
  };

  return <JobSaveForm onSubmit={handleSubmit} />;
}
