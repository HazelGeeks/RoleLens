"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MAX_DOCUMENTS,
  documentsResponseSchema,
  documentSaveSchema,
  type DocumentKind,
} from "@/lib/documents/types";
import styles from "@/components/resume/resume-page-client.module.css";

type Document<T> = {
  id: string;
  title: string;
  data: T;
  version: number;
  updatedAt: string;
};
type Props<T> = {
  userId: string;
  kind: DocumentKind;
  label: string;
  description: string;
  schema: z.ZodType<T>;
  empty: () => T;
  canPrint: (data: T) => boolean;
  editor: (data: T, change: (data: T) => void) => ReactNode;
  preview: (data: T, onOverflow: (overflow: boolean) => void) => ReactNode;
};

/** Account-keyed by callers; switching documents never refetches over a draft. */
export function DocumentWorkspace<T>({
  userId,
  kind,
  label,
  description,
  schema,
  empty,
  canPrint,
  editor,
  preview,
}: Props<T>) {
  const [documents, setDocuments] = useState<Document<T>[]>([]);
  const [data, setData] = useState<T>(empty);
  const [id, setId] = useState("");
  const [title, setTitle] = useState(`My ${label.toLowerCase()}`);
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("Loading saved documents...");
  const [attempt, setAttempt] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    let disposed = false;
    async function load() {
      try {
        const response = await fetch(`/api/documents?kind=${kind}`, {
          cache: "no-store",
          headers: { "x-rolelens-account": userId },
          signal: controller.signal,
        });
        const payload = documentsResponseSchema.parse(await response.json());
        if (!response.ok)
          throw new Error(
            payload.message || "Unable to load documents. Retry below.",
          );
        if (
          !payload.documents ||
          payload.documents.some((doc) => doc.kind !== kind)
        )
          throw new Error("Unable to load documents. Retry below.");
        const loaded = payload.documents.map((doc) => ({
          ...doc,
          data: schema.parse(doc.data),
        }));
        if (disposed || controller.signal.aborted) return;
        setDocuments(loaded);
        const first = loaded[0];
        setData(first ? first.data : empty());
        setId(first?.id ?? crypto.randomUUID());
        setTitle(first?.title ?? `My ${label.toLowerCase()}`);
        setVersion(first?.version ?? 0);
        setReady(true);
        setError(null);
        setNotice(
          first
            ? `Saved ${label.toLowerCase()} loaded.`
            : "Add your details, then save your document.",
        );
      } catch (cause) {
        if (!disposed) {
          setError(
            controller.signal.aborted
              ? "Loading took too long. Please retry."
              : errorMessage(cause),
          );
          setNotice("");
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void load();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [userId, kind, label, schema, empty, attempt]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const guard = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        link &&
        link.getAttribute("target") !== "_blank" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !window.confirm("You have unsaved changes. Leave this page?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guard, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guard, true);
    };
  }, [dirty]);

  function change(next: T) {
    setData(next);
    setDirty(true);
    setNotice("Unsaved changes");
  }
  function select(document?: Document<T>) {
    setId(document?.id ?? crypto.randomUUID());
    setData(document ? document.data : empty());
    setTitle(document?.title ?? `My ${label.toLowerCase()}`);
    setVersion(document?.version ?? 0);
    setDirty(false);
    setError(null);
    setNotice(
      document
        ? `Saved ${label.toLowerCase()} loaded.`
        : "Add your details, then save your document.",
    );
  }
  function mayDiscard() {
    return (
      !dirty || window.confirm("Discard unsaved changes to this document?")
    );
  }
  function duplicate() {
    setId(crypto.randomUUID());
    setVersion(0);
    setTitle(`${title.slice(0, 93)} (copy)`);
    setDirty(true);
    setError(null);
    setNotice("Copy created. Save it to keep this version.");
  }
  async function mutate(method: "PUT" | "DELETE", body: unknown) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/documents", {
        method,
        headers: {
          "content-type": "application/json",
          "x-rolelens-account": userId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = documentsResponseSchema.parse(await response.json());
      if (!response.ok)
        throw new Error(
          payload.message || "Unable to save your changes. Please retry.",
        );
      if (controller.signal.aborted)
        throw new Error(
          "Unable to confirm the request. Your draft is still here. Copy it before reloading.",
        );
      return payload;
    } catch (cause) {
      if (controller.signal.aborted)
        throw new Error(
          "Unable to confirm the request. Your draft is still here. Copy it before reloading.",
        );
      throw cause;
    } finally {
      window.clearTimeout(timeout);
    }
  }
  async function save() {
    const parsed = documentSaveSchema.safeParse({
      id,
      kind,
      title,
      data,
      version,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(" · "),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = await mutate("PUT", parsed.data);
      if (!active.current) return;
      if (
        !payload.document ||
        payload.document.id !== id ||
        payload.document.kind !== kind
      )
        throw new Error(
          "Unable to confirm your save. Copy your draft before reloading.",
        );
      const saved = {
        ...payload.document,
        data: schema.parse(payload.document.data),
      };
      setDocuments((current) =>
        current.some((doc) => doc.id === id)
          ? current.map((doc) => (doc.id === id ? saved : doc))
          : [...current, saved],
      );
      setVersion(saved.version);
      setTitle(saved.title);
      setDirty(false);
      setNotice(`${label} saved.`);
    } catch (cause) {
      if (active.current) setError(errorMessage(cause));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function remove() {
    if (
      !window.confirm(
        `Delete “${title}”?${dirty ? " Unsaved changes will also be discarded." : ""} This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const payload = await mutate("DELETE", { id, kind, version });
      if (!active.current) return;
      if (!payload.deleted)
        throw new Error("Unable to confirm deletion. Please reload to check.");
      const remaining = documents.filter((doc) => doc.id !== id);
      setDocuments(remaining);
      select(remaining[0]);
      setNotice("Document deleted.");
    } catch (cause) {
      if (active.current) setError(errorMessage(cause));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  const full = documents.length >= MAX_DOCUMENTS;
  return (
    <div className={styles.workspace}>
      <header className={styles.toolbar}>
        <div>
          <h1>{label}</h1>
          <p>{description}</p>
        </div>
        <div className={styles.actions}>
          <Button
            disabled={!ready || busy || !dirty || (version === 0 && full)}
            onClick={() => void save()}
          >
            {busy ? "Working..." : `Save ${label.toLowerCase()}`}
          </Button>
          <Button
            variant="secondary"
            disabled={!ready || busy || overflow || !canPrint(data)}
            onClick={() => window.print()}
          >
            Print / Save PDF
          </Button>
        </div>
      </header>
      <fieldset className={styles.documentLibrary} disabled={!ready || busy}>
        <legend className={styles.srOnly}>Saved documents</legend>
        <label htmlFor="saved-document">
          Saved {kind === "resume" ? "resumes" : "cover letters"} (
          {documents.length}/{MAX_DOCUMENTS})
          <select
            id="saved-document"
            value={version ? id : "draft"}
            onChange={(event) => {
              if (event.target.value !== "draft" && mayDiscard())
                select(documents.find((doc) => doc.id === event.target.value));
            }}
          >
            {!version && <option value="draft">Unsaved draft</option>}
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            disabled={full}
            onClick={() => {
              if (mayDiscard()) select();
            }}
          >
            New {label.toLowerCase()}
          </Button>
          <Button variant="secondary" disabled={full} onClick={duplicate}>
            Duplicate
          </Button>
          <Button
            variant="ghost"
            disabled={!version}
            onClick={() => void remove()}
          >
            Delete
          </Button>
        </div>
        {full && (
          <p className={styles.hint}>
            All 5 slots are used. You can edit these documents, or delete one to
            create another.
          </p>
        )}
      </fieldset>
      <div className={styles.feedback}>
        <p role="status">{notice}</p>
        {error && <p role="alert">{error}</p>}
        {!ready && error && (
          <Button onClick={() => setAttempt((current) => current + 1)}>
            Retry loading
          </Button>
        )}
      </div>
      <div className={styles.columns}>
        <fieldset className={styles.editor} disabled={!ready || busy}>
          <legend className={styles.srOnly}>{label} details</legend>
          <section className={styles.card}>
            <label htmlFor="document-title">
              Document name
              <Input
                id="document-title"
                value={title}
                maxLength={100}
                placeholder="Company — role"
                onChange={(event) => {
                  setTitle(event.target.value);
                  setDirty(true);
                  setNotice("Unsaved changes");
                }}
              />
            </label>
            <p className={styles.hint}>
              For organizing your saved versions. This name is not printed.
            </p>
          </section>
          {editor(data, change)}
        </fieldset>
        <section className={styles.previewPanel} aria-label="One-page preview">
          <div className={styles.previewNote}>
            <h2>One-page preview</h2>
            <p>Basic layout · your template can be applied later.</p>
            {overflow && (
              <p role="alert">
                This content exceeds one page. Shorten the text before printing.
                All your details can still be saved.
              </p>
            )}
          </div>
          <div className={styles.paperViewport}>
            {preview(data, setOverflow)}
          </div>
        </section>
      </div>
    </div>
  );
}
function errorMessage(cause: unknown) {
  if (cause instanceof z.ZodError)
    return "The server returned an unexpected document. Your draft is still here. Please retry.";
  return cause instanceof Error
    ? cause.message
    : "Unable to complete the request. Please retry.";
}
