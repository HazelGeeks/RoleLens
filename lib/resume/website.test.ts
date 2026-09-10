import { describe, expect, it } from "vitest";
import { getResumeWebsiteHref } from "./website";

describe("resume website links", () => {
  it.each([
    ["portfolio.example.com", "https://portfolio.example.com/"],
    [" github.com/alex ", "https://github.com/alex"],
    [
      "https://example.com/work?lang=en#project",
      "https://example.com/work?lang=en#project",
    ],
    ["http://example.com", "http://example.com/"],
    ["//example.com", "https://example.com/"],
  ])("links %s as %s", (value, expected) => {
    expect(getResumeWebsiteHref(value)).toBe(expected);
  });
  it.each([
    "",
    "my portfolio",
    "unfinished",
    "javascript:alert(1)",
    "data:text/html,test",
    "mailto:a@example.com",
    "https://user:pass@example.com",
    "https://",
    "java\nscript:alert(1)",
  ])("keeps invalid or unsafe input as plain text: %s", (value) => {
    expect(getResumeWebsiteHref(value)).toBeNull();
  });
});
