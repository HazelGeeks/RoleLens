export type RuntimeEnv = NodeJS.ProcessEnv;

function getRuntimeEnvValueFromGlobalScope(name: string) {
  const scope = globalThis as Record<string, unknown> & {
    __env__?: Record<string, unknown>;
    __ENV__?: Record<string, unknown>;
  };

  const direct = scope[name];
  if (typeof direct === "string") return direct;

  const lowerEnvCandidate = scope.__env__?.[name];
  if (typeof lowerEnvCandidate === "string") return lowerEnvCandidate;

  const upperEnvCandidate = scope.__ENV__?.[name];
  if (typeof upperEnvCandidate === "string") return upperEnvCandidate;

  return undefined;
}

async function getCloudflareRuntimeEnv() {
  try {
    const { getRequestContext } = await import("@cloudflare/next-on-pages");
    const context = getRequestContext();
    const env = context.env as Record<string, unknown> | undefined;
    if (env && typeof env === "object") return env;
  } catch {
    // Non-Cloudflare runtimes use process.env/global fallbacks.
  }

  return undefined;
}

export async function getRuntimeEnv(
  baseEnv: RuntimeEnv = process.env,
): Promise<RuntimeEnv> {
  const cloudflareEnv = await getCloudflareRuntimeEnv();
  if (!cloudflareEnv) return baseEnv;

  const merged: RuntimeEnv = { ...baseEnv };
  for (const [key, value] of Object.entries(cloudflareEnv)) {
    if (typeof value === "string") {
      merged[key] = value;
    }
  }

  return merged;
}

export async function getRuntimeEnvValue(name: string) {
  const processValue = process.env[name]?.trim();
  if (processValue) return processValue;

  const cloudflareEnv = await getCloudflareRuntimeEnv();
  const cloudflareValue = cloudflareEnv?.[name];
  if (typeof cloudflareValue === "string" && cloudflareValue.trim()) {
    return cloudflareValue.trim();
  }

  return getRuntimeEnvValueFromGlobalScope(name)?.trim();
}
