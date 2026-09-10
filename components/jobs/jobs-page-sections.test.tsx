// @vitest-environment jsdom
import { useState, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEmptyFeedDiagnostics } from "@/lib/feed-diagnostics";
import { JobsFiltersCard } from "./jobs-filters-card";
import { buildRows, buildSourceCounts } from "./jobs-page-utils";
import type { LocalJobPosting } from "@/lib/local-jobs";

const defaults: ComponentProps<typeof JobsFiltersCard>["filters"] = {
  q: "",
  status: "ALL",
  source: "ALL",
  remoteType: "ALL",
  minFit: "",
  requiredSkill: "",
  sortBy: "SMART",
};
const base: LocalJobPosting = {
  id: "1",
  title: "Frontend Engineer",
  company: "Acme",
  location: "Vancouver",
  source: "LINKEDIN",
  sourceUrl: "https://example.com/job",
  status: "NEW",
  remoteType: "HYBRID",
  descriptionRaw: "Build accessible interfaces",
  extractedSkills: ["React"],
  fitScore: 80,
  statusHistory: [],
  tags: [],
  notes: [],
  createdAt: "2026-09-10",
  updatedAt: "2026-09-10",
};
const jobs = [
  base,
  { ...base, id: "2", company: "Beta", status: "SAVE" as const },
];
function Harness() {
  const [filters, setFilters] = useState(defaults);
  const change = <K extends keyof typeof filters>(
    key: K,
    value: (typeof filters)[K],
  ) => setFilters((current) => ({ ...current, [key]: value }));
  const rows = buildRows(jobs, filters);
  return (
    <MantineProvider>
      <JobsFiltersCard
        filters={filters}
        actions={{
          setQ: (value) => change("q", value),
          setStatus: (value) => change("status", value),
          setSource: (value) => change("source", value),
          setRemoteType: (value) => change("remoteType", value),
          setMinFit: (value) => change("minFit", value),
          setRequiredSkill: (value) => change("requiredSkill", value),
          setSortBy: (value) => change("sortBy", value),
          resetFilters: () => setFilters(defaults),
        }}
        rowsCount={rows.length}
        totalJobs={jobs.length}
        lastSyncAt={null}
        feedGeneratedAt={null}
        syncMessage={null}
        syncError={null}
        syncDiagnostics={createEmptyFeedDiagnostics()}
        syncRecoveryGuide={[]}
        syncSourceResults={[]}
        sourceCounts={buildSourceCounts(jobs)}
      />
      <ul aria-label="Search results">
        {rows.map((row) => (
          <li key={row.id}>{row.company}</li>
        ))}
      </ul>
    </MantineProvider>
  );
}
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(cleanup);
it("keeps search outside the collapsed filters and updates results without submitting", () => {
  render(<Harness />);
  const search = screen.getByRole("searchbox", { name: "Search job postings" });
  expect(search.closest("#jobs-filters-panel")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Show Filters" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  fireEvent.change(search, { target: { value: "Acme accessible" } });
  expect(screen.getByRole("status").textContent).toBe(
    "Showing 1 of 2 postings",
  );
  expect(screen.getByRole("list", { name: "Search results" }).textContent).toBe(
    "Acme",
  );
  fireEvent.change(search, { target: { value: "no-match" } });
  expect(screen.getByRole("status").textContent).toBe(
    "Showing 0 of 2 postings",
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect((search as HTMLInputElement).value).toBe("");
  expect(screen.getByRole("status").textContent).toBe(
    "Showing 2 of 2 postings",
  );
});
it("combines search with filters and clears the query without clearing other filters", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Show Filters" }));
  fireEvent.change(screen.getByLabelText("Status"), {
    target: { value: "SAVE" },
  });
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Acme" },
  });
  expect(screen.getByRole("status").textContent).toBe(
    "Showing 0 of 2 postings",
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByRole("list", { name: "Search results" }).textContent).toBe(
    "Beta",
  );
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByRole("status").textContent).toBe(
    "Showing 2 of 2 postings",
  );
});
