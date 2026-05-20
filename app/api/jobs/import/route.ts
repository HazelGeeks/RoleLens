import {
  collectFeedJobs,
  readFeedSnapshotFromCache,
  writeFeedSnapshotToCache,
} from "@/lib/feed-import";
import { parseFeedPlatform } from "@/lib/feed-platform";

export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const platform = parseFeedPlatform(url.searchParams.get("platform"));
  const platformScoped = platform !== "all";

  if (!refresh && !platformScoped) {
    const cached = await readFeedSnapshotFromCache(request);
    if (cached) {
      return Response.json({
        ...cached,
        cached: true,
        platform,
      });
    }
  }

  const snapshot = await collectFeedJobs(process.env, {
    requestUrl: request.url,
    platform,
  });

  if (!platformScoped) {
    await writeFeedSnapshotToCache(request, snapshot);
  }

  return Response.json({
    ...snapshot,
    cached: false,
    platform,
  });
}
