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

const searchFilters = {
  q: "",
  status: "ALL",
  source: "ALL",
  remoteType: "ALL",
  minFit: "",
  requiredSkill: "",
  sortBy: "SMART",
} as const;

describe("job posting search", () => {
  it.each([
    " frontend ",
    "EXAMPLE",
    "vancouver",
    "react",
    "web products",
    "REACT   canada",
    "Canada\tFrontend",
    "Ｆｒｏｎｔｅｎｄ",
  ])("finds postings for %j", (q) => {
    expect(buildRows([importedJob], { ...searchFilters, q })).toHaveLength(1);
  });
  it("supports Korean text and finds terms across fields", () => {
    const job = {
      ...importedJob,
      company: "서울테크",
      descriptionRaw: "접근성 개선 및 웹 개발",
    };
    expect(
      buildRows([job], { ...searchFilters, q: "서울테크 접근성" }),
    ).toHaveLength(1);
  });
  it("returns no results when any search word is missing", () => {
    expect(
      buildRows([importedJob], { ...searchFilters, q: "React Python" }),
    ).toEqual([]);
  });
  it("treats whitespace as empty and keeps the other filters applied", () => {
    const jobs = [
      importedJob,
      { ...importedJob, id: "other", source: "MANUAL" as const },
    ];
    expect(
      buildRows(jobs, { ...searchFilters, q: " \t ", source: "LINKEDIN" }).map(
        (job) => job.id,
      ),
    ).toEqual(["job-1"]);
    expect(
      buildRows(jobs, { ...searchFilters, q: "react", status: "SAVE" }),
    ).toEqual([]);
    expect(
      buildRows(jobs, { ...searchFilters, q: "react", remoteType: "REMOTE" }),
    ).toEqual([]);
  });
});
