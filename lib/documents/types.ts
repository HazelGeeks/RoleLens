import { z } from "zod";
import { coverLetterSchema } from "@/lib/cover-letter/profile";
import { resumeProfileSchema } from "@/lib/resume/profile";

export const MAX_DOCUMENTS = 5;
export const documentKindSchema = z.enum(["resume", "cover-letter"]);
export type DocumentKind = z.infer<typeof documentKindSchema>;
const identity = {
  id: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/),
  kind: documentKindSchema,
};
const metadata = {
  ...identity,
  title: z.string().trim().min(1, "Enter a document name").max(100),
  version: z.number().int().min(0),
};
export const documentSaveSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...metadata,
      kind: z.literal("resume"),
      data: resumeProfileSchema,
    })
    .strict(),
  z
    .object({
      ...metadata,
      kind: z.literal("cover-letter"),
      data: coverLetterSchema,
    })
    .strict(),
]);
export type DocumentSave = z.infer<typeof documentSaveSchema>;
export const savedDocumentSchema = z.discriminatedUnion("kind", [
  documentSaveSchema.options[0].extend({
    version: z.number().int().min(1),
    updatedAt: z.string(),
  }),
  documentSaveSchema.options[1].extend({
    version: z.number().int().min(1),
    updatedAt: z.string(),
  }),
]);
export type SavedDocument = z.infer<typeof savedDocumentSchema>;
export const documentDeleteSchema = z
  .object({ ...identity, version: z.number().int().min(1) })
  .strict();
export const documentsResponseSchema = z.object({
  documents: z.array(savedDocumentSchema).max(MAX_DOCUMENTS).optional(),
  document: savedDocumentSchema.optional(),
  deleted: z.boolean().optional(),
  message: z.string().optional(),
});
