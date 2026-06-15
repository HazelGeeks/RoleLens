import type { FeedImportSnapshot } from "@/lib/feed-types";
import {
  type FeedPlatform,
  matchesFeedPlatform,
  parseFeedPlatform,
} from "@/lib/feed-platform";

const D1_RECOVERY_GUIDE = [
  "Post a normalized feed snapshot to /api/jobs/ingest so D1 stores the latest snapshot.",
  "Confirm the ingest client uses CRON_SECRET or SYNC_ADMIN_SECRET for D1 ingestion.",
  "Confirm D1 migrations are applied and feed_import_snapshots exists.",
  "Call /api/jobs/import, then retry Sync All Feeds in the Jobs page.",
];

export function buildMissingD1FeedSnapshot(): FeedImportSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    sourceCount: 0,
    importedSourceCount: 0,
    jobs: [],
    errors: [
      {
        source: "d1",
        message:
          "No D1-ingested feed snapshot is available. Ingest a feed snapshot into D1 first.",
      },
    ],
    sourceResults: [],
    diagnostics: {
      ats: {
        greenhouseBoardCount: 0,
        leverCompanyCount: 0,
        ashbyOrganizationCount: 0,
        smartRecruitersCompanyCount: 0,
        configuredSourceCount: 0,
      },
      rss: {
        linkedinConfigured: false,
        indeedConfigured: false,
        thirdConfigured: false,
        configuredSourceCount: 0,
      },
      python: {
        scrapedFeedConfigured: false,
        configuredSourceCount: 0,
      },
      sourceCount: 0,
    },
    recoveryGuide: D1_RECOVERY_GUIDE,
  };
}

export function filterFeedSnapshotByPlatform(
  snapshot: FeedImportSnapshot,
  inputPlatform: FeedPlatform | string | null | undefined,
): FeedImportSnapshot {
  const platform = parseFeedPlatform(inputPlatform);
  if (platform === "all") return snapshot;

  const jobs = snapshot.jobs.filter((job) => matchesFeedPlatform(job, platform));
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
