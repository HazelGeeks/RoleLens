import { describe, expect, it } from "vitest";
import { formatJobDescriptionForDisplay } from "@/lib/job-description";

describe("job description formatting", () => {
  it("formats markdown-like scraped descriptions for readable display", () => {
    const formatted = formatJobDescriptionForDisplay(
      "**DESCRIPTION** --------------- As a Software Engineer on the Data Intelligence team which is part of Amazon Customer Service (CS) team, you will design and build robust, secure data infrastructure systems. You'll architect for real\\-time data processing needs, implement secure storage solutions, and develop privacy\\-compliant data access layers. Additionally, you'll build infrastructure that supports the complete lifecycle of Artificial Intelligence (AI) models \\- from development to production deployment. You’ll work with cross\\-functional teams (e.g., scientists, product managers, data engineers) to create enterprise\\-scale data processing systems that handle high\\-volume transactions, implement comprehensive data governance frameworks, and build scalable data products that power critical business capabilities.",
    );

    expect(formatted).toMatch(/^As a Software Engineer/);
    expect(formatted).not.toContain("DESCRIPTION");
    expect(formatted).toContain("real-time data processing");
    expect(formatted).toContain("cross-functional teams");
    expect(formatted).not.toContain("---------------");
    expect(formatted.split("\n\n").length).toBeGreaterThan(2);
  });

  it("keeps unavailable scraped-link placeholders hidden", () => {
    expect(
      formatJobDescriptionForDisplay(
        "Scraped link from https://www.linkedin.com/jobs/search/?keywords=software%20engineer",
      ),
    ).toBe("");
  });
});
