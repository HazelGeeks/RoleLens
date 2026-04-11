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
export type JobStatus = "SAVED" | "REVIEWING" | "READY_TO_APPLY" | "APPLIED" | "INTERVIEW" | "REJECTED" | "CLOSED";

export type JobNote = {
  id: string;
  content: string;
  createdAt: string;
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
  tags: string[];
  notes: JobNote[];
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "rolelens.jobs.v1";

const sampleData: LocalJobPosting[] = [
  {
    id: "sample-1",
    source: "LINKEDIN",
    sourceUrl: "https://linkedin.com/jobs/view/123",
    company: "MapleStack",
    title: "Frontend Engineer",
    location: "Toronto, ON",
    remoteType: "HYBRID",
    employmentType: "FULL_TIME",
    salaryMin: 100000,
    salaryMax: 130000,
    salaryCurrency: "CAD",
    seniority: "Mid",
    workAuthorizationNote: "Open to candidates authorized in Canada",
    descriptionRaw: "Build and ship React + TypeScript product features in a modern frontend platform.",
    extractedSkills: ["React", "TypeScript", "Next.js"],
    fitScore: 84,
    fitBreakdown: { react: 90, typescript: 88, nextjs: 80, frontend: 85, experience: 78, workAuthorizationRisk: 75, overall: 84 },
    status: "READY_TO_APPLY",
    tags: ["frontend", "canada"],
    notes: [{ id: "n1", content: "Strong fit with current stack.", createdAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function getJobsFromStorage(): LocalJobPosting[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleData));
    return sampleData;
  }

  try {
    return JSON.parse(raw) as LocalJobPosting[];
  } catch {
    return [];
  }
}

export function saveJobsToStorage(jobs: LocalJobPosting[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export function upsertJob(job: LocalJobPosting) {
  const jobs = getJobsFromStorage();
  const idx = jobs.findIndex((item) => item.id === job.id);
  if (idx === -1) jobs.unshift(job);
  else jobs[idx] = job;
  saveJobsToStorage(jobs);
}

export function addNote(jobId: string, content: string) {
  const jobs = getJobsFromStorage();
  const target = jobs.find((job) => job.id === jobId);
  if (!target) return;

  target.notes.unshift({ id: crypto.randomUUID(), content, createdAt: new Date().toISOString() });
  target.updatedAt = new Date().toISOString();
  saveJobsToStorage(jobs);
}

export function updateStatus(jobId: string, status: JobStatus) {
  const jobs = getJobsFromStorage();
  const target = jobs.find((job) => job.id === jobId);
  if (!target) return;

  target.status = status;
  target.updatedAt = new Date().toISOString();
  saveJobsToStorage(jobs);
}

export function getJobById(jobId: string) {
  return getJobsFromStorage().find((job) => job.id === jobId) ?? null;
}
