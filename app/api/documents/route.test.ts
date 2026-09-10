import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { getAuthSessionUserFromRequest } from "@/lib/auth-server";
import { getDatabaseFromContext } from "@/lib/database";
import { emptyCoverLetter } from "@/lib/cover-letter/profile";
import { emptyResumeProfile } from "@/lib/resume/profile";
import { documentsResponseSchema } from "@/lib/documents/types";
import { resetDocumentStoreForTests } from "@/lib/documents/store";
import { GET, PUT, DELETE } from "./route";

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
function request(
  method = "GET",
  body?: unknown,
  account = "a",
  kind = "cover-letter",
) {
  return new Request(`http://localhost/api/documents?kind=${kind}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-rolelens-account": account,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const letter = (id: string) => ({
  id,
  kind: "cover-letter",
  title: `Letter ${id}`,
  version: 0,
  data: {
    ...emptyCoverLetter(),
    name: "Alex",
    body: "My relevant experience.",
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PERSISTENCE_BACKEND", "memory");
  resetDocumentStoreForTests();
  login("a");
});
afterEach(() => vi.unstubAllEnvs());

it("saves five independent letters and five resumes, then rejects the sixth of each", async () => {
  for (let i = 0; i < 5; i++) {
    expect((await PUT(request("PUT", letter(`letter-${i}`)))).status).toBe(200);
    expect(
      (
        await PUT(
          request("PUT", {
            ...letter(`resume-${i}`),
            kind: "resume",
            data: emptyResumeProfile(),
          }),
        )
      ).status,
    ).toBe(200);
  }
  for (const input of [
    letter("sixth"),
    { ...letter("sixth"), kind: "resume", data: emptyResumeProfile() },
  ]) {
    expect((await PUT(request("PUT", input))).status).toBe(409);
  }
  const response = await GET(request());
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(
    documentsResponseSchema.parse(await response.json()).documents,
  ).toHaveLength(5);
  const updated = {
    ...letter("letter-0"),
    title: "Acme application",
    version: 1,
  };
  expect((await PUT(request("PUT", updated))).status).toBe(200);
  expect((await PUT(request("PUT", updated))).status).toBe(409);
  expect(
    (
      await DELETE(
        request("DELETE", { id: "letter-0", kind: "cover-letter", version: 1 }),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await DELETE(
        request("DELETE", { id: "letter-0", kind: "cover-letter", version: 2 }),
      )
    ).status,
  ).toBe(200);
  expect((await PUT(request("PUT", letter("replacement")))).status).toBe(200);
});

it("isolates document reads, updates and deletes by account and rejects stale sessions", async () => {
  await PUT(request("PUT", letter("private")));
  login("b");
  expect(
    documentsResponseSchema.parse(
      await (await GET(request("GET", undefined, "b"))).json(),
    ).documents,
  ).toEqual([]);
  expect(
    (await PUT(request("PUT", { ...letter("private"), version: 1 }, "b")))
      .status,
  ).toBe(409);
  expect(
    (
      await DELETE(
        request(
          "DELETE",
          { id: "private", kind: "cover-letter", version: 1 },
          "b",
        ),
      )
    ).status,
  ).toBe(409);
  expect((await GET(request())).status).toBe(409);
  expect((await PUT(request("PUT", letter("new")))).status).toBe(409);
  login("a");
  expect(
    documentsResponseSchema.parse(await (await GET(request())).json())
      .documents?.[0].data,
  ).toMatchObject({ body: "My relevant experience." });
  auth.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
  expect((await PUT(request("PUT", letter("new")))).status).toBe(401);
  expect(
    (
      await DELETE(
        request("DELETE", { id: "private", kind: "cover-letter", version: 1 }),
      )
    ).status,
  ).toBe(401);
});

it("validates kind, names, dates, lengths, versions and malformed JSON", async () => {
  const base = letter("new");
  for (const input of [
    { ...base, kind: "unknown" },
    { ...base, title: "  " },
    { ...base, version: -1 },
    { ...base, data: { ...base.data, email: "invalid" } },
    { ...base, data: { ...base.data, date: "2026-02-30" } },
    { ...base, data: { ...base.data, body: "x".repeat(12001) } },
    { ...base, userId: "another-account" },
  ])
    expect((await PUT(request("PUT", input))).status).toBe(400);
  expect((await GET(request("GET", undefined, "a", "unknown"))).status).toBe(
    400,
  );
  expect(
    (
      await DELETE(
        request("DELETE", { id: "new", kind: "cover-letter", version: 0 }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await PUT(
        new Request("http://localhost/api/documents", {
          method: "PUT",
          headers: { "x-rolelens-account": "a" },
          body: "{",
        }),
      )
    ).status,
  ).toBe(400);
});

it("fails closed when production storage is unavailable", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.mocked(getDatabaseFromContext).mockResolvedValue(undefined);
  expect((await PUT(request("PUT", letter("new")))).status).toBe(503);
  expect((await GET(request())).status).toBe(503);
});
