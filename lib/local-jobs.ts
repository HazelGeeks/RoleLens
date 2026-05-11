import { statusOptions } from "@/lib/constants";

export type JobSource = "LINKEDIN" | "INDEED" | "COMPANY_SITE" | "MANUAL";
export type RemoteType = "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN";
export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "TEMPORARY"
  | "INTERNSHIP"
  | "FREELANCE"
  | "OTHER";
export type JobStatus = (typeof statusOptions)[number];

export type JobNote = {
  id: string;
  content: string;
  createdAt: string;
};

export type JobStatusHistoryItem = {
  id: string;
  status: JobStatus;
  changedAt: string;
  note?: string;
};

export type LocalJobPosting = {
  id: string;
  source: JobSource;
  sourceUrl?: string;
  company: string;
  title: string;
  location?: string;
  remoteType: RemoteType;
  employmentType?: EmploymentType;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  seniority?: string;
  workAuthorizationNote?: string;
  descriptionRaw: string;
  extractedSkills: string[];
  fitScore: number;
  fitBreakdown?: Record<string, number>;
  status: JobStatus;
  nextAction?: string;
  followUpDate?: string;
  lastStatusChangedAt?: string;
  statusHistory: JobStatusHistoryItem[];
  tags: string[];
  notes: JobNote[];
  createdAt: string;
  updatedAt: string;
};

export const LOCAL_JOBS_STORAGE_KEY = "rolelens.jobs.v1";
export const LOCAL_JOBS_UPDATED_EVENT = "rolelens:jobs-updated";

export type LocalJobsUpdatedReason =
  | "sync"
  | "upsert"
  | "note"
  | "status"
  | "follow-up";

export type LocalJobsUpdatedDetail = {
  reason: LocalJobsUpdatedReason;
  totalJobs: number;
  updatedAt: string;
};

const sourceValues = ["LINKEDIN", "INDEED", "COMPANY_SITE", "MANUAL"] as const;
const remoteValues = ["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"] as const;
const employmentValues = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "TEMPORARY",
  "INTERNSHIP",
  "FREELANCE",
  "OTHER",
] as const;
const statusValues = statusOptions;
const legacyStatusMap: Record<string, JobStatus> = {
  INTERVIEW: "INTERVIEWING",
};

function isJobSource(value: unknown): value is JobSource {
  return typeof value === "string" && sourceValues.includes(value as JobSource);
}

function isRemoteType(value: unknown): value is RemoteType {
  return (
    typeof value === "string" && remoteValues.includes(value as RemoteType)
  );
}

function isEmploymentType(value: unknown): value is EmploymentType {
  return (
    typeof value === "string" &&
    employmentValues.includes(value as EmploymentType)
  );
}

function normalizeJobStatus(value: unknown): JobStatus | undefined {
  if (typeof value !== "string") return undefined;
  if (statusValues.includes(value as JobStatus)) return value as JobStatus;
  return legacyStatusMap[value];
}

function sanitizeDateOnly(value: string | undefined) {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function dispatchJobsUpdated(
  reason: LocalJobsUpdatedReason,
  totalJobs: number,
) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<LocalJobsUpdatedDetail>(LOCAL_JOBS_UPDATED_EVENT, {
      detail: {
        reason,
        totalJobs,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}

function normalizeJob(raw: Partial<LocalJobPosting>): LocalJobPosting {
  const now = new Date().toISOString();
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : now;
  const status = normalizeJobStatus(raw.status) ?? "SAVED";
  const fallbackHistory: JobStatusHistoryItem[] = [
    {
      id: crypto.randomUUID(),
      status,
      changedAt: createdAt,
      note: "Initial status",
    },
  ];

  const statusHistory = Array.isArray(raw.statusHistory)
    ? raw.statusHistory
        .map((item): JobStatusHistoryItem | null => {
          if (!item || typeof item !== "object") return null;
          const statusValue = normalizeJobStatus(
            (item as { status?: unknown }).status,
          );

          if (
            !statusValue ||
            typeof (item as { changedAt?: unknown }).changedAt !== "string" ||
            typeof (item as { id?: unknown }).id !== "string"
          ) {
            return null;
          }

          const noteValue =
            typeof (item as { note?: unknown }).note === "string"
              ? (item as { note: string }).note
              : undefined;

          return {
            id: (item as { id: string }).id,
            status: statusValue,
            changedAt: (item as { changedAt: string }).changedAt,
            ...(noteValue ? { note: noteValue } : {}),
          };
        })
        .filter((item): item is JobStatusHistoryItem => item != null)
    : fallbackHistory;

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    source: isJobSource(raw.source) ? raw.source : "MANUAL",
    sourceUrl:
      typeof raw.sourceUrl === "string" && raw.sourceUrl
        ? raw.sourceUrl
        : undefined,
    company: typeof raw.company === "string" ? raw.company : "Unknown Company",
    title: typeof raw.title === "string" ? raw.title : "Unknown Role",
    location:
      typeof raw.location === "string" && raw.location
        ? raw.location
        : undefined,
    remoteType: isRemoteType(raw.remoteType) ? raw.remoteType : "UNKNOWN",
    employmentType: isEmploymentType(raw.employmentType)
      ? raw.employmentType
      : undefined,
    salaryMin: typeof raw.salaryMin === "number" ? raw.salaryMin : undefined,
    salaryMax: typeof raw.salaryMax === "number" ? raw.salaryMax : undefined,
    salaryCurrency:
      typeof raw.salaryCurrency === "string" && raw.salaryCurrency
        ? raw.salaryCurrency
        : undefined,
    seniority:
      typeof raw.seniority === "string" && raw.seniority
        ? raw.seniority
        : undefined,
    workAuthorizationNote:
      typeof raw.workAuthorizationNote === "string" && raw.workAuthorizationNote
        ? raw.workAuthorizationNote
        : undefined,
    descriptionRaw:
      typeof raw.descriptionRaw === "string" ? raw.descriptionRaw : "",
    extractedSkills: Array.isArray(raw.extractedSkills)
      ? raw.extractedSkills.filter(
          (skill): skill is string => typeof skill === "string",
        )
      : [],
    fitScore: typeof raw.fitScore === "number" ? raw.fitScore : 0,
    fitBreakdown: raw.fitBreakdown,
    status,
    nextAction:
      typeof raw.nextAction === "string" && raw.nextAction
        ? raw.nextAction
        : undefined,
    followUpDate: sanitizeDateOnly(raw.followUpDate),
    lastStatusChangedAt:
      typeof raw.lastStatusChangedAt === "string"
        ? raw.lastStatusChangedAt
        : statusHistory[0]?.changedAt,
    statusHistory: statusHistory.length > 0 ? statusHistory : fallbackHistory,
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    notes: Array.isArray(raw.notes)
      ? raw.notes.filter(
          (note): note is JobNote =>
            !!note &&
            typeof note.id === "string" &&
            typeof note.content === "string",
        )
      : [],
    createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
}

export function getJobsFromStorage(): LocalJobPosting[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(LOCAL_JOBS_STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(LOCAL_JOBS_STORAGE_KEY, JSON.stringify([]));
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      window.localStorage.setItem(LOCAL_JOBS_STORAGE_KEY, JSON.stringify([]));
      return [];
    }

    const normalized = parsed.map((item) =>
      normalizeJob((item ?? {}) as Partial<LocalJobPosting>),
    );
    window.localStorage.setItem(
      LOCAL_JOBS_STORAGE_KEY,
      JSON.stringify(normalized),
    );
    return normalized;
  } catch {
    window.localStorage.setItem(LOCAL_JOBS_STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

export function saveJobsToStorage(
  jobs: LocalJobPosting[],
  reason: LocalJobsUpdatedReason = "sync",
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_JOBS_STORAGE_KEY, JSON.stringify(jobs));
  dispatchJobsUpdated(reason, jobs.length);
}

export function upsertJob(job: LocalJobPosting) {
  const jobs = getJobsFromStorage();
  const idx = jobs.findIndex((item) => item.id === job.id);
  const nextJob = normalizeJob(job);
  if (idx === -1) jobs.unshift(nextJob);
  else
    jobs[idx] = normalizeJob({
      ...jobs[idx],
      ...nextJob,
      updatedAt: new Date().toISOString(),
    });
  saveJobsToStorage(jobs, "upsert");
}

export function addNote(jobId: string, content: string) {
  const jobs = getJobsFromStorage();
  const target = jobs.find((job) => job.id === jobId);
  if (!target) return;

  target.notes.unshift({
    id: crypto.randomUUID(),
    content,
    createdAt: new Date().toISOString(),
  });
  target.updatedAt = new Date().toISOString();
  saveJobsToStorage(jobs, "note");
}

export function updateStatus(jobId: string, status: JobStatus) {
  const jobs = getJobsFromStorage();
  const target = jobs.find((job) => job.id === jobId);
  if (!target) return;

  const now = new Date().toISOString();
  const didChange = target.status !== status;
  target.status = status;
  target.lastStatusChangedAt = now;
  target.updatedAt = now;

  if (didChange) {
    target.statusHistory.unshift({
      id: crypto.randomUUID(),
      status,
      changedAt: now,
    });
  }

  saveJobsToStorage(jobs, "status");
}

export function updateFollowUp(
  jobId: string,
  payload: { nextAction?: string; followUpDate?: string },
) {
  const jobs = getJobsFromStorage();
  const target = jobs.find((job) => job.id === jobId);
  if (!target) return;

  target.nextAction = payload.nextAction?.trim() || undefined;
  target.followUpDate = sanitizeDateOnly(payload.followUpDate?.trim());
  target.updatedAt = new Date().toISOString();
  saveJobsToStorage(jobs, "follow-up");
}

export function getDueFollowUps(referenceDate = new Date()) {
  const reference = referenceDate.toISOString().slice(0, 10);
  return getJobsFromStorage().filter((job) => {
    if (!job.followUpDate) return false;
    if (
      job.status === "REJECTED" ||
      job.status === "WITHDRAWN" ||
      job.status === "CLOSED"
    ) {
      return false;
    }
    return job.followUpDate <= reference;
  });
}

export function getJobById(jobId: string) {
  return getJobsFromStorage().find((job) => job.id === jobId) ?? null;
}
