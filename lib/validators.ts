import { z } from "zod";
import {
  currencyOptions,
  employmentTypeOptions,
  remoteTypeOptions,
  sourceOptions,
  statusOptions,
} from "@/lib/constants";

export const createJobSchema = z
  .object({
    source: z.enum(sourceOptions),
    sourceUrl: z.string().trim().url().optional().or(z.literal("")),
    company: z.string().trim().min(2, "Company is required"),
    title: z.string().trim().min(2, "Title is required"),
    location: z.string().trim().optional(),
    remoteType: z.enum(remoteTypeOptions),
    employmentType: z.enum(employmentTypeOptions).optional().or(z.literal("")),
    salaryMin: z.preprocess(
      (v) => (v === "" || v === null ? undefined : v),
      z.coerce.number().int().nonnegative().optional(),
    ),
    salaryMax: z.preprocess(
      (v) => (v === "" || v === null ? undefined : v),
      z.coerce.number().int().nonnegative().optional(),
    ),
    salaryCurrency: z.enum(currencyOptions).optional(),
    seniority: z.string().trim().optional(),
    descriptionRaw: z.string().trim().min(30, "Paste enough description text"),
    status: z.enum(statusOptions),
    nextAction: z
      .string()
      .trim()
      .max(240, "Keep next action under 240 characters")
      .optional(),
    followUpDate: z
      .union([
        z.literal(""),
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD date format"),
      ])
      .optional(),
    notes: z.string().trim().optional(),
    tags: z.string().trim().optional(),
  })
  .refine(
    (values) => {
      if (values.salaryMin == null || values.salaryMax == null) return true;
      return values.salaryMin <= values.salaryMax;
    },
    {
      message: "Salary min must be less than or equal to salary max",
      path: ["salaryMax"],
    },
  );

export type CreateJobInput = z.input<typeof createJobSchema>;
export type CreateJobParsed = z.output<typeof createJobSchema>;

export const updateStatusSchema = z.object({
  status: z.enum(statusOptions),
});

export const addNoteSchema = z.object({
  content: z.string().trim().min(2).max(1000),
});
