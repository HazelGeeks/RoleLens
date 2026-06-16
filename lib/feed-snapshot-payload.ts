import type { FeedImportSnapshot } from "@/lib/feed-types";
import { buildFeedImportSnapshotFromImportedJobs } from "@/lib/feed-import";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseFeedSnapshotPayload(
  value: unknown,
): FeedImportSnapshot | null {
  if (!isRecord(value)) return null;
  if (typeof value.sourceCount !== "number") return null;
  if (!Array.isArray(value.jobs)) return null;
  if (!Array.isArray(value.errors)) return null;
  if (!Array.isArray(value.sourceResults)) return null;
  if (typeof value.generatedAt !== "string") return null;

  if (!isRecord(value.diagnostics) || !Array.isArray(value.recoveryGuide)) {
    return buildFeedImportSnapshotFromImportedJobs({
      generatedAt: value.generatedAt,
      sourceCount: value.sourceCount,
      jobs: value.jobs as FeedImportSnapshot["jobs"],
      errors: value.errors as FeedImportSnapshot["errors"],
      sourceResults: value.sourceResults as FeedImportSnapshot["sourceResults"],
    });
  }

  return value as FeedImportSnapshot;
}
