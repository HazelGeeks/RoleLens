import {
  listDocuments,
  saveDocument,
  resetDocumentStoreForTests,
} from "@/lib/documents/store";
import type { ResumeProfile, SavedResume } from "./profile";

export { DocumentConflictError as ResumeConflictError } from "@/lib/documents/store";
export const resetResumeStoreForTests = resetDocumentStoreForTests;

// Compatibility for existing clients. New clients address each saved document.
export async function getResume(userId: string): Promise<SavedResume | null> {
  const document = (await listDocuments(userId, "resume")).find(
    (document) => document.id === "primary",
  );
  return document?.kind === "resume"
    ? {
        profile: document.data,
        version: document.version,
        updatedAt: document.updatedAt,
      }
    : null;
}
export async function saveResume(
  userId: string,
  profile: ResumeProfile,
  version: number,
): Promise<SavedResume> {
  const documents = await listDocuments(userId, "resume");
  const existing = documents.find((document) => document.id === "primary");
  const saved = await saveDocument(userId, {
    id: "primary",
    kind: "resume",
    title: existing?.title ?? "My resume",
    data: profile,
    version,
  });
  if (saved.kind !== "resume") throw new Error("Unexpected document type");
  return {
    profile: saved.data,
    version: saved.version,
    updatedAt: saved.updatedAt,
  };
}
