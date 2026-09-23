import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("./resume-page-client.module.css", import.meta.url),
  "utf8",
);

/** Extract the @media print block with balanced braces. */
function printBlock(): string {
  const start = css.indexOf("@media print");
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error("@media print block is not balanced");
}

describe("resume print CSS", () => {
  it("neutralizes entrance animations so Firefox does not print a blank page", () => {
    const block = printBlock().replace(/\s+/g, " ");
    // The app frame fades main in from opacity: 0; without this reset
    // Firefox snapshots the unstarted state and prints nothing.
    // Bare selectors keep the reset working regardless of module hashing.
    expect(block).toMatch(/\bmain\b[^{]*\{[^}]*animation: none/);
    expect(block).toContain("animation: none");
    expect(block).toContain("transition: none");
  });

  it("keeps the preview zoom override so the paper prints full-size", () => {
    expect(printBlock().replace(/\s+/g, " ")).toContain("zoom: 1");
  });

  it("does not hide content with the old visibility technique", () => {
    expect(printBlock()).not.toContain("visibility: hidden");
  });

  it("uses only pure selectors so the production build passes", () => {
    // Turbopack rejects CSS-module selectors without a local class or id
    // ("Selector X is not pure"), which fails `next build` and deployment.
    const withoutGlobals = css.replace(/:global\([^()]*\)/g, "");
    for (const match of withoutGlobals.matchAll(/([^{}]+)\{/g)) {
      const prelude = match[1].trim();
      if (
        !prelude ||
        prelude.startsWith("@") ||
        prelude === "from" ||
        prelude === "to"
      )
        continue;
      for (const selector of prelude.split(",")) {
        expect(selector.trim()).toMatch(/[.#][\w-]/);
      }
    }
  });
});
