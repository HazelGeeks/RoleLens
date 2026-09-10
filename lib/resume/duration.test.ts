import { describe, expect, it } from "vitest";
import { formatResumeDuration, formatResumePeriod } from "./duration";

describe("resume duration", () => {
  it.each([
    ["2024-01", "2025-02", "1 year 2 months"],
    ["2026-01", "2026-03", "3 months"],
    ["2026-03", "2026-03", "1 month"],
    ["2024-01", "2024-12", "1 year"],
    ["2024-01", "2025-12", "2 years"],
    ["2024-01", "2025-01", "1 year 1 month"],
  ])("formats %s through %s as %s", (start, end, expected) => {
    expect(formatResumeDuration(start, end)).toBe(expected);
  });
  it("uses the current local month for ongoing entries", () => {
    expect(formatResumePeriod("2026-07", "", new Date(2026, 8, 10))).toBe(
      "2026-07 – Present (3 months)",
    );
  });
  it("appends the duration to the existing date range", () => {
    expect(formatResumePeriod("2024-01", "2025-02")).toBe(
      "2024-01 – 2025-02 (1 year 2 months)",
    );
  });
  it.each([
    ["", "2026-01"],
    ["2026-13", "2026-02"],
    ["2026-02", "2026-01"],
    ["2026-01", "invalid"],
  ])(
    "omits duration for incomplete or invalid dates: %s / %s",
    (start, end) => {
      expect(formatResumeDuration(start, end)).toBeNull();
      expect(formatResumePeriod(start, end)).not.toContain("(");
    },
  );
  it("does not display negative durations for future starts", () => {
    expect(
      formatResumeDuration("2027-01", "", new Date(2026, 8, 10)),
    ).toBeNull();
  });
});
