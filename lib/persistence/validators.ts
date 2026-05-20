import { z } from "zod";
import {
  employmentTypeOptions,
  remoteTypeOptions,
  sourceOptions,
  statusOptions,
} from "@/lib/constants";

const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

const optionalTrimmedText = z.preprocess((value) => {
  if (value == null) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().min(1).optional());

const optionalUrl = z.preprocess((value) => {
  if (value == null) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().url().optional());

const optionalDate = z.preprocess((value) => {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") return value;
  return value.trim();
}, z.string().regex(dateOnlyRegex, "Date format must be YYYY-MM-DD").optional());

const tagsSchema = z.array(z.string().trim().min(1).max(32)).max(20).optional();

const statusHistoryItemSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(statusOptions),
  changedAt: z.string().datetime({ offset: true }),
  note: z.string().trim().min(1).optional(),
});

const fitBreakdownSchema = z.record(z.string(), z.number().finite()).optional();

const persistentMetaSchema = z.object({
  source: z.enum(sourceOptions),
  remoteType: z.enum(remoteTypeOptions),
  employmentType: z.enum(employmentTypeOptions).optional(),
  salaryMin: z.number().finite().optional(),
  salaryMax: z.number().finite().optional(),
  salaryCurrency: z.string().trim().min(1).max(12).optional(),
  seniority: z.string().trim().min(1).max(120).optional(),
  workAuthorizationNote: z.string().trim().min(1).max(240).optional(),
  descriptionRaw: z.string().trim().min(1).optional(),
  extractedSkills: z.array(z.string().trim().min(1).max(80)).max(200),
  fitScore: z.number().finite(),
  fitBreakdown: fitBreakdownSchema,
  statusHistory: z.array(statusHistoryItemSchema).max(200).optional(),
});

export const createPersistentJobSchema = z.object({
  company: z.string().trim().min(2, "Company is required"),
  title: z.string().trim().min(2, "Title is required"),
  location: optionalTrimmedText,
  sourceUrl: optionalUrl,
  status: z.enum(statusOptions).optional(),
  nextAction: z.string().trim().min(2).max(240).optional(),
  followUpDate: optionalDate,
  tags: tagsSchema,
  initialNote: z.string().trim().min(2).max(1000).optional(),
  clientRequestId: z.string().trim().min(6).max(128).optional(),
  meta: persistentMetaSchema.optional(),
});

const updateChangesSchema = z
  .object({
    company: z.string().trim().min(2).optional(),
    title: z.string().trim().min(2).optional(),
    location: optionalTrimmedText,
    sourceUrl: optionalUrl,
    nextAction: z.string().trim().min(2).max(240).optional(),
    followUpDate: optionalDate,
    tags: tagsSchema,
    meta: persistentMetaSchema.optional(),
  })
  .refine(
    (value) =>
      Object.values(value).some((entry) => {
        if (Array.isArray(entry)) return entry.length >= 0;
        return entry !== undefined;
      }),
    {
      message: "At least one field must be provided in changes",
    },
  );

const expectedVersionSchema = z.number().int().positive().optional();

export const patchPersistentJobSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("update"),
    expectedVersion: expectedVersionSchema,
    changes: updateChangesSchema,
  }),
  z.object({
    op: z.literal("status"),
    expectedVersion: expectedVersionSchema,
    status: z.enum(statusOptions),
    note: z.string().trim().min(2).max(1000).optional(),
  }),
  z.object({
    op: z.literal("note"),
    expectedVersion: expectedVersionSchema,
    content: z.string().trim().min(2).max(1000),
  }),
]);

export type CreatePersistentJobPayload = z.infer<
  typeof createPersistentJobSchema
>;
export type PatchPersistentJobPayload = z.infer<
  typeof patchPersistentJobSchema
>;
