import type { FeedImportSnapshot } from "@/lib/feed-types";

const SNAPSHOT_CACHE_PATH = "/api/jobs/import/snapshot-cache";
const FEED_CACHE_NAME = "rolelens-feed-snapshot";
const SNAPSHOT_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

function cacheKeyFromRequest(request: Request) {
  return new Request(new URL(SNAPSHOT_CACHE_PATH, request.url).toString(), {
    method: "GET",
  });
}

async function getFeedCache() {
  if (typeof caches === "undefined") return null;

  try {
    return await caches.open(FEED_CACHE_NAME);
  } catch {
    return null;
  }
}

function isFreshFeedSnapshot(snapshot: FeedImportSnapshot) {
  const generatedAt = new Date(snapshot.generatedAt).getTime();
  if (!Number.isFinite(generatedAt)) return false;
  return Date.now() - generatedAt <= SNAPSHOT_CACHE_MAX_AGE_MS;
}

export async function readFeedSnapshotFromCache(
  request: Request,
): Promise<FeedImportSnapshot | null> {
  const cache = await getFeedCache();
  if (!cache) return null;

  try {
    const cached = await cache.match(cacheKeyFromRequest(request));
    if (!cached) return null;
    const snapshot = (await cached.json()) as FeedImportSnapshot;
    return isFreshFeedSnapshot(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

export async function writeFeedSnapshotToCache(
  request: Request,
  snapshot: FeedImportSnapshot,
) {
  const cache = await getFeedCache();
  if (!cache) return;

  try {
    await cache.put(
      cacheKeyFromRequest(request),
      new Response(JSON.stringify(snapshot), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, s-maxage=43200",
        },
      }),
    );
  } catch {
    // Ignore cache failures. Import still succeeds with direct response.
  }
}
