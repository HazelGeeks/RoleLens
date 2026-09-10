import { getAuthSessionUserFromRequest } from "@/lib/auth-server";
import {
  documentDeleteSchema,
  documentKindSchema,
  documentSaveSchema,
} from "@/lib/documents/types";
import {
  deleteDocument,
  DocumentConflictError,
  DocumentLimitError,
  listDocuments,
  saveDocument,
} from "@/lib/documents/store";

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
async function handle(request: Request) {
  try {
    const user = await getAuthSessionUserFromRequest(request);
    if (!user) return json({ message: "Login required" }, 401);
    if (request.headers.get("x-rolelens-account") !== user.id)
      return json(
        { message: "Your account changed. Reload before continuing." },
        409,
      );
    if (request.method === "GET") {
      const kind = documentKindSchema.safeParse(
        new URL(request.url).searchParams.get("kind"),
      );
      if (!kind.success)
        return json({ message: "Choose a valid document type." }, 400);
      return json({ documents: await listDocuments(user.id, kind.data) });
    }
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ message: "Invalid JSON payload" }, 400);
    }
    if (request.method === "DELETE") {
      const parsed = documentDeleteSchema.safeParse(payload);
      if (!parsed.success)
        return json({ message: "Invalid document or version." }, 400);
      await deleteDocument(
        user.id,
        parsed.data.kind,
        parsed.data.id,
        parsed.data.version,
      );
      return json({ deleted: true });
    }
    const parsed = documentSaveSchema.safeParse(payload);
    if (!parsed.success)
      return json(
        {
          message: "Check your document name, fields and dates.",
          issues: parsed.error.issues,
        },
        400,
      );
    return json({ document: await saveDocument(user.id, parsed.data) });
  } catch (error) {
    if (error instanceof DocumentConflictError)
      return json(
        {
          message:
            "This document changed or was deleted in another tab. Copy your unsaved text, then reload before continuing.",
        },
        409,
      );
    if (error instanceof DocumentLimitError)
      return json(
        {
          message:
            "You can save up to 5 of each document type. Delete an existing document to make room.",
        },
        409,
      );
    return json(
      { message: "Your documents could not be loaded or saved. Please retry." },
      503,
    );
  }
}
export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
