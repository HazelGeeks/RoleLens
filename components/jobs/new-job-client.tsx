"use client";

import { useRouter } from "next/navigation";
import { JobSaveForm } from "@/components/jobs/job-save-form";
import type { CreateJobParsed } from "@/lib/validators";
import { calculateFitScore, extractSkills } from "@/lib/fit-score";
import { upsertJob } from "@/lib/local-jobs";

export function NewJobClient() {
  const router = useRouter();

  const handleSubmit = async (values: CreateJobParsed) => {
    const fitBreakdown = calculateFitScore({
      title: values.title,
      descriptionRaw: values.descriptionRaw,
      seniority: values.seniority,
      workAuthorizationNote: values.workAuthorizationNote,
    });

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    upsertJob({
      id,
      source: values.source,
      sourceUrl: values.sourceUrl || undefined,
      company: values.company,
      title: values.title,
      location: values.location || undefined,
      remoteType: values.remoteType,
      employmentType: values.employmentType || undefined,
      salaryMin: values.salaryMin,
      salaryMax: values.salaryMax,
      salaryCurrency: values.salaryCurrency || "CAD",
      seniority: values.seniority || undefined,
      workAuthorizationNote: values.workAuthorizationNote || undefined,
      descriptionRaw: values.descriptionRaw,
      extractedSkills: Array.from(
        new Set(extractSkills(values.descriptionRaw)),
      ),
      fitScore: fitBreakdown.overall,
      fitBreakdown,
      status: values.status,
      nextAction: values.nextAction || undefined,
      followUpDate: values.followUpDate || undefined,
      lastStatusChangedAt: now,
      statusHistory: [
        {
          id: crypto.randomUUID(),
          status: values.status,
          changedAt: now,
          note: "Initial status",
        },
      ],
      tags: values.tags
        ? values.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
      notes: values.notes
        ? [
            {
              id: crypto.randomUUID(),
              content: values.notes,
              createdAt: now,
            },
          ]
        : [],
      createdAt: now,
      updatedAt: now,
    });

    router.push(`/jobs?id=${encodeURIComponent(id)}`);
    router.refresh();
  };

  return <JobSaveForm onSubmit={handleSubmit} />;
}
