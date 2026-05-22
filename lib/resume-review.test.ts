import { describe, expect, it } from "vitest";
import {
  extractResumeSkills,
  reviewResumeForJobs,
  type ResumeTargetJob,
} from "@/lib/resume-review";

const SAMPLE_JOBS: ResumeTargetJob[] = [
  {
    id: "job-1",
    company: "Northwind",
    title: "Frontend Engineer",
    status: "SAVE",
    extractedSkills: ["React", "TypeScript", "Accessibility"],
    fitScore: 88,
  },
  {
    id: "job-2",
    company: "Contoso",
    title: "QA Automation Engineer",
    status: "INTEREST",
    extractedSkills: ["Playwright", "Cypress"],
    fitScore: 72,
  },
];

describe("resume review", () => {
  it("extracts normalized skill labels from resume text", () => {
    const skills = extractResumeSkills(
      "Frontend engineer with react, typescript, next.js, and accessibility experience.",
    );

    expect(skills).toContain("React");
    expect(skills).toContain("TypeScript");
    expect(skills).toContain("Next.js");
  });

  it("scores matching jobs higher than non-matching jobs", () => {
    const result = reviewResumeForJobs({
      resumeText:
        "React TypeScript frontend engineer. Built accessible Next.js interfaces.",
      jobs: SAMPLE_JOBS,
    });

    expect(result.jobFits[0]?.jobId).toBe("job-1");
    expect(result.jobFits[0]?.score).toBeGreaterThan(result.jobFits[1]?.score ?? 0);
  });

  it("returns recommendations for missing required skills", () => {
    const result = reviewResumeForJobs({
      resumeText: "Frontend developer with React and TypeScript experience.",
      jobs: SAMPLE_JOBS,
    });

    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.join(" ")).toMatch(/Playwright|Cypress|metrics/i);
  });
});
