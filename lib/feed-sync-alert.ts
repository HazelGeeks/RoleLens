import type { FeedImportError, FeedSourceResult } from "@/lib/feed-types";

export type FeedSyncAlert = {
  level: "warning" | "error";
  message: string;
};

type FeedSyncHealthInput = {
  sourceCount: number;
  errors: FeedImportError[];
  sourceResults: FeedSourceResult[];
};

export function buildFeedSyncAlert(
  input: FeedSyncHealthInput,
): FeedSyncAlert | null {
  const configurationError = input.errors.find(
    (entry) => entry.source === "configuration",
  );

  if (configurationError) {
    return {
      level: "error",
      message:
        "No valid feed source is configured. In production, run the Python Scrape Now workflow so it ingests the latest crawler output into D1. For local direct-feed debugging, set PYTHON_SCRAPED_FEED_URL in .env.local, restart, then retry sync.",
    };
  }

  const failedSources = input.sourceResults.filter((result) => !result.ok);
  if (failedSources.length === 0) {
    return null;
  }

  const failedNames = failedSources.map((result) => result.source).join(", ");

  if (input.sourceCount > 0 && failedSources.length >= input.sourceCount) {
    return {
      level: "error",
      message: `Sync failed for all configured sources (${failedNames}). Check source URLs, credentials, and endpoint availability.`,
    };
  }

  return {
    level: "warning",
    message: `Partial sync completed. Failed source(s): ${failedNames}. Data from healthy sources was imported.`,
  };
}
