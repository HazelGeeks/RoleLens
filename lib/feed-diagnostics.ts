import type { FeedImportDiagnostics } from "@/lib/feed-types";

/** Return independent defaults so one snapshot cannot mutate another. */
export function createEmptyFeedDiagnostics(): FeedImportDiagnostics {
  return {
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
  };
}
