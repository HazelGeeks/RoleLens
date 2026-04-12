import type { JobStatus } from "@/lib/local-jobs";

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
};

export type UpdatePersistentJobChanges = {
  company?: string;
  title?: string;
  location?: string;
  sourceUrl?: string;
  nextAction?: string;
  followUpDate?: string;
  tags?: string[];
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
