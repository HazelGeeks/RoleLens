import { createEmptyFeedDiagnostics } from "@/lib/feed-diagnostics";
import type { FeedImportSnapshot } from "@/lib/feed-types";
import {
  type FeedPlatform,
  matchesFeedPlatform,
  parseFeedPlatform,
} from "@/lib/feed-platform";

const DATABASE_RECOVERY_GUIDE = [
  "Post a normalized feed snapshot to /api/jobs/ingest so Supabase stores the latest snapshot.",
  "Confirm the ingest client uses CRON_SECRET or SYNC_ADMIN_SECRET for Supabase ingestion.",
  "Confirm Supabase migrations are applied and feed_import_snapshots exists.",
  "Call /api/jobs/import, then retry Sync All Feeds in the Jobs page.",
];

export function buildMissingDatabaseFeedSnapshot(): FeedImportSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    sourceCount: 0,
    importedSourceCount: 0,
    jobs: [],
    errors: [
      {
        source: "postgres",
        message:
          "No Postgres-ingested feed snapshot is available. Ingest a feed snapshot into Supabase Postgres first.",
      },
    ],
    sourceResults: [],
    diagnostics: createEmptyFeedDiagnostics(),
    recoveryGuide: DATABASE_RECOVERY_GUIDE,
  };
}

export function filterFeedSnapshotByPlatform(
  snapshot: FeedImportSnapshot,
  inputPlatform: FeedPlatform | string | null | undefined,
): FeedImportSnapshot {
  const platform = parseFeedPlatform(inputPlatform);
  if (platform === "all") return snapshot;

  const jobs = snapshot.jobs.filter((job) =>
    matchesFeedPlatform(job, platform),
  );
  const importedSourceCount = new Set(
    jobs.map((job) => job.sourceLabel || job.source),
  ).size;

  return {
    ...snapshot,
    importedSourceCount,
    jobs,
    sourceResults: snapshot.sourceResults
      .map((result) => {
        const importedJobs = jobs.filter(
          (job) => (job.sourceLabel || job.source) === result.source,
        ).length;
        return {
          ...result,
          importedJobs,
          message: `Platform filter (${platform}): ${importedJobs}/${result.importedJobs}`,
        };
      })
      .filter((result) => result.importedJobs > 0 || !result.ok),
  };
}
