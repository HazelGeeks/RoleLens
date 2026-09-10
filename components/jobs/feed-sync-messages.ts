import { feedPlatformLabels, type FeedPlatform } from "@/lib/feed-platform";
import type { FeedSyncSummary } from "@/lib/feed-sync";

type FeedSyncFailure = {
  error: string | null;
  message?: string;
  toast?: string;
};

function importedPostingsLabel(summary: FeedSyncSummary): string {
  const rawImported = summary.sourceResults.reduce(
    (total, result) => total + (result.ok ? result.importedJobs : 0),
    0,
  );
  const prefix =
    rawImported > summary.totalImported
      ? `${rawImported} raw scraped postings matched to `
      : "";
  return `${prefix}${summary.totalImported} postings`;
}

export function buildSyncSuccessMessage(
  summary: FeedSyncSummary,
  platform: FeedPlatform,
): string {
  const target =
    platform === "all" ? "all feeds" : `${feedPlatformLabels[platform]} feed`;
  return `Synced ${importedPostingsLabel(summary)} (${summary.added} new, ${summary.updated} updated) from ${target} using ${summary.importedSourceCount} source(s) at ${new Date(summary.syncedAt).toLocaleString()}.`;
}

export function buildLastSyncMessage(summary: FeedSyncSummary): string {
  return `Last sync imported ${importedPostingsLabel(summary)} from ${summary.importedSourceCount} source(s).`;
}

/** Optional fields leave the existing message/toast unchanged. */
export function describeSyncFailure(cause: unknown): FeedSyncFailure {
  const message =
    cause instanceof Error ? cause.message : "Failed to sync crawled feed";
  const persistenceMarker = "failed to write DB";
  if (message.includes(persistenceMarker)) {
    const detail = message
      .slice(
        message.toLowerCase().indexOf(persistenceMarker.toLowerCase()) +
          persistenceMarker.length,
      )
      .replace(/^[:\s]+/, "");
    return {
      message:
        "Feed data was imported locally, but server persistence sync is currently unavailable.",
      toast:
        "Local import succeeded. Cross-device persistence sync failed; check Hyperdrive binding, Supabase migrations, and auth.",
      error: detail
        ? `Persistence sync failed: ${detail}`
        : "Persistence sync failed while writing to the server database.",
    };
  }
  if (message.includes("Rate limit exceeded")) {
    return {
      error: null,
      toast: "Sync is temporarily rate-limited. Please wait and retry.",
    };
  }
  if (message.includes("status 401") || message.includes("Login required")) {
    return {
      error: null,
      toast: "Login required. Please sign in and retry sync.",
    };
  }
  if (
    message.includes("Admin access required") ||
    message.includes("Sync admin emails are not configured") ||
    message.includes("status 403")
  ) {
    return {
      error: null,
      toast: "Admin access is required to sync feeds.",
      message:
        "Manual sync is restricted to configured admin accounts on this deployment.",
    };
  }
  const detail = message.endsWith(".") ? message.slice(0, -1) : message;
  return {
    error: `${detail}. Recovery: verify the Postgres feed snapshot ingestion, then retry sync.`,
  };
}
