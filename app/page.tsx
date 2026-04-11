import Link from "next/link";
import { listJobs } from "@/lib/jobs";
import { Card } from "@/components/ui/card";
import { JobsTable, type JobRow } from "@/components/jobs/jobs-table";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { sourceLabels, sourceOptions, statusLabels, statusOptions } from "@/lib/constants";
import type { JobListFilters } from "@/lib/jobs";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  status?: string;
  source?: string;
  remoteType?: string;
};

function getSafeStatus(status?: string): JobListFilters["status"] {
  if (!status) return "ALL";
  if (statusOptions.includes(status as (typeof statusOptions)[number])) {
    return status as (typeof statusOptions)[number];
  }
  return "ALL";
}

function getSafeSource(source?: string): JobListFilters["source"] {
  if (!source) return "ALL";
  if (sourceOptions.includes(source as (typeof sourceOptions)[number])) {
    return source as (typeof sourceOptions)[number];
  }
  return "ALL";
}

function toRows(data: Awaited<ReturnType<typeof listJobs>>): JobRow[] {
  return data.map((job) => ({
    id: job.id,
    company: job.company,
    title: job.title,
    location: job.location,
    source: job.source,
    status: job.status,
    fitScore: job.fitScore,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    extractedSkills: job.extractedSkills,
    createdAt: job.createdAt.toISOString(),
  }));
}

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const safeStatus = getSafeStatus(params.status);
  const safeSource = getSafeSource(params.source);

  const jobs = await listJobs({
    q: params.q,
    status: safeStatus,
    source: safeSource,
  });

  const rows = toRows(jobs);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Job Postings</h2>
          <p className="text-sm text-slate-500">Search, filter, sort, and track your frontend application pipeline.</p>
        </div>
        <Link href="/jobs/new">
          <Button>Save New Posting</Button>
        </Link>
      </header>

      <Card>
        <form className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
          <Input name="q" defaultValue={params.q || ""} placeholder="Search title, company, location, skills" />
          <Select name="status" defaultValue={safeStatus}>
            <option value="ALL">All Status</option>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </Select>
          <Select name="source" defaultValue={safeSource}>
            <option value="ALL">All Source</option>
            {sourceOptions.map((value) => (
              <option key={value} value={value}>
                {sourceLabels[value]}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Apply Filters
          </Button>
        </form>
      </Card>

      <Card>
        <JobsTable data={rows} />
      </Card>
    </div>
  );
}
