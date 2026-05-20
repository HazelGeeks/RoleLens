import scrapedSnapshot from "@/data/scraped/python-scraped-jobs.json";

export const runtime = "edge";

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  if (!value || typeof value !== "object") return null;
  return value as RecordValue;
}

export function GET() {
  const root = asRecord(scrapedSnapshot);
  if (!root) {
    return Response.json(
      { message: "Invalid local scraped feed payload." },
      { status: 500 },
    );
  }

  const jobs = Array.isArray(root.jobs) ? root.jobs : [];
  return Response.json({ jobs });
}
