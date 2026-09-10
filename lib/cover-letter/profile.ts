import { z } from "zod";

const shortText = z.string().max(200);
export const coverLetterSchema = z
  .object({
    name: shortText,
    email: z.union([z.literal(""), z.email().max(254)]),
    phone: shortText,
    location: shortText,
    website: shortText,
    date: z.union([z.literal(""), z.iso.date()]),
    company: shortText,
    role: shortText,
    recipient: shortText,
    recipientAddress: z.string().max(500),
    greeting: shortText,
    body: z.string().max(12000),
    closing: shortText,
  })
  .strict();
export type CoverLetter = z.infer<typeof coverLetterSchema>;
export function emptyCoverLetter(): CoverLetter {
  return {
    name: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    date: "",
    company: "",
    role: "",
    recipient: "",
    recipientAddress: "",
    greeting: "Dear Hiring Manager,",
    body: "",
    closing: "Sincerely,",
  };
}
