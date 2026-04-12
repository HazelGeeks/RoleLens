import type { EmploymentType, JobSource, RemoteType } from "@/lib/local-jobs";

export type ImportedFeedJob = {
  externalId: string;
  source: JobSource;
  sourceLabel: string;
  sourceUrl?: string;
  company: string;
  title: string;
  location?: string;
  remoteType?: RemoteType;
  employmentType?: EmploymentType;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  seniority?: string;
  workAuthorizationNote?: string;
  descriptionRaw: string;
  extractedSkills: string[];
  tags: string[];
  publishedAt?: string;
};

export type FeedImportError = {
  source: string;
  message: string;
};

export type FeedSourceResult = {
  source: string;
  ok: boolean;
  importedJobs: number;
  message?: string;
};

export type FeedImportSnapshot = {
  generatedAt: string;
  sourceCount: number;
  jobs: ImportedFeedJob[];
  errors: FeedImportError[];
  sourceResults: FeedSourceResult[];
};
