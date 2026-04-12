import { z } from "zod";
import { statusOptions } from "@/lib/constants";

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
