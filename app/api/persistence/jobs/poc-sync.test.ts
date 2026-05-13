import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as GET_BY_ID, PATCH } from "@/app/api/persistence/jobs/[id]/route";
import { GET as LIST, POST } from "@/app/api/persistence/jobs/route";
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

describe("/api/persistence/jobs PoC sync", () => {
  beforeEach(() => {
    resetPersistentStoreForTests();
    delete process.env.PERSISTENCE_POC_TOKEN;
  });

  afterAll(() => {
    if (ORIGINAL_POC_TOKEN == null) {
      delete process.env.PERSISTENCE_POC_TOKEN;
      return;
    }

    process.env.PERSISTENCE_POC_TOKEN = ORIGINAL_POC_TOKEN;
  });

  it("supports create and read across two devices for the same user", async () => {
    const deviceAHeaders = buildHeaders("user-alpha", "device-a");
    const createRequest = new Request(
      "https://rolelens.pages.dev/api/persistence/jobs",
      {
        method: "POST",
        headers: deviceAHeaders,
        body: JSON.stringify({
          company: "Figma",
          title: "Frontend Engineer",
          status: "SAVE",
        }),
      },
    );

    const createdResponse = await POST(createRequest);
    const createdPayload = (await createdResponse.json()) as {
      ok: boolean;
      job: { id: string; version: number };
    };

    expect(createdResponse.status).toBe(201);
    expect(createdPayload.ok).toBe(true);
    expect(createdPayload.job.version).toBe(1);

    const deviceBHeaders = buildHeaders("user-alpha", "device-b");
    const listResponse = await LIST(
      new Request("https://rolelens.pages.dev/api/persistence/jobs", {
        method: "GET",
        headers: deviceBHeaders,
      }),
    );
    const listPayload = (await listResponse.json()) as {
      ok: boolean;
      count: number;
      jobs: Array<{ id: string }>;
    };

    expect(listResponse.status).toBe(200);
    expect(listPayload.ok).toBe(true);
    expect(listPayload.count).toBe(1);
    expect(listPayload.jobs[0]?.id).toBe(createdPayload.job.id);
  });

  it("returns 409 on stale update and succeeds after retry with latest version", async () => {
    const headersA = buildHeaders("user-sync", "device-a");
    const createResponse = await POST(
      new Request("https://rolelens.pages.dev/api/persistence/jobs", {
        method: "POST",
        headers: headersA,
        body: JSON.stringify({
          company: "Stripe",
          title: "Frontend Platform Engineer",
          status: "SAVE",
        }),
      }),
    );

    const createPayload = (await createResponse.json()) as {
      job: { id: string; version: number };
    };

    const jobId = createPayload.job.id;

    const headersB = buildHeaders("user-sync", "device-b");
    const statusResponse = await PATCH(
      new Request(`https://rolelens.pages.dev/api/persistence/jobs/${jobId}`, {
        method: "PATCH",
        headers: headersB,
        body: JSON.stringify({
          op: "status",
          status: "SUBMITTED",
          note: "Applied from device-b",
          expectedVersion: 1,
        }),
      }),
      { params: Promise.resolve({ id: jobId }) },
    );

    expect(statusResponse.status).toBe(200);

    const stalePatchResponse = await PATCH(
      new Request(`https://rolelens.pages.dev/api/persistence/jobs/${jobId}`, {
        method: "PATCH",
        headers: headersA,
        body: JSON.stringify({
          op: "update",
          expectedVersion: 1,
          changes: {
            nextAction: "Prepare interview packet",
          },
        }),
      }),
      { params: Promise.resolve({ id: jobId }) },
    );

    const stalePayload = (await stalePatchResponse.json()) as {
      ok: boolean;
      message: string;
      retryable: boolean;
      current: { version: number };
    };

    expect(stalePatchResponse.status).toBe(409);
    expect(stalePayload.ok).toBe(false);
    expect(stalePayload.retryable).toBe(true);
    expect(stalePayload.current.version).toBe(2);

    const retryPatchResponse = await PATCH(
      new Request(`https://rolelens.pages.dev/api/persistence/jobs/${jobId}`, {
        method: "PATCH",
        headers: headersA,
        body: JSON.stringify({
          op: "update",
          expectedVersion: stalePayload.current.version,
          changes: {
            nextAction: "Prepare interview packet",
          },
        }),
      }),
      { params: Promise.resolve({ id: jobId }) },
    );

    const retryPayload = (await retryPatchResponse.json()) as {
      ok: boolean;
      job: { version: number; nextAction: string; status: string };
    };

    expect(retryPatchResponse.status).toBe(200);
    expect(retryPayload.ok).toBe(true);
    expect(retryPayload.job.version).toBe(3);
    expect(retryPayload.job.nextAction).toBe("Prepare interview packet");
    expect(retryPayload.job.status).toBe("SUBMITTED");

    const fetchResponse = await GET_BY_ID(
      new Request(`https://rolelens.pages.dev/api/persistence/jobs/${jobId}`, {
        method: "GET",
        headers: headersA,
      }),
      { params: Promise.resolve({ id: jobId }) },
    );

    const fetchPayload = (await fetchResponse.json()) as {
      ok: boolean;
      job: { notes: Array<{ content: string }> };
    };

    expect(fetchResponse.status).toBe(200);
    expect(fetchPayload.ok).toBe(true);
    expect(fetchPayload.job.notes[0]?.content).toBe("Applied from device-b");
  });

  it("deduplicates create retries using clientRequestId", async () => {
    const headers = buildHeaders("user-dedupe", "device-x");
    const payload = {
      company: "Datadog",
      title: "UI Engineer",
      clientRequestId: "device-x-2026-04-13-req-1",
    };

    const firstResponse = await POST(
      new Request("https://rolelens.pages.dev/api/persistence/jobs", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }),
    );

    const secondResponse = await POST(
      new Request("https://rolelens.pages.dev/api/persistence/jobs", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }),
    );

    const firstPayload = (await firstResponse.json()) as {
      ok: boolean;
      job: { id: string };
    };
    const secondPayload = (await secondResponse.json()) as {
      ok: boolean;
      job: { id: string };
    };

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(firstPayload.ok).toBe(true);
    expect(secondPayload.ok).toBe(true);
    expect(firstPayload.job.id).toBe(secondPayload.job.id);

    const listResponse = await LIST(
      new Request("https://rolelens.pages.dev/api/persistence/jobs", {
        method: "GET",
        headers,
      }),
    );

    const listPayload = (await listResponse.json()) as {
      count: number;
    };
    expect(listPayload.count).toBe(1);
  });

  it("requires auth token when PERSISTENCE_POC_TOKEN is configured", async () => {
    process.env.PERSISTENCE_POC_TOKEN = "required-token";

    const unauthorizedResponse = await LIST(
      new Request("https://rolelens.pages.dev/api/persistence/jobs", {
        method: "GET",
        headers: buildHeaders("user-protected", "device-a"),
      }),
    );

    expect(unauthorizedResponse.status).toBe(401);

    const authorizedResponse = await LIST(
      new Request("https://rolelens.pages.dev/api/persistence/jobs", {
        method: "GET",
        headers: buildHeaders("user-protected", "device-a", "required-token"),
      }),
    );

    expect(authorizedResponse.status).toBe(200);
  });
});
