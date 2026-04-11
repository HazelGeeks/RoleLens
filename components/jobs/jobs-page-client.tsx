"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { JobsTable, type JobRow } from "@/components/jobs/jobs-table";
import { getJobsFromStorage, type JobStatus, type JobSource } from "@/lib/local-jobs";
import { sourceLabels, sourceOptions, statusLabels, statusOptions } from "@/lib/constants";

export function JobsPageClient() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<JobStatus | "ALL">("ALL");
  const [source, setSource] = useState<JobSource | "ALL">("ALL");

  const rows = useMemo(() => {
    const jobs = getJobsFromStorage();
    return jobs
      .filter((job) => (status === "ALL" ? true : job.status === status))
      .filter((job) => (source === "ALL" ? true : job.source === source))
      .filter((job) => {
        if (!q.trim()) return true;
        const value = q.toLowerCase();
        return [job.title, job.company, job.location || "", job.extractedSkills.join(" ")].join(" ").toLowerCase().includes(value);
      })
      .map(
        (job): JobRow => ({
          id: job.id,
          company: job.company,
          title: job.title,
          location: job.location || null,
          source: job.source,
          status: job.status,
          fitScore: job.fitScore,
          salaryMin: job.salaryMin || null,
          salaryMax: job.salaryMax || null,
          salaryCurrency: job.salaryCurrency || null,
          extractedSkills: job.extractedSkills,
          createdAt: job.createdAt,
        }),
      );
  }, [q, status, source]);

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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_180px]">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, company, location, skills" />
          <Select value={status} onChange={(e) => setStatus(e.target.value as JobStatus | "ALL")}>
            <option value="ALL">All Status</option>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </Select>
          <Select value={source} onChange={(e) => setSource(e.target.value as JobSource | "ALL")}>
            <option value="ALL">All Source</option>
            {sourceOptions.map((value) => (
              <option key={value} value={value}>
                {sourceLabels[value]}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card>
        <JobsTable data={rows} />
      </Card>
    </div>
  );
}
