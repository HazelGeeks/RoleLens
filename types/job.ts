import type { JobPosting, JobNote, JobTag, JobPostingTag } from "@prisma/client";

export type JobWithRelations = JobPosting & {
  notes: JobNote[];
  tags: (JobPostingTag & {
    tag: JobTag;
  })[];
};
