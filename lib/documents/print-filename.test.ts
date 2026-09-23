import { describe, expect, it } from "vitest";
import { toPrintFileName } from "./print-filename";

describe("toPrintFileName", () => {
  it("uses a safe document title as-is", () => {
    expect(toPrintFileName("Alex Kim - Frontend Engineer", "Resume")).toBe(
      "Alex Kim - Frontend Engineer",
    );
  });

  it("keeps readable Unicode such as Korean", () => {
    expect(toPrintFileName("홍길동 이력서 (2026)", "Resume")).toBe(
      "홍길동 이력서 (2026)",
    );
  });

  it("replaces characters that are illegal in file names", () => {
    expect(toPrintFileName('A/B\\C:D*E?F"G<H>I|J', "Resume")).toBe(
      "A B C D E F G H I J",
    );
  });

  it("collapses whitespace and strips trailing dots", () => {
    expect(toPrintFileName("  My   resume...  ", "Resume")).toBe("My resume");
  });

  it("falls back to the label when the title is blank", () => {
    expect(toPrintFileName("   ", "Resume")).toBe("Resume");
    expect(toPrintFileName("", "Cover Letter")).toBe("Cover Letter");
    expect(toPrintFileName("", "  ")).toBe("document");
  });

  it("caps long titles so the suggested name stays usable", () => {
    const long = `${"a".repeat(200)}`;
    const result = toPrintFileName(long, "Resume");
    expect(result).toBe("a".repeat(120));
  });
});
