import { getDatabaseFromContext } from "@/lib/database";
import {
  MAX_DOCUMENTS,
  savedDocumentSchema,
  type DocumentKind,
  type DocumentSave,
  type SavedDocument,
} from "./types";

const accounts = new Map<string, SavedDocument[]>();
export class DocumentConflictError extends Error {}
export class DocumentLimitError extends Error {}
async function database() {
  const configured = process.env.PERSISTENCE_BACKEND?.trim().toLowerCase();
  if (configured && !["memory", "postgres"].includes(configured))
    throw new Error("Invalid persistence backend");
  if (configured === "memory" && process.env.NODE_ENV !== "production")
    return null;
  const db = await getDatabaseFromContext();
  if (
    !db &&
    (process.env.NODE_ENV === "production" || configured === "postgres")
  )
    throw new Error("Document database unavailable");
  return db;
}
type DocumentRow = {
  id: string;
  kind: string;
  title: string;
  data_json: string;
  version: number;
  updated_at: string;
};
function fromRow(row: DocumentRow): SavedDocument {
  return savedDocumentSchema.parse({
    id: row.id,
    kind: row.kind,
    title: row.title,
    data: JSON.parse(row.data_json),
    version: row.version,
    updatedAt: row.updated_at,
  });
}
const columns = "id, kind, title, data_json, version, updated_at";
export async function listDocuments(
  userId: string,
  kind: DocumentKind,
): Promise<SavedDocument[]> {
  const db = await database();
  if (!db)
    return structuredClone(
      (accounts.get(userId) ?? []).filter((doc) => doc.kind === kind),
    );
  const rows = await db
    .prepare(
      `SELECT ${columns} FROM application_documents WHERE user_id = ? AND kind = ? ORDER BY slot`,
    )
    .bind(userId, kind)
    .all<DocumentRow>();
  return rows.results.map(fromRow);
}
export async function saveDocument(
  userId: string,
  input: DocumentSave,
): Promise<SavedDocument> {
  const db = await database();
  const saved = savedDocumentSchema.parse({
    ...input,
    version: input.version + 1,
    updatedAt: new Date().toISOString(),
  });
  if (!db) {
    const documents = accounts.get(userId) ?? [];
    const index = documents.findIndex(
      (doc) => doc.kind === input.kind && doc.id === input.id,
    );
    if ((documents[index]?.version ?? 0) !== input.version)
      throw new DocumentConflictError();
    if (
      index < 0 &&
      documents.filter((doc) => doc.kind === input.kind).length >= MAX_DOCUMENTS
    )
      throw new DocumentLimitError();
    if (index < 0) documents.push(structuredClone(saved));
    else documents[index] = structuredClone(saved);
    accounts.set(userId, documents);
    return structuredClone(saved);
  }
  if (input.version > 0) {
    const row = await db
      .prepare(
        `UPDATE application_documents SET title = ?, data_json = ?, version = version + 1, updated_at = ?
      WHERE user_id = ? AND kind = ? AND id = ? AND version = ? RETURNING ${columns}`,
      )
      .bind(
        input.title,
        JSON.stringify(input.data),
        saved.updatedAt,
        userId,
        input.kind,
        input.id,
        input.version,
      )
      .first<DocumentRow>();
    if (!row) throw new DocumentConflictError();
    return fromRow(row);
  }
  // A unique, bounded slot enforces the limit even for simultaneous creates.
  // Retry other slots after conflicts; never rely on a racy count-then-insert.
  for (let slot = 1; slot <= MAX_DOCUMENTS; slot += 1) {
    const row = await db
      .prepare(
        `INSERT INTO application_documents (user_id, kind, id, slot, title, data_json, version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT DO NOTHING RETURNING ${columns}`,
      )
      .bind(
        userId,
        input.kind,
        input.id,
        slot,
        input.title,
        JSON.stringify(input.data),
        saved.updatedAt,
      )
      .first<DocumentRow>();
    if (row) return fromRow(row);
  }
  const existing = await db
    .prepare(
      "SELECT id FROM application_documents WHERE user_id = ? AND kind = ? AND id = ?",
    )
    .bind(userId, input.kind, input.id)
    .first();
  if (existing) throw new DocumentConflictError();
  throw new DocumentLimitError();
}
export async function deleteDocument(
  userId: string,
  kind: DocumentKind,
  id: string,
  version: number,
) {
  const db = await database();
  if (!db) {
    const documents = accounts.get(userId) ?? [];
    const index = documents.findIndex(
      (doc) => doc.kind === kind && doc.id === id && doc.version === version,
    );
    if (index < 0) throw new DocumentConflictError();
    documents.splice(index, 1);
    return;
  }
  const deleted = await db
    .prepare(
      "DELETE FROM application_documents WHERE user_id = ? AND kind = ? AND id = ? AND version = ? RETURNING id",
    )
    .bind(userId, kind, id, version)
    .first();
  if (!deleted) throw new DocumentConflictError();
}
export function resetDocumentStoreForTests() {
  accounts.clear();
}
