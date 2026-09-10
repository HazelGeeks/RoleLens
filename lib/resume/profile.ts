import { z } from "zod";

const shortText = z.string().max(200);
const month = z.string().regex(/^(\d{4}-(0[1-9]|1[0-2]))?$/, "Use YYYY-MM");
const grade = z
  .string()
  .trim()
  .max(10)
  .regex(/^(?:\d{1,3}(?:\.\d{1,3})?)?$/, "Enter a non-negative number");
export const resumeEntrySchema = z
  .object({
    id: z.string().min(1).max(100),
    title: shortText,
    organization: shortText,
    location: shortText,
    startDate: month,
    endDate: month,
    details: z.string().max(4000),
  })
  .strict()
  .refine(
    (entry) =>
      !entry.startDate || !entry.endDate || entry.startDate <= entry.endDate,
    {
      message: "End date must be after start date",
      path: ["endDate"],
    },
  );
const entries = z
  .array(resumeEntrySchema)
  .max(30)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "Entries must have unique IDs",
  );
// Optional additions let existing JSON profiles load without rewriting legacy text.
export const educationEntrySchema = resumeEntrySchema
  .safeExtend({
    major: shortText.optional(),
    degree: shortText.optional(),
    degreeLevel: z
      .enum([
        "",
        "associate",
        "bachelor",
        "master",
        "doctorate",
        "diploma",
        "certificate",
        "high-school",
        "other",
      ])
      .optional(),
    majorType: z.enum(["", "single", "double", "minor"]).optional(),
    additionalMajor: shortText.optional(),
    gpa: grade.optional(),
    gpaScale: grade.optional(),
    academicStatus: z
      .enum([
        "",
        "graduated",
        "enrolled",
        "expected",
        "withdrawn",
        "transferred-out",
        "completed",
        "on-leave",
      ])
      .optional(),
    admissionType: z.enum(["", "regular", "transfer"]).optional(),
    dateDisplay: z
      .enum(["end-month", "end-year", "range", "hidden"])
      .optional(),
    showLocation: z.boolean().optional(),
    showDetails: z.boolean().optional(),
  })
  .refine(
    (entry) => {
      const gpa = entry.gpa ?? "";
      const scale = entry.gpaScale ?? "";
      if (!gpa && !scale) return true;
      return (
        Boolean(gpa && scale) &&
        Number(scale) > 0 &&
        Number(scale) <= 100 &&
        Number(gpa) <= Number(scale)
      );
    },
    {
      message:
        "Enter both GPA and its scale (above 0, up to 100). GPA cannot exceed the scale.",
      path: ["gpa"],
    },
  );
export type EducationEntry = z.infer<typeof educationEntrySchema>;
const educationEntries = z
  .array(educationEntrySchema)
  .max(30)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "Entries must have unique IDs",
  );
export const resumeProfileSchema = z
  .object({
    name: shortText,
    headline: shortText,
    email: z.union([z.literal(""), z.email().max(254)]),
    phone: shortText,
    location: shortText,
    website: shortText,
    summary: z.string().max(2000),
    skills: z.string().max(2000),
    experience: entries,
    projects: entries,
    education: educationEntries,
  })
  .strict();
export type ResumeProfile = z.infer<typeof resumeProfileSchema>;
export type ResumeEntry = z.infer<typeof resumeEntrySchema>;
export type ResumeSection = "experience" | "projects" | "education";
export const resumeSaveSchema = z
  .object({
    profile: resumeProfileSchema,
    version: z.number().int().min(0),
  })
  .strict();
export type SavedResume = {
  profile: ResumeProfile;
  version: number;
  updatedAt: string;
};
export function emptyResumeProfile(): ResumeProfile {
  return {
    name: "",
    headline: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    summary: "",
    skills: "",
    experience: [],
    projects: [],
    education: [],
  };
}
export function emptyResumeEntry(): ResumeEntry {
  return {
    id: crypto.randomUUID(),
    title: "",
    organization: "",
    location: "",
    startDate: "",
    endDate: "",
    details: "",
  };
}

export function emptyEducationEntry(): EducationEntry {
  return {
    ...emptyResumeEntry(),
    major: "",
    degree: "",
    academicStatus: "",
    admissionType: "",
    dateDisplay: "end-month",
    showLocation: false,
    showDetails: false,
  };
}
