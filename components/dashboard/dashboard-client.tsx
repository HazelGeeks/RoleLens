"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  FocusSkillChart,
  SkillBarChart,
  SourcePieChart,
} from "@/components/dashboard/charts";
import { prettifyEnum } from "@/lib/presentation";
import { statusLabels } from "@/lib/constants";
import { useLiveLocalJobs } from "@/lib/use-live-local-jobs";

function countMapToArray(input: Record<string, number>) {
  return Object.entries(input).map(([name, value]) => ({
    name: prettifyEnum(name),
    value,
  }));
}

export function DashboardClient() {
  const { jobs } = useLiveLocalJobs();

  const stats = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    const remoteCounts: Record<string, number> = {};
    const seniorityCounts: Record<string, number> = {};
    const skillCounts: Record<string, number> = {};

    let fitScoreTotal = 0;
    let fitScoreCount = 0;
    let dueFollowUps = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const job of jobs) {
      statusCounts[job.status] = (statusCounts[job.status] ?? 0) + 1;
      sourceCounts[job.source] = (sourceCounts[job.source] ?? 0) + 1;
      remoteCounts[job.remoteType] = (remoteCounts[job.remoteType] ?? 0) + 1;

      const seniorityKey = job.seniority || "Unknown";
      seniorityCounts[seniorityKey] = (seniorityCounts[seniorityKey] ?? 0) + 1;

      for (const skill of job.extractedSkills) {
        const key = skill.toLowerCase();
        skillCounts[key] = (skillCounts[key] ?? 0) + 1;
      }

      if (typeof job.fitScore === "number") {
        fitScoreTotal += job.fitScore;
        fitScoreCount += 1;
      }

      if (
        job.followUpDate &&
        job.followUpDate <= today &&
        job.status !== "REJECTED" &&
        job.status !== "WITHDRAWN" &&
        job.status !== "CLOSED"
      ) {
        dueFollowUps += 1;
      }
    }

    const topSkills = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const focusSkills = ["react", "typescript", "next.js"].map((skill) => ({
      name: skill,
      count: skillCounts[skill] ?? 0,
    }));
    const avgFitScore = fitScoreCount > 0 ? fitScoreTotal / fitScoreCount : 0;

    const readyToApply = statusCounts.READY_TO_APPLY ?? 0;
    const activePipeline =
      (statusCounts.APPLIED ?? 0) +
      (statusCounts.INTERVIEW_PENDING ?? 0) +
      (statusCounts.INTERVIEWING ?? 0) +
      (statusCounts.OFFER ?? 0);

    return {
      totalJobs: jobs.length,
      avgFitScore: Math.round(avgFitScore),
      dueFollowUps,
      readyToApply,
      activePipeline,
      statusCounts,
      sourceCounts,
      remoteCounts,
      seniorityCounts,
      topSkills,
      focusSkills,
    };
  }, [jobs]);

  if (jobs.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Analytics Dashboard</h2>
          <p className="text-sm text-slate-500">
            Monitor application momentum and demand signals from your saved
            postings.
          </p>
        </div>

        <Card className="space-y-3" role="status" aria-live="polite">
          <CardTitle>No data to analyze yet</CardTitle>
          <CardDescription>
            Save your first posting or run source sync. Dashboard metrics update
            automatically after data changes.
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <Link href="/jobs/new">
              <Button>Save New Posting</Button>
            </Link>
            <Link href="/">
              <Button variant="secondary">Open Jobs List</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Analytics Dashboard</h2>
        <p className="text-sm text-slate-500">
          Monitor application momentum and demand signals from your saved
          postings.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Card>
          <p className="text-sm text-slate-500">Total Postings</p>
          <p className="text-3xl font-semibold">{stats.totalJobs}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Average Fit</p>
          <p className="text-3xl font-semibold">{stats.avgFitScore}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">React Postings</p>
          <p className="text-3xl font-semibold">
            {stats.focusSkills.find((s) => s.name === "react")?.count ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">TypeScript Postings</p>
          <p className="text-3xl font-semibold">
            {stats.focusSkills.find((s) => s.name === "typescript")?.count ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Ready To Apply</p>
          <p className="text-3xl font-semibold">{stats.readyToApply}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Follow-ups Due</p>
          <p className="text-3xl font-semibold">{stats.dueFollowUps}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Top Skills</CardTitle>
          <CardDescription>
            Most frequent skill keywords across saved postings.
          </CardDescription>
          <SkillBarChart data={stats.topSkills} />
        </Card>
        <Card>
          <CardTitle>Source Distribution</CardTitle>
          <CardDescription>
            Where your job opportunities come from.
          </CardDescription>
          <SourcePieChart data={countMapToArray(stats.sourceCounts)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardTitle>Focus Skill Frequency</CardTitle>
          <FocusSkillChart data={stats.focusSkills} />
        </Card>
        <Card>
          <CardTitle>Status Pipeline</CardTitle>
          <CardDescription>
            Track execution flow from review to offer.
          </CardDescription>
          <div className="space-y-2 pt-2">
            {Object.entries(stats.statusCounts).map(([status, value]) => (
              <div
                key={status}
                className="flex items-center justify-between rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800"
              >
                <span>{statusLabels[status as keyof typeof statusLabels]}</span>
                <span className="font-semibold">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-2 text-sm dark:border-blue-900 dark:bg-blue-950/40">
              <span>Applied + Interview + Offer</span>
              <span className="font-semibold">{stats.activePipeline}</span>
            </div>
          </div>
        </Card>
        <Card>
          <CardTitle>Remote / Hybrid / On-site</CardTitle>
          <div className="space-y-2 pt-2">
            {countMapToArray(stats.remoteCounts).map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800"
              >
                <span>{item.name}</span>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle>Seniority Distribution</CardTitle>
          <div className="space-y-2 pt-2">
            {countMapToArray(stats.seniorityCounts).map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800"
              >
                <span>{item.name}</span>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
