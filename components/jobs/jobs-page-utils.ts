import type { JobRow } from "@/components/jobs/jobs-table";
import type { JobsSortOption } from "@/lib/jobs-sort";
import type { FeedImportDiagnostics } from "@/lib/feed-types";
import type { LocalJobPosting } from "@/lib/local-jobs";
import type { JobSource, JobStatus, RemoteType } from "@/lib/local-jobs";

export const EMPTY_DIAGNOSTICS: FeedImportDiagnostics = {
  ats: {
    greenhouseBoardCount: 0,
    leverCompanyCount: 0,
    ashbyOrganizationCount: 0,
    smartRecruitersCompanyCount: 0,
    configuredSourceCount: 0,
  },
  rss: {
    linkedinConfigured: false,
    indeedConfigured: false,
    thirdConfigured: false,
    configuredSourceCount: 0,
  },
  python: {
    scrapedFeedConfigured: false,
    configuredSourceCount: 0,
  },
  sourceCount: 0,
};

export type JobsViewFilter = "ALL" | "RESUME" | "INTERVIEW";

const viewStatusMap: Record<Exclude<JobsViewFilter, "ALL">, JobStatus[]> = {
  RESUME: ["NONE", "NEW", "SAVE", "INTEREST"],
  INTERVIEW: ["SUBMITTED"],
};

type RowsFilterInput = {
  q: string;
  status: JobStatus | "ALL";
  source: JobSource | "ALL";
  remoteType: RemoteType | "ALL";
  minFit: string;
  requiredSkill: string;
  sortBy: JobsSortOption;
};

function getLocationPriority(location: string | null) {
  if (!location) return 0;
  const normalized = location.toLowerCase();

  if (normalized.includes("vancouver") || normalized.includes("밴쿠버")) {
    return 3;
  }

  if (normalized.includes("canada") || normalized.includes("캐나다")) {
    return 2;
  }

  return 0;
}

function compareByFitAndCreated(left: JobRow, right: JobRow) {
  const fitDiff = (right.fitScore ?? -1) - (left.fitScore ?? -1);
  if (fitDiff !== 0) return fitDiff;
  return right.createdAt.localeCompare(left.createdAt);
}

function compareByLocationFitAndCreated(left: JobRow, right: JobRow) {
  const locationPriorityDiff =
    getLocationPriority(right.location) - getLocationPriority(left.location);
  if (locationPriorityDiff !== 0) return locationPriorityDiff;
  return compareByFitAndCreated(left, right);
}

function toJobRow(job: LocalJobPosting): JobRow {
  return {
    id: job.id,
    company: job.company,
    title: job.title,
    location: job.location || null,
    remoteType: job.remoteType,
    source: job.source,
    status: job.status,
    fitScore: job.fitScore,
    salaryMin: job.salaryMin || null,
    salaryMax: job.salaryMax || null,
    salaryCurrency: job.salaryCurrency || null,
    extractedSkills: job.extractedSkills,
    nextAction: job.nextAction || null,
    followUpDate: job.followUpDate || null,
    publishedAt: job.publishedAt || job.createdAt,
    createdAt: job.createdAt,
  };
}

export function parseJobsViewFilter(value: string | null): JobsViewFilter {
  if (value === "resume") return "RESUME";
  if (value === "interview") return "INTERVIEW";
  return "ALL";
}

export function isJobInView(jobStatus: JobStatus, view: JobsViewFilter) {
  if (view === "ALL") return true;
  return viewStatusMap[view].includes(jobStatus);
}

export function buildRows(jobs: LocalJobPosting[], filters: RowsFilterInput) {
  const normalizedSkill = filters.requiredSkill.trim().toLowerCase();
  const minFitValue = filters.minFit ? Number(filters.minFit) : null;

  return jobs
    .filter((job) => (filters.status === "ALL" ? true : job.status === filters.status))
    .filter((job) => (filters.source === "ALL" ? true : job.source === filters.source))
    .filter((job) =>
      filters.remoteType === "ALL" ? true : job.remoteType === filters.remoteType,
    )
    .filter((job) =>
      minFitValue == null || Number.isNaN(minFitValue)
        ? true
        : job.fitScore >= minFitValue,
    )
    .filter((job) =>
      !normalizedSkill
        ? true
        : job.extractedSkills.some((skill) =>
            skill.toLowerCase().includes(normalizedSkill),
          ),
    )
    .filter((job) => {
      if (!filters.q.trim()) return true;
      const value = filters.q.toLowerCase();
      return [
        job.title,
        job.company,
        job.location || "",
        job.extractedSkills.join(" "),
        job.nextAction || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(value);
    })
    .map(toJobRow)
    .sort((left, right) => {
      if (filters.sortBy === "CREATED_DESC") {
        return right.createdAt.localeCompare(left.createdAt);
      }

      if (filters.sortBy === "FIT_DESC") {
        return compareByFitAndCreated(left, right);
      }

      if (filters.sortBy === "LOCATION_PRIORITY") {
        return compareByLocationFitAndCreated(left, right);
      }

      if (filters.source === "ALL") {
        return right.createdAt.localeCompare(left.createdAt);
      }

      return compareByLocationFitAndCreated(left, right);
    });
}

export function buildSourceCounts(jobs: LocalJobPosting[]) {
  return jobs.reduce<Record<JobSource, number>>(
    (counts, job) => ({ ...counts, [job.source]: counts[job.source] + 1 }),
    { LINKEDIN: 0, INDEED: 0, SARAMIN: 0, JOBKOREA: 0, MANUAL: 0 },
  );
}

export function buildDueFollowUps(jobs: LocalJobPosting[]) {
  const today = new Date().toISOString().slice(0, 10);
  return jobs
    .filter((job) => !!job.followUpDate && job.followUpDate <= today)
    .filter((job) => job.status !== "ARCHIVE")
    .sort((a, b) => (a.followUpDate || "").localeCompare(b.followUpDate || ""))
    .slice(0, 6);
}
