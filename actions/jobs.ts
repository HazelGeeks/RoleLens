"use server";

import { revalidatePath } from "next/cache";
import { JobSource, JobStatus, RemoteType, EmploymentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addNoteSchema, createJobSchema, updateStatusSchema } from "@/lib/validators";
import { calculateFitScore, extractSkills } from "@/lib/fit-score";

function parseTags(input?: string) {
  if (!input) return [];
  return [...new Set(input.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export async function createJobPostingAction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());

  const parsed = createJobSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid form input");
  }

  const input = parsed.data;
  const fitBreakdown = calculateFitScore({
    title: input.title,
    descriptionRaw: input.descriptionRaw,
    seniority: input.seniority,
    workAuthorizationNote: input.workAuthorizationNote,
  });

  const extractedSkills = Array.from(new Set(extractSkills(input.descriptionRaw)));
  const tags = parseTags(input.tags);

  const posting = await prisma.jobPosting.create({
    data: {
      source: input.source as JobSource,
      sourceUrl: input.sourceUrl || null,
      company: input.company,
      title: input.title,
      location: input.location || null,
      remoteType: input.remoteType as RemoteType,
      employmentType: input.employmentType ? (input.employmentType as EmploymentType) : null,
      salaryMin: input.salaryMin,
      salaryMax: input.salaryMax,
      salaryCurrency: input.salaryCurrency ?? "CAD",
      seniority: input.seniority || null,
      workAuthorizationNote: input.workAuthorizationNote || null,
      descriptionRaw: input.descriptionRaw,
      extractedSkills,
      fitScore: fitBreakdown.overall,
      fitBreakdown,
      status: input.status as JobStatus,
      parserName: "manual",
      parserVersion: "1.0",
      notes: input.notes
        ? {
            create: [
              {
                content: input.notes,
              },
            ],
          }
        : undefined,
      tags: tags.length
        ? {
            create: await Promise.all(
              tags.map(async (name) => {
                const tag = await prisma.jobTag.upsert({
                  where: { name },
                  update: {},
                  create: { name },
                });

                return {
                  tag: {
                    connect: { id: tag.id },
                  },
                };
              }),
            ),
          }
        : undefined,
    },
  });

  revalidatePath("/");
  revalidatePath("/dashboard");
  return posting.id;
}

export async function updateJobStatusAction(jobId: string, formData: FormData) {
  const parsed = updateStatusSchema.safeParse({ status: formData.get("status") });
  if (!parsed.success) {
    throw new Error("Invalid status update");
  }

  await prisma.jobPosting.update({
    where: { id: jobId },
    data: { status: parsed.data.status as JobStatus },
  });

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath(`/jobs/${jobId}`);
}

export async function addJobNoteAction(jobId: string, formData: FormData) {
  const parsed = addNoteSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) {
    throw new Error("Invalid note");
  }

  await prisma.jobNote.create({
    data: {
      jobPostingId: jobId,
      content: parsed.data.content,
    },
  });

  revalidatePath(`/jobs/${jobId}`);
}
