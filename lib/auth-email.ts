import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getRuntimeEnvValue } from "@/lib/runtime-env";

/** Use a configured origin, never a request Host header, for recovery links. */
export async function getPasswordResetDelivery() {
  const origin = await getRuntimeEnvValue("AUTH_PUBLIC_URL");
  const from = await getRuntimeEnvValue("AUTH_EMAIL_FROM");
  if (!origin || !from || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) {
    throw new Error("Password reset email is not configured");
  }
  const url = new URL("/forgot-password/", origin);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Password reset email requires an HTTPS public URL");
  }
  const { env } = await getCloudflareContext({ async: true });
  const emailBinding = (env as CloudflareEnv & { AUTH_EMAIL?: SendEmail })
    .AUTH_EMAIL;
  if (!emailBinding)
    throw new Error("Password reset email binding is unavailable");

  return async (email: string, token: string): Promise<void> => {
    // Fragments are not sent to the web server or included in Referer headers.
    url.hash = new URLSearchParams({ token }).toString();
    const link = url.toString();
    await emailBinding.send({
      to: email,
      from: { email: from, name: "RoleLens" },
      subject: "Reset your RoleLens password",
      text: `Open this link to reset your password. It expires in 15 minutes and can be used once.\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Open the link below to reset your password. It expires in 15 minutes and can be used once.</p><p><a href="${link.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
  };
}
