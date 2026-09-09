import type { FeedImportError, FeedSourceResult } from "@/lib/feed-types";

export type FeedSyncAlert = {
  level: "warning" | "error";
  message: string;
};

export type FeedSyncHealthInput = {
  sourceCount: number;
  errors: FeedImportError[];
  sourceResults: FeedSourceResult[];
};

export function buildFeedSyncWarningFingerprint(
  input: FeedSyncHealthInput,
): string | null {
  const alert = buildFeedSyncAlert(input);
  if (alert?.level !== "warning") return null;

  const failedSources = input.sourceResults
    .filter((result) => !result.ok && !result.disabled)
    .map((result) => ({
      source: result.source,
      message: result.message || "",
    }))
    .sort((left, right) => {
      const sourceOrder = left.source.localeCompare(right.source);
      return sourceOrder !== 0
        ? sourceOrder
        : left.message.localeCompare(right.message);
    });

  return JSON.stringify(failedSources);
}

export function buildFeedSyncAlert(
  input: FeedSyncHealthInput,
): FeedSyncAlert | null {
  const configurationError = input.errors.find(
    (entry) => entry.source === "configuration" || entry.source === "postgres",
  );

  if (configurationError) {
    return {
      level: "error",
      message:
        "Job feeds are currently unavailable. Your saved postings are still available. Please try again later.",
    };
  }

  const failedSources = input.sourceResults.filter(
    (result) => !result.ok && !result.disabled,
  );
  if (failedSources.length === 0) {
    return null;
  }

  const failedNames = Array.from(
    new Set(
      failedSources.map((result) => {
        const name = result.source.replace(/^PythonScraper:/, "");
        return (
          /^(JobKorea|Wanted|Saramin|Indeed|LinkedIn)\b/.exec(name)?.[1] ?? name
        );
      }),
    ),
  ).join(", ");

  if (input.sourceCount > 0 && failedSources.length >= input.sourceCount) {
    return {
      level: "error",
      message:
        "Job feeds are currently unavailable. Your saved postings are still available. Please try again later.",
    };
  }

  return {
    level: "warning",
    message: `Some job sources are temporarily unavailable (${failedNames}). You can browse postings from other sources.`,
  };
}
