import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as SIGNUP } from "@/app/api/auth/signup/route";
import { DELETE as DELETE_GOAL } from "@/app/api/goals/[id]/route";
import { POST as CREATE_FOLLOW_UP } from "@/app/api/goals/[id]/follow-ups/route";
import { GET as LIST_GOALS, POST as CREATE_GOAL } from "@/app/api/goals/route";
import { resetAuthStoreForTests } from "@/lib/auth-server";
import { resetGoalsStoreForTests } from "@/lib/goals/store";

describe("/api/goals", () => {
  beforeEach(() => {
    resetAuthStoreForTests();
    resetGoalsStoreForTests();
    delete process.env.PERSISTENCE_BACKEND;
    delete process.env.AUTH_BACKEND;
    delete process.env.AUTH_PASSWORD_PEPPER;
    vi.unstubAllEnvs();
  });

  it("supports create/list/follow-up/delete flow for authenticated user", async () => {
    const signupResponse = await SIGNUP(
      new Request("https://rolelens.pages.dev/api/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Goals User",
          email: "goals@example.com",
          password: "password123",
        }),
      }),
    );
    const cookieHeader = signupResponse.headers.get("set-cookie")?.split(";")[0] || "";

    const createResponse = await CREATE_GOAL(
      new Request("https://rolelens.pages.dev/api/goals", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        body: JSON.stringify({
          company: "Shopify",
          targetRole: "Senior Frontend Engineer",
        }),
      }),
    );
    expect(createResponse.status).toBe(201);
    const createdPayload = (await createResponse.json()) as {
      goal: { id: string; company: string };
    };
    expect(createdPayload.goal.company).toBe("Shopify");

    const goalId = createdPayload.goal.id;

    const followUpResponse = await CREATE_FOLLOW_UP(
      new Request(`https://rolelens.pages.dev/api/goals/${goalId}/follow-ups`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        body: JSON.stringify({
          note: "Reached out to recruiter and shared portfolio.",
          nextActionDate: "2026-07-01",
        }),
      }),
      { params: Promise.resolve({ id: goalId }) },
    );
    expect(followUpResponse.status).toBe(200);
    const followUpPayload = (await followUpResponse.json()) as {
      goal: { followUps: Array<{ note: string }> };
    };
    expect(followUpPayload.goal.followUps[0]?.note).toContain("Reached out");

    const listResponse = await LIST_GOALS(
      new Request("https://rolelens.pages.dev/api/goals", {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
      }),
    );
    expect(listResponse.status).toBe(200);
    const listPayload = (await listResponse.json()) as {
      count: number;
      goals: Array<{ company: string }>;
    };
    expect(listPayload.count).toBe(1);
    expect(listPayload.goals[0]?.company).toBe("Shopify");

    const deleteResponse = await DELETE_GOAL(
      new Request(`https://rolelens.pages.dev/api/goals/${goalId}`, {
        method: "DELETE",
        headers: {
          cookie: cookieHeader,
        },
      }),
      { params: Promise.resolve({ id: goalId }) },
    );
    expect(deleteResponse.status).toBe(200);

    const listAfterDeleteResponse = await LIST_GOALS(
      new Request("https://rolelens.pages.dev/api/goals", {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
      }),
    );
    const listAfterDeletePayload = (await listAfterDeleteResponse.json()) as {
      count: number;
    };
    expect(listAfterDeletePayload.count).toBe(0);
  });

  it("requires authenticated session", async () => {
    const response = await LIST_GOALS(
      new Request("https://rolelens.pages.dev/api/goals", {
        method: "GET",
      }),
    );

    const payload = (await response.json()) as { message: string };
    expect(response.status).toBe(401);
    expect(payload.message).toBe("Login required");
  });

  it("accepts x-rolelens-user header when cookie session is unavailable", async () => {
    const response = await CREATE_GOAL(
      new Request("https://rolelens.pages.dev/api/goals", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-rolelens-user": "user-header-only",
        },
        body: JSON.stringify({
          company: "OpenAI",
        }),
      }),
    );

    expect(response.status).toBe(201);

    const listResponse = await LIST_GOALS(
      new Request("https://rolelens.pages.dev/api/goals", {
        method: "GET",
        headers: {
          "x-rolelens-user": "user-header-only",
        },
      }),
    );

    const payload = (await listResponse.json()) as {
      count: number;
      goals: Array<{ company: string }>;
    };
    expect(listResponse.status).toBe(200);
    expect(payload.count).toBe(1);
    expect(payload.goals[0]?.company).toBe("OpenAI");
  });

  it("rejects x-rolelens-user header without session in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await CREATE_GOAL(
      new Request("https://rolelens.pages.dev/api/goals", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-rolelens-user": "user-header-only",
        },
        body: JSON.stringify({
          company: "OpenAI",
        }),
      }),
    );

    expect(response.status).toBe(401);
  });
});
