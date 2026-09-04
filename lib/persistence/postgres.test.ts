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
