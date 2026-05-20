import type {
  EmploymentType,
  JobSource,
  JobStatus,
  JobStatusHistoryItem,
  RemoteType,
} from "@/lib/local-jobs";

export type PersistentJobMeta = {
  source: JobSource;
  remoteType: RemoteType;
  employmentType?: EmploymentType;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  seniority?: string;
  workAuthorizationNote?: string;
  descriptionRaw?: string;
  extractedSkills: string[];
  fitScore: number;
  fitBreakdown?: Record<string, number>;
  statusHistory?: JobStatusHistoryItem[];
};

export type PersistentJobNote = {
  id: string;
  content: string;
  createdAt: string;
  actor: string;
};

export type PersistentJob = {
  id: string;
  userId: string;
  company: string;
  title: string;
  location?: string;
  sourceUrl?: string;
  status: JobStatus;
  nextAction?: string;
  followUpDate?: string;
  tags: string[];
  notes: PersistentJobNote[];
  createdAt: string;
  updatedAt: string;
  updatedByDevice: string;
  version: number;
  meta?: PersistentJobMeta;
};

export type CreatePersistentJobInput = {
  company: string;
  title: string;
  location?: string;
  sourceUrl?: string;
  status?: JobStatus;
  nextAction?: string;
  followUpDate?: string;
  tags?: string[];
  initialNote?: string;
  clientRequestId?: string;
  meta?: PersistentJobMeta;
};

export type UpdatePersistentJobChanges = {
  company?: string;
  title?: string;
  location?: string;
  sourceUrl?: string;
  nextAction?: string;
  followUpDate?: string;
  tags?: string[];
  meta?: PersistentJobMeta;
};

export type PersistentJobPatch =
  | {
      op: "update";
      expectedVersion?: number;
      changes: UpdatePersistentJobChanges;
    }
  | {
      op: "status";
      expectedVersion?: number;
      status: JobStatus;
      note?: string;
    }
  | {
      op: "note";
      expectedVersion?: number;
      content: string;
    };

export type PatchPersistentJobResult =
  | {
      ok: true;
      job: PersistentJob;
    }
  | {
      ok: false;
      reason: "NOT_FOUND";
    }
  | {
      ok: false;
      reason: "VERSION_CONFLICT";
      current: PersistentJob;
    };
