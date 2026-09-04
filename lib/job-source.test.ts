import { describe, expect, it } from "vitest";
import { getJobSourceDisplay } from "@/lib/job-source";

describe("getJobSourceDisplay", () => {
  it("uses the posting domain to identify manually categorized sources", () => {
    expect(
      getJobSourceDisplay("MANUAL", "https://remoteok.com/remote-jobs/123"),
    ).toEqual({
      label: "Remote OK",
      href: "https://remoteok.com/remote-jobs/123",
    });
  });

  it("falls back to the normalized source when no URL is available", () => {
    expect(getJobSourceDisplay("LINKEDIN", undefined)).toEqual({
      label: "LinkedIn",
      href: undefined,
    });
  });

  it("does not turn non-HTTP values into links", () => {
    expect(getJobSourceDisplay("MANUAL", "javascript:alert(1)")).toEqual({
      label: "Manual",
      href: undefined,
    });
  });
});
