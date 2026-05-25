import { z } from "zod";

const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

const optionalTrimmedText = z.preprocess((value) => {
  if (value == null) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().min(1).optional());

const optionalDate = z.preprocess((value) => {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") return value;
  return value.trim();
}, z.string().regex(dateOnlyRegex, "Date format must be YYYY-MM-DD").optional());

export const createGoalSchema = z.object({
  company: z.string().trim().min(2, "Company is required").max(120),
  targetRole: optionalTrimmedText,
  motivation: optionalTrimmedText,
});

export const createGoalFollowUpSchema = z.object({
  note: z.string().trim().min(2, "Follow-up note is required").max(2000),
  nextActionDate: optionalDate,
});

export type CreateGoalPayload = z.infer<typeof createGoalSchema>;
export type CreateGoalFollowUpPayload = z.infer<typeof createGoalFollowUpSchema>;
