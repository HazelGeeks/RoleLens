import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getAuthSessionUserFromRequest } from "@/lib/auth-server";
import { getDatabaseFromContext } from "@/lib/database";
import { emptyResumeProfile, type SavedResume } from "@/lib/resume/profile";
import { resetResumeStoreForTests } from "@/lib/resume/store";
import { GET, PUT } from "./route";
vi.mock("@/lib/auth-server", () => ({
  getAuthSessionUserFromRequest: vi.fn(),
}));
vi.mock("@/lib/database", () => ({ getDatabaseFromContext: vi.fn() }));
const auth = vi.mocked(getAuthSessionUserFromRequest);
function login(id: string) {
  auth.mockResolvedValue({
    id,
    name: "Person",
    email: `${id}@example.com`,
    createdAt: "2026-01-01",
  });
}
function request(body?: unknown, account = "a") {
  return new Request("http://localhost/api/resume", {
    method: body ? "PUT" : "GET",
    headers: {
      "content-type": "application/json",
      "x-rolelens-account": account,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PERSISTENCE_BACKEND", "memory");
  resetResumeStoreForTests();
  login("a");
});
afterEach(() => vi.unstubAllEnvs());
async function read(
  response: Response,
): Promise<{ resume: SavedResume | null }> {
  return (await response.json()) as { resume: SavedResume | null };
}

describe("resume API", () => {
  it("saves, reloads and clears structured details scoped to the session", async () => {
    const profile = {
      ...emptyResumeProfile(),
      name: "Alex",
      experience: [
        {
          id: "work",
          title: "Engineer",
          organization: "Acme",
          location: "Remote",
          startDate: "2024-01",
          endDate: "",
          details: "Built accessible interfaces",
        },
      ],
    };
    expect((await PUT(request({ profile, version: 0 }))).status).toBe(200);
    const loaded = await GET(request());
    expect(loaded.headers.get("cache-control")).toBe("no-store");
    expect((await read(loaded)).resume).toMatchObject({ profile, version: 1 });
    login("b");
    expect((await read(await GET(request(undefined, "b")))).resume).toBeNull();
    login("a");
    expect(
      (await PUT(request({ profile: emptyResumeProfile(), version: 1 })))
        .status,
    ).toBe(200);
    expect(
      (await read(await GET(request()))).resume!.profile.experience,
    ).toEqual([]);
  });
  it("rejects unauthenticated requests and mismatched account drafts", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(
      (await PUT(request({ profile: emptyResumeProfile(), version: 0 })))
        .status,
    ).toBe(401);
    login("b");
    expect(
      (await PUT(request({ profile: emptyResumeProfile(), version: 0 })))
        .status,
    ).toBe(409);
  });
  it("rejects invalid fields, dates and malformed JSON", async () => {
    expect(
      (
        await PUT(
          request({
            profile: { ...emptyResumeProfile(), email: "invalid" },
            version: 0,
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PUT(
          request({
            profile: {
              ...emptyResumeProfile(),
              education: [
                {
                  id: "1",
                  title: "Degree",
                  organization: "School",
                  location: "",
                  startDate: "2025-01",
                  endDate: "2024-01",
                  details: "",
                },
              ],
            },
            version: 0,
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PUT(
          new Request("http://localhost/api/resume", {
            method: "PUT",
            headers: { "x-rolelens-account": "a" },
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("does not overwrite newer data with a stale save", async () => {
    const profile = { ...emptyResumeProfile(), name: "Latest" };
    await PUT(request({ profile, version: 0 }));
    expect(
      (await PUT(request({ profile: emptyResumeProfile(), version: 0 })))
        .status,
    ).toBe(409);
    expect((await read(await GET(request()))).resume!.profile.name).toBe(
      "Latest",
    );
  });
  it("fails closed when production storage is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(getDatabaseFromContext).mockResolvedValue(undefined);
    expect(
      (await PUT(request({ profile: emptyResumeProfile(), version: 0 })))
        .status,
    ).toBe(503);
  });
});
