import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET as GET_BY_ID, PATCH } from "@/app/api/jobs/[id]/route";
import { GET as LIST, POST } from "@/app/api/jobs/route";
import { resetPersistentStoreForTests } from "@/lib/persistence/store";

const ORIGINAL_POC_TOKEN = process.env.PERSISTENCE_POC_TOKEN;

function buildHeaders(userId: string, deviceId: string, token?: string) {
  const headers = new Headers({
    "content-type": "application/json",
    "x-rolelens-user": userId,
    "x-rolelens-device": deviceId,
  });

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return headers;
}

describe("/api/jobs DB persistence API", () => {
  beforeEach(() => {
    resetPersistentStoreForTests();
    delete process.env.PERSISTENCE_POC_TOKEN;
    delete process.env.PERSISTENCE_BACKEND;
  });

  afterAll(() => {
    if (ORIGINAL_POC_TOKEN == null) {
      delete process.env.PERSISTENCE_POC_TOKEN;
    } else {
      process.env.PERSISTENCE_POC_TOKEN = ORIGINAL_POC_TOKEN;
    }
  });

  it("creates and lists jobs through /api/jobs", async () => {
    const headers = buildHeaders("user-db-api", "device-a");
    const createResponse = await POST(
      new Request("https://rolelens.pages.dev/api/jobs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          company: "Notion",
          title: "Frontend Engineer",
          status: "SAVE",
          tags: ["react", "typescript"],
        }),
      }),
    );

    expect(createResponse.status).toBe(201);

    const listResponse = await LIST(
      new Request("https://rolelens.pages.dev/api/jobs", {
        method: "GET",
        headers,
      }),
    );
    const payload = (await listResponse.json()) as {
      ok: boolean;
      count: number;
      jobs: Array<{ company: string; title: string }>;
    };

    expect(listResponse.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.count).toBe(1);
    expect(payload.jobs[0]).toMatchObject({
      company: "Notion",
      title: "Frontend Engineer",
    });
  });

  it("falls back to memory backend when d1 is configured without binding", async () => {
    process.env.PERSISTENCE_BACKEND = "d1";

    const headers = buildHeaders("user-fallback", "device-a");
    const createResponse = await POST(
      new Request("https://rolelens.pages.dev/api/jobs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          company: "Linear",
          title: "Frontend Engineer",
          status: "SAVE",
        }),
      }),
    );

    expect(createResponse.status).toBe(201);
  });

  it("supports GET/PATCH by id through /api/jobs/:id", async () => {
    const headers = buildHeaders("user-db-api", "device-a");

    const createResponse = await POST(
      new Request("https://rolelens.pages.dev/api/jobs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          company: "Figma",
          title: "UI Engineer",
          status: "SAVE",
        }),
      }),
    );

    const created = (await createResponse.json()) as {
      job: { id: string; version: number };
    };

    const patchResponse = await PATCH(
      new Request(`https://rolelens.pages.dev/api/jobs/${created.job.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          op: "update",
          expectedVersion: created.job.version,
          changes: { nextAction: "Prepare interview notes" },
        }),
      }),
      { params: Promise.resolve({ id: created.job.id }) },
    );

    expect(patchResponse.status).toBe(200);

    const fetchResponse = await GET_BY_ID(
      new Request(`https://rolelens.pages.dev/api/jobs/${created.job.id}`, {
        method: "GET",
        headers,
      }),
      { params: Promise.resolve({ id: created.job.id }) },
    );
    const fetched = (await fetchResponse.json()) as {
      ok: boolean;
      job: { nextAction?: string };
    };

    expect(fetchResponse.status).toBe(200);
    expect(fetched.ok).toBe(true);
    expect(fetched.job.nextAction).toBe("Prepare interview notes");
  });

  it("supports DELETE by id through /api/jobs/:id", async () => {
    const headers = buildHeaders("user-db-api", "device-a");

    const createResponse = await POST(
      new Request("https://rolelens.pages.dev/api/jobs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          company: "Delete Co",
          title: "Frontend Engineer",
        }),
      }),
    );
    const created = (await createResponse.json()) as {
      job: { id: string };
    };

    const deleteResponse = await DELETE(
      new Request(`https://rolelens.pages.dev/api/jobs/${created.job.id}`, {
        method: "DELETE",
        headers,
      }),
      { params: Promise.resolve({ id: created.job.id }) },
    );
    expect(deleteResponse.status).toBe(200);

    const fetchResponse = await GET_BY_ID(
      new Request(`https://rolelens.pages.dev/api/jobs/${created.job.id}`, {
        method: "GET",
        headers,
      }),
      { params: Promise.resolve({ id: created.job.id }) },
    );

    expect(fetchResponse.status).toBe(404);
  });
});
