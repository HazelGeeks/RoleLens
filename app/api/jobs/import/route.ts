import {
  collectFeedJobs,
  readFeedSnapshotFromCache,
  writeFeedSnapshotToCache,
} from "@/lib/feed-import";

export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";

  if (!refresh) {
    const cached = await readFeedSnapshotFromCache(request);
    if (cached) {
      return Response.json({
        ...cached,
        cached: true,
      });
    }
  }

  const snapshot = await collectFeedJobs(process.env);
  await writeFeedSnapshotToCache(request, snapshot);

  return Response.json({
    ...snapshot,
    cached: false,
  });
}
