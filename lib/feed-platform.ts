export const feedPlatformOptions = [
  "all",
  "indeed",
  "linkedin",
  "saramin",
  "jobkorea",
] as const;

export type FeedPlatform = (typeof feedPlatformOptions)[number];

export type PlatformMatchCandidate = {
  source?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  company?: string;
  title?: string;
  location?: string;
  descriptionRaw?: string;
  tags?: string[];
};

export const feedPlatformLabels: Record<FeedPlatform, string> = {
  all: "All",
  indeed: "Indeed",
  linkedin: "LinkedIn",
  saramin: "Saramin",
  jobkorea: "JobKorea",
};

const PLATFORM_MARKERS: Record<Exclude<FeedPlatform, "all">, string[]> = {
  indeed: ["indeed"],
  linkedin: ["linkedin"],
  saramin: ["saramin", "hiring.saramin", "jumpit.saramin", "saramin.co.kr"],
  jobkorea: ["jobkorea", "jobkorea.co.kr"],
};

export function parseFeedPlatform(value: string | null | undefined): FeedPlatform {
  if (!value) return "all";

  const normalized = value.trim().toLowerCase();
  return feedPlatformOptions.includes(normalized as FeedPlatform)
    ? (normalized as FeedPlatform)
    : "all";
}

function toSearchableText(candidate: PlatformMatchCandidate) {
  return [
    candidate.source,
    candidate.sourceLabel,
    candidate.sourceUrl,
    candidate.company,
    candidate.title,
    candidate.location,
    candidate.descriptionRaw,
    ...(candidate.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesFeedPlatform(
  candidate: PlatformMatchCandidate,
  platform: FeedPlatform,
) {
  if (platform === "all") return true;
  const searchable = toSearchableText(candidate);
  return PLATFORM_MARKERS[platform].some((marker) => searchable.includes(marker));
}
