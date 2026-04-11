import { type JobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type JobListFilters = {
  q?: string;
  status?: JobStatus | "ALL";
  source?: "LINKEDIN" | "INDEED" | "COMPANY_SITE" | "MANUAL" | "ALL";
  remoteType?: "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN" | "ALL";
};

export async function listJobs(filters: JobListFilters) {
  const q = filters.q?.trim();

  return prisma.jobPosting.findMany({
    where: {
      ...(filters.status && filters.status !== "ALL" ? { status: filters.status } : {}),
      ...(filters.source && filters.source !== "ALL" ? { source: filters.source } : {}),
      ...(filters.remoteType && filters.remoteType !== "ALL" ? { remoteType: filters.remoteType } : {}),
      ...(q
        ? {
            OR: [
              { company: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
              { location: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
      notes: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function getJobById(id: string) {
  return prisma.jobPosting.findUnique({
    where: { id },
    include: {
      notes: {
        orderBy: {
          createdAt: "desc",
        },
      },
      tags: {
        include: {
          tag: true,
        },
      },
    },
  });
}

export async function getDashboardStats() {
  const jobs = await prisma.jobPosting.findMany();

  const statusCounts = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] ?? 0) + 1;
    return acc;
  }, {});

  const sourceCounts = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.source] = (acc[job.source] ?? 0) + 1;
    return acc;
  }, {});

  const remoteCounts = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.remoteType] = (acc[job.remoteType] ?? 0) + 1;
    return acc;
  }, {});

  const seniorityCounts = jobs.reduce<Record<string, number>>((acc, job) => {
    const key = job.seniority || "Unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const skillCounts = jobs.reduce<Record<string, number>>((acc, job) => {
    for (const skill of job.extractedSkills) {
      const key = skill.toLowerCase();
      acc[key] = (acc[key] ?? 0) + 1;
    }
    return acc;
  }, {});

  const topSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const focusSkills = ["react", "typescript", "next.js"].map((skill) => ({
    name: skill,
    count: skillCounts[skill] ?? 0,
  }));

  const avgFitScore =
    jobs.filter((job) => typeof job.fitScore === "number").reduce((sum, job) => sum + (job.fitScore ?? 0), 0) /
    (jobs.filter((job) => typeof job.fitScore === "number").length || 1);

  return {
    totalJobs: jobs.length,
    avgFitScore: Math.round(avgFitScore),
    statusCounts,
    sourceCounts,
    remoteCounts,
    seniorityCounts,
    topSkills,
    focusSkills,
  };
}
