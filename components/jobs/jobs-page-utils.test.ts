import { describe, expect, it } from "vitest";
import { buildRows } from "@/components/jobs/jobs-page-utils";
import type { LocalJobPosting } from "@/lib/local-jobs";

const importedJob: LocalJobPosting = {
  id: "job-1",
  source: "LINKEDIN",
  sourceUrl: "https://www.linkedin.com/jobs/view/123",
  company: "Example Co.",
  title: "Frontend Engineer",
  location: "Vancouver, Canada",
  remoteType: "HYBRID",
  descriptionRaw: "Build web products with React.",
  extractedSkills: ["React"],
  fitScore: 82,
  status: "NEW",
  statusHistory: [],
  tags: ["python-scraper"],
  notes: [],
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T00:00:00.000Z",
};

describe("buildRows", () => {
  it("preserves the source and original posting URL for the jobs list", () => {
    const rows = buildRows([importedJob], {
      q: "",
      status: "ALL",
      source: "ALL",
      remoteType: "ALL",
      minFit: "",
      requiredSkill: "",
      sortBy: "SMART",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "LINKEDIN",
      sourceUrl: "https://www.linkedin.com/jobs/view/123",
    });
  });
});
