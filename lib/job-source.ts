import { sourceLabels } from "@/lib/constants";
import type { JobSource } from "@/lib/local-jobs";

const sourceHostLabels: Array<[marker: string, label: string]> = [
  ["linkedin.com", "LinkedIn"],
  ["indeed.", "Indeed"],
  ["saramin.co.kr", "Saramin"],
  ["jobkorea.co.kr", "JobKorea"],
  ["wanted.co.kr", "Wanted"],
  ["rocketpunch.com", "RocketPunch"],
  ["rememberapp.co.kr", "Remember"],
  ["weworkremotely.com", "We Work Remotely"],
  ["remoteok.com", "Remote OK"],
  ["remotive.com", "Remotive"],
];

function parseHttpUrl(sourceUrl: string | undefined) {
  if (!sourceUrl) return null;

  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getJobSourceDisplay(
  source: JobSource,
  sourceUrl: string | undefined,
) {
  const parsedUrl = parseHttpUrl(sourceUrl);
  const hostname = parsedUrl?.hostname.toLowerCase().replace(/^www\./, "");
  const matchedSource = hostname
    ? sourceHostLabels.find(([marker]) => hostname.includes(marker))
    : undefined;

  return {
    label:
      matchedSource?.[1] ||
      (source === "MANUAL" && hostname ? hostname : sourceLabels[source]),
    href: parsedUrl?.toString(),
  };
}
