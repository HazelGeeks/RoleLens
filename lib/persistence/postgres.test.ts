import { readFile } from "node:fs/promises";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { normalizePostgresQuery, type DatabaseLike } from "@/lib/database";
import {
  createPersistentJob,
  getPersistentJob,
  patchPersistentJob,
} from "@/lib/persistence/store";
import {
  requestPasswordResetAuth,
  resetPasswordAuth,
  signInAuth,
  signUpAuth,
  getAuthSessionUserFromRequest,
} from "@/lib/auth-server";
import { getResume, saveResume } from "@/lib/resume/store";
import {
  deleteDocument,
  listDocuments,
  saveDocument,
  DocumentConflictError,
  DocumentLimitError,
} from "@/lib/documents/store";
import { emptyCoverLetter } from "@/lib/cover-letter/profile";
import { emptyResumeProfile } from "@/lib/resume/profile";
import type { PersistentJobMeta } from "@/lib/persistence/types";

const { getDatabase, sendReset } = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  sendReset: vi.fn<(email: string, token: string) => Promise<void>>(),
}));
vi.mock("@/lib/database", async (original) => ({
  ...(await original<typeof import("@/lib/database")>()),
  getDatabaseFromContext: getDatabase,
}));
vi.mock("@/lib/auth-email", () => ({
  getPasswordResetDelivery: async () => sendReset,
}));
let postgres: PGlite;
function adapter(engine: Pick<Transaction, "query">): DatabaseLike {
  return {
    prepare(sql) {
      let values: unknown[] = [];
      return {
        bind(...next) {
          values = next;
          return this;
        },
        async run() {
          const result = await engine.query(
            normalizePostgresQuery(sql),
            values,
          );
          return { meta: { changes: result.affectedRows } };
        },
        async all<T>() {
          return {
            results: (
              await engine.query<T>(normalizePostgresQuery(sql), values)
            ).rows,
          };
        },
        async first<T>() {
          return (
            (await engine.query<T>(normalizePostgresQuery(sql), values))
              .rows[0] ?? null
          );
        },
      };
    },
  };
}
beforeAll(async () => {
  postgres = new PGlite();
  await postgres.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  for (const file of [
    "20260903190000_rolelens_initial.sql",
    "20260904233000_auth_recovery_and_job_metadata.sql",
    "20260910000000_resume_profiles.sql",
    "20260910010000_application_documents.sql",
  ]) {
    await postgres.exec(
      await readFile(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
}, 30000);
beforeEach(async () => {
  await postgres.exec("TRUNCATE persistent_jobs, auth_users CASCADE;");
  getDatabase.mockResolvedValue({
    ...adapter(postgres),
    transaction: <T>(work: (db: DatabaseLike) => Promise<T>) =>
      postgres.transaction((tx) => work(adapter(tx))),
  });
  sendReset.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("PERSISTENCE_BACKEND", "postgres");
  vi.stubEnv("AUTH_BACKEND", "postgres");
  vi.stubEnv("AUTH_PASSWORD_PEPPER", "test-only-pepper");
});
afterAll(async () => {
  await postgres.close();
  vi.unstubAllEnvs();
});
const meta: PersistentJobMeta = {
  source: "LINKEDIN",
  remoteType: "REMOTE",
  salaryMin: 100000,
  salaryMax: 150000,
  salaryCurrency: "CAD",
  descriptionRaw: "React and TypeScript",
  extractedSkills: ["react"],
  fitScore: 85,
  statusHistory: [],
  publishedAt: "2026-09-01T00:00:00.000Z",
};
const create = () =>
  createPersistentJob({
    userId: "account-a",
    deviceId: "device-a",
    actor: "account-a",
    input: {
      company: "Test Company",
      title: "Frontend Engineer",
      status: "SAVE",
      nextAction: "Send application",
      followUpDate: "2026-09-08",
      meta,
      clientRequestId: "unique-create-1",
      initialNotes: [
        {
          id: "local-note",
          content: "Initial private note",
          createdAt: "2026-09-04T00:00:00.000Z",
        },
      ],
    },
  });
describe("Postgres migrations and persistence", () => {
  it("restores all metadata and initial notes from the real SQL store", async () => {
    const job = await create();
    const restored = await getPersistentJob("account-a", job.id);
    expect(restored?.meta).toEqual(meta);
    expect(restored?.notes.map((note) => note.content)).toEqual([
      "Initial private note",
    ]);
    expect(await getPersistentJob("account-b", job.id)).toBeUndefined();
    expect((await create()).id).toBe(job.id);
  });
  it("clears nullable fields, persists status history, and rejects stale versions", async () => {
    const job = await create();
    const cleared = await patchPersistentJob({
      userId: "account-a",
      deviceId: "device-b",
      actor: "account-a",
      jobId: job.id,
      operation: {
        op: "update",
        expectedVersion: job.version,
        changes: {
          nextAction: null,
          followUpDate: null,
          meta: { ...meta, salaryMax: 160000 },
        },
      },
    });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) throw new Error("Expected update");
    expect(cleared.job.nextAction).toBeUndefined();
    expect(cleared.job.followUpDate).toBeUndefined();
    expect(cleared.job.meta?.salaryMax).toBe(160000);
    const stale = await patchPersistentJob({
      userId: "account-a",
      deviceId: "device-a",
      actor: "account-a",
      jobId: job.id,
      operation: {
        op: "status",
        expectedVersion: job.version,
        status: "SUBMITTED",
      },
    });
    expect(stale.ok).toBe(false);
    const result = await patchPersistentJob({
      userId: "account-a",
      deviceId: "device-b",
      actor: "account-a",
      jobId: job.id,
      operation: {
        op: "status",
        expectedVersion: cleared.job.version,
        status: "SUBMITTED",
      },
    });
    expect(result.ok && result.job.meta?.statusHistory?.[0].status).toBe(
      "SUBMITTED",
    );
  });
  it("imports legacy notes once when a migration is retried", async () => {
    const job = await create();
    const args = {
      userId: "account-a",
      deviceId: "device-a",
      actor: "account-a",
      jobId: job.id,
      operation: {
        op: "import-notes" as const,
        notes: [
          {
            id: "legacy-note",
            content: "Legacy note",
            createdAt: "2026-09-03T00:00:00.000Z",
          },
        ],
      },
    };
    await patchPersistentJob(args);
    await patchPersistentJob(args);
    expect((await getPersistentJob("account-a", job.id))?.notes).toHaveLength(
      2,
    );
  });
  it("rolls back the job version if note insertion fails", async () => {
    const job = await create();
    await postgres.exec(
      "ALTER TABLE persistent_job_notes ADD CONSTRAINT test_reject_note CHECK (content <> 'reject this note');",
    );
    try {
      await expect(
        patchPersistentJob({
          userId: "account-a",
          deviceId: "device-a",
          actor: "account-a",
          jobId: job.id,
          operation: {
            op: "note",
            expectedVersion: job.version,
            content: "reject this note",
          },
        }),
      ).rejects.toThrow();
      expect((await getPersistentJob("account-a", job.id))?.version).toBe(
        job.version,
      );
    } finally {
      await postgres.exec(
        "ALTER TABLE persistent_job_notes DROP CONSTRAINT test_reject_note;",
      );
    }
  });
  it("atomically consumes a reset token and invalidates prior sessions", async () => {
    const signup = await signUpAuth({
      name: "Test",
      email: "test@example.com",
      password: "original-password",
    });
    if (!signup.ok) throw new Error("Expected signup");
    await requestPasswordResetAuth("test@example.com");
    const token = sendReset.mock.calls[0][1];
    const stored = await postgres.query<{ token_hash: string }>(
      "SELECT token_hash FROM auth_password_reset_tokens",
    );
    expect(stored.rows[0].token_hash).not.toContain(token);
    const results = await Promise.all(
      ["new-password-1", "new-password-2"].map((password) =>
        resetPasswordAuth({ token, password }),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const successIndex = results.findIndex((result) => result.ok);
    expect(
      (
        await signInAuth({
          email: "test@example.com",
          password: `new-password-${successIndex + 1}`,
        })
      ).ok,
    ).toBe(true);
    expect(
      await getAuthSessionUserFromRequest(
        new Request("https://example.test", {
          headers: { cookie: `rolelens_session=${signup.sessionToken}` },
        }),
      ),
    ).toBeNull();
  });
  it("keeps the token usable if the password update transaction fails", async () => {
    const signup = await signUpAuth({
      name: "Test",
      email: "test@example.com",
      password: "original-password",
    });
    expect(signup.ok).toBe(true);
    await requestPasswordResetAuth("test@example.com");
    const token = sendReset.mock.calls[0][1];
    await postgres.exec(
      "CREATE FUNCTION reject_password_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER reject_password BEFORE UPDATE ON auth_users FOR EACH ROW EXECUTE FUNCTION reject_password_update();",
    );
    try {
      await expect(
        resetPasswordAuth({ token, password: "new-password" }),
      ).rejects.toThrow("test failure");
    } finally {
      await postgres.exec(
        "DROP TRIGGER reject_password ON auth_users; DROP FUNCTION reject_password_update();",
      );
    }
    expect(
      (await resetPasswordAuth({ token, password: "new-password" })).ok,
    ).toBe(true);
  });
});

it("persists resume profiles in Postgres with atomic version checks and account isolation", async () => {
  const result = await signUpAuth({
    name: "Resume User",
    email: "resume@example.com",
    password: "password123",
  });
  if (!result.ok) throw new Error("Signup failed");
  const userId = result.user.id;
  const profile = { ...emptyResumeProfile(), name: "Resume User" };
  await saveResume(userId, profile, 0);
  expect(await getResume(userId)).toMatchObject({ profile, version: 1 });
  expect(await getResume("another-account")).toBeNull();
  const competing = await Promise.allSettled([
    saveResume(userId, { ...profile, headline: "First" }, 1),
    saveResume(userId, { ...profile, headline: "Second" }, 1),
  ]);
  expect(
    competing.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    competing.filter((result) => result.status === "rejected"),
  ).toHaveLength(1);
  expect((await getResume(userId))?.version).toBe(2);
});

it("limits simultaneous document creates to five per kind and frees deleted slots", async () => {
  const signup = await signUpAuth({
    name: "Documents",
    email: "documents@example.com",
    password: "password123",
  });
  if (!signup.ok) throw new Error("Signup failed");
  const userId = signup.user.id;
  const inputs = Array.from({ length: 8 }, (_, index) => ({
    id: `letter-${index}`,
    kind: "cover-letter" as const,
    title: `Letter ${index}`,
    version: 0,
    data: { ...emptyCoverLetter(), body: `Application ${index}` },
  }));
  const results = await Promise.allSettled(
    inputs.map((input) => saveDocument(userId, input)),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(5);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    3,
  );
  for (const result of results)
    if (result.status === "rejected")
      expect(result.reason).toBeInstanceOf(DocumentLimitError);
  const documents = await listDocuments(userId, "cover-letter");
  expect(documents).toHaveLength(5);
  expect(await listDocuments("another-account", "cover-letter")).toEqual([]);
  const first = documents[0];
  await expect(
    deleteDocument("another-account", first.kind, first.id, first.version),
  ).rejects.toBeInstanceOf(DocumentConflictError);
  const competing = await Promise.allSettled([
    saveDocument(userId, { ...first, title: "Changed" }),
    deleteDocument(userId, first.kind, first.id, first.version),
  ]);
  expect(
    competing.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const remaining = await listDocuments(userId, "cover-letter");
  const stillPresent = remaining.find((document) => document.id === first.id);
  if (stillPresent)
    await deleteDocument(userId, first.kind, first.id, stillPresent.version);
  await saveDocument(userId, { ...inputs[0], id: "replacement" });
  expect(await listDocuments(userId, "cover-letter")).toHaveLength(5);
  await saveResume(userId, emptyResumeProfile(), 0);
  expect(await listDocuments(userId, "resume")).toHaveLength(1);
});

it("migrates existing resumes without losing details or overwriting newer edits on rerun", async () => {
  const signup = await signUpAuth({
    name: "Legacy",
    email: "legacy@example.com",
    password: "password123",
  });
  if (!signup.ok) throw new Error("Signup failed");
  const userId = signup.user.id;
  const profile = {
    ...emptyResumeProfile(),
    name: "Existing resume",
    skills: "TypeScript",
  };
  await postgres.query(
    "INSERT INTO resume_profiles (user_id, profile_json, version, updated_at) VALUES ($1, $2, 7, $3)",
    [userId, JSON.stringify(profile), "2026-09-10"],
  );
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260910010000_application_documents.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await postgres.exec(migration);
  expect(await listDocuments(userId, "resume")).toMatchObject([
    { id: "primary", title: "My resume", data: profile, version: 7 },
  ]);
  await saveResume(userId, { ...profile, name: "Updated resume" }, 7);
  await postgres.exec(migration);
  expect((await getResume(userId))?.profile.name).toBe("Updated resume");
  expect((await getResume(userId))?.version).toBe(8);
  const source = await postgres.query<{ profile_json: string }>(
    "SELECT profile_json FROM resume_profiles WHERE user_id = $1",
    [userId],
  );
  expect(JSON.parse(source.rows[0].profile_json)).toEqual(profile);
});
