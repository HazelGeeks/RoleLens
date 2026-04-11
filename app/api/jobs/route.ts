import { NextResponse } from "next/server";
import { EmploymentType, JobSource, JobStatus, RemoteType } from "@prisma/client";
import { calculateFitScore, extractSkills } from "@/lib/fit-score";
import { prisma } from "@/lib/prisma";
import { createJobSchema } from "@/lib/validators";

function parseTags(input?: string) {
  if (!input) return [];
  return [...new Set(input.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createJobSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
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

    const linkedTags = await Promise.all(
      tags.map(async (name) => {
        const tag = await prisma.jobTag.upsert({
          where: { name },
          update: {},
          create: { name },
        });
        return { tag: { connect: { id: tag.id } } };
      }),
    );

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
              create: [{ content: input.notes }],
            }
          : undefined,
        tags: linkedTags.length ? { create: linkedTags } : undefined,
      },
    });

    return NextResponse.json({ id: posting.id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create posting" }, { status: 500 });
  }
}
