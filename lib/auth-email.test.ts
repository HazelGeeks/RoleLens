import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { getPasswordResetDelivery } from "@/lib/auth-email";
const { send, context } = vi.hoisted(() => ({
  send: vi.fn(),
  context: vi.fn(),
}));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: context }));
beforeEach(() => {
  send.mockReset().mockResolvedValue({ messageId: "test" });
  context.mockReset().mockResolvedValue({ env: { AUTH_EMAIL: { send } } });
  vi.stubEnv("AUTH_PUBLIC_URL", "https://rolelens.example.test");
  vi.stubEnv("AUTH_EMAIL_FROM", "noreply@example.test");
});
afterEach(() => {
  vi.unstubAllEnvs();
});
it("sends the one-time link only to the requested inbox using the configured origin", async () => {
  const deliver = await getPasswordResetDelivery();
  await deliver("user@example.test", "a".repeat(43));
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "user@example.test",
      from: { email: "noreply@example.test", name: "RoleLens" },
      text: expect.stringContaining(
        `https://rolelens.example.test/forgot-password/#token=${"a".repeat(43)}`,
      ),
      html: expect.stringContaining("Reset password"),
    }),
  );
});
it("rejects an insecure origin or missing sender before sending", async () => {
  vi.stubEnv("AUTH_PUBLIC_URL", "http://rolelens.example.test");
  await expect(getPasswordResetDelivery()).rejects.toThrow("HTTPS");
  vi.stubEnv("AUTH_PUBLIC_URL", "https://rolelens.example.test");
  vi.stubEnv("AUTH_EMAIL_FROM", "");
  await expect(getPasswordResetDelivery()).rejects.toThrow("not configured");
  expect(send).not.toHaveBeenCalled();
});
it("propagates delivery failures so issued tokens can be revoked", async () => {
  send.mockRejectedValue(new Error("Delivery failure"));
  const deliver = await getPasswordResetDelivery();
  await expect(deliver("user@example.test", "a".repeat(43))).rejects.toThrow(
    "Delivery failure",
  );
});
