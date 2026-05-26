import {
  crawlAndSaveScrapedFeedSnapshot,
  type ScrapedFeedCrawlRun,
} from "@/lib/scraped-feed-crawler";
import { collectFeedJobs, writeFeedSnapshotToCache } from "@/lib/feed-import";
import { parseFeedPlatform } from "@/lib/feed-platform";

export const runtime = "edge";

const CRON_SECRET_HEADER = "x-cron-secret";

function parsePositiveInteger(value: string | null | undefined) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function shouldAutoCrawlScrapedFeed(url: URL) {
  const queryValue = url.searchParams.get("scrape")?.trim().toLowerCase();
  if (queryValue === "0" || queryValue === "false") {
    return false;
  }

  const flag = process.env.SCRAPED_FEED_AUTO_CRAWL?.trim().toLowerCase();
  if (flag === "0" || flag === "false") {
    return false;
  }

  const backend =
    process.env.PYTHON_SCRAPED_FEED_BACKEND?.trim().toLowerCase() || "d1";
  return backend === "d1";
}

function toScrapeSummary(result: ScrapedFeedCrawlRun) {
  return {
    ok: true,
    generatedAt: result.snapshot.generatedAt,
    importedAt: result.saved.importedAt,
    sourceCount: result.snapshot.sourceCount,
    jobCount: result.snapshot.jobs.length,
    errorCount: result.snapshot.errors.length,
    errors: result.snapshot.errors,
    sourceResults: result.snapshot.sourceResults,
  };
}

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return {
      ok: false as const,
      error: Response.json(
        {
          ok: false,
          message: "CRON_SECRET is not configured",
        },
        { status: 500 },
      ),
    };
  }

  const provided = request.headers.get(CRON_SECRET_HEADER);
  if (!provided || provided !== expected) {
    return {
      ok: false as const,
      error: Response.json(
        {
          ok: false,
          message: "Unauthorized",
        },
        { status: 401 },
      ),
    };
  }

  return { ok: true as const };
}

async function runCronImport(request: Request) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return auth.error;
  }

  const requestUrl = new URL(request.url);
  const platform = parseFeedPlatform(requestUrl.searchParams.get("platform"));

  let scrape:
    | ReturnType<typeof toScrapeSummary>
    | {
        ok: false;
        message: string;
      }
    | null = null;

  if (shouldAutoCrawlScrapedFeed(requestUrl)) {
    try {
      const crawlResult = await crawlAndSaveScrapedFeedSnapshot(
        {
          platform,
          timeoutSeconds: parsePositiveInteger(
            requestUrl.searchParams.get("timeoutSeconds"),
          ),
          limitPerSource: parsePositiveInteger(
            requestUrl.searchParams.get("limitPerSource"),
          ),
        },
        process.env,
      );
      scrape = toScrapeSummary(crawlResult);
    } catch (error) {
      const message =
        error instanceof Error
          ? `Scraped feed crawl failed: ${error.message}`
          : "Scraped feed crawl failed";
      scrape = {
        ok: false,
        message,
      };
    }
  }

  const snapshot = await collectFeedJobs(process.env, {
    requestUrl: request.url,
    platform,
  });
  if (platform === "all") {
    await writeFeedSnapshotToCache(request, snapshot);
  }

  return Response.json({
    ok: true,
    platform,
    generatedAt: snapshot.generatedAt,
    sourceCount: snapshot.sourceCount,
    importedJobs: snapshot.jobs.length,
    errors: snapshot.errors,
    sourceResults: snapshot.sourceResults,
    scrape,
  });
}

export async function POST(request: Request) {
  return runCronImport(request);
}

export async function GET() {
  return Response.json(
    {
      ok: false,
      message: "Method Not Allowed",
    },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    },
  );
}
