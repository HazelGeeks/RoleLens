import { z } from "zod";
import {
  currencyOptions,
  employmentTypeOptions,
  remoteTypeOptions,
  sourceOptions,
  statusOptions,
} from "@/lib/constants";

export const createJobSchema = z.object({
  source: z.enum(sourceOptions),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  company: z.string().trim().min(2, "Company is required"),
  title: z.string().trim().min(2, "Title is required"),
  location: z.string().trim().optional(),
  remoteType: z.enum(remoteTypeOptions),
  employmentType: z.enum(employmentTypeOptions).optional().or(z.literal("")),
  salaryMin: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().nonnegative().optional()),
  salaryMax: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().nonnegative().optional()),
  salaryCurrency: z.enum(currencyOptions).optional(),
  seniority: z.string().trim().optional(),
  workAuthorizationNote: z.string().trim().optional(),
  descriptionRaw: z.string().trim().min(30, "Paste enough description text"),
  status: z.enum(statusOptions),
  notes: z.string().trim().optional(),
  tags: z.string().trim().optional(),
});

export type CreateJobInput = z.input<typeof createJobSchema>;
export type CreateJobParsed = z.output<typeof createJobSchema>;

export const updateStatusSchema = z.object({
  status: z.enum(statusOptions),
});

export const addNoteSchema = z.object({
  content: z.string().trim().min(2).max(1000),
});
