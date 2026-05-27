import type { JobSource } from "@/lib/local-jobs";
import type { LocalJobPosting } from "@/lib/local-jobs";
import { prettifyEnum } from "@/lib/presentation";

export function countMapToArray(input: Record<string, number>) {
  return Object.entries(input).map(([name, value]) => ({
    name: prettifyEnum(name),
    value,
  }));
}

export function formatUpdatedAt(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Unknown";
  return new Date(timestamp).toLocaleDateString();
}

export function filterSavedJobs(
  jobs: LocalJobPosting[],
  searchTerm: string,
  sourceFilter: JobSource | "ALL",
) {
  const keyword = searchTerm.trim().toLowerCase();

  return jobs.filter((job) => {
    const sourceMatched = sourceFilter === "ALL" || job.source === sourceFilter;
    if (!sourceMatched) return false;

    if (!keyword) return true;
    const target = `${job.title} ${job.company} ${job.location ?? ""}`.toLowerCase();
    return target.includes(keyword);
  });
}

export function calculateDashboardStats(savedJobs: LocalJobPosting[]) {
  const statusCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const remoteCounts: Record<string, number> = {};
  const seniorityCounts: Record<string, number> = {};
  const skillCounts: Record<string, number> = {};

  let fitScoreTotal = 0;
  let fitScoreCount = 0;
  let dueFollowUps = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const job of savedJobs) {
    statusCounts[job.status] = (statusCounts[job.status] ?? 0) + 1;
    sourceCounts[job.source] = (sourceCounts[job.source] ?? 0) + 1;
    remoteCounts[job.remoteType] = (remoteCounts[job.remoteType] ?? 0) + 1;

    const seniorityKey = job.seniority || "Unknown";
    seniorityCounts[seniorityKey] = (seniorityCounts[seniorityKey] ?? 0) + 1;

    for (const skill of job.extractedSkills) {
      const key = skill.toLowerCase();
      skillCounts[key] = (skillCounts[key] ?? 0) + 1;
    }

    if (typeof job.fitScore === "number") {
      fitScoreTotal += job.fitScore;
      fitScoreCount += 1;
    }

    if (
      job.followUpDate &&
      job.followUpDate <= today &&
      job.status !== "ARCHIVE"
    ) {
      dueFollowUps += 1;
    }
  }

  const topSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const focusSkills = ["react", "typescript", "next.js"].map((skill) => ({
    name: skill,
    count: skillCounts[skill] ?? 0,
  }));

  const avgFitScore = fitScoreCount > 0 ? fitScoreTotal / fitScoreCount : 0;
  const activePipeline = (statusCounts.INTEREST ?? 0) + (statusCounts.SUBMITTED ?? 0);
  const sourceVariety = Object.keys(sourceCounts).length;

  return {
    totalJobs: savedJobs.length,
    avgFitScore: Math.round(avgFitScore),
    dueFollowUps,
    activePipeline,
    sourceVariety,
    statusCounts,
    sourceCounts,
    remoteCounts,
    seniorityCounts,
    topSkills,
    focusSkills,
  };
}
