"use client";

import { useMemo } from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { FocusSkillChart, SkillBarChart, SourcePieChart } from "@/components/dashboard/charts";
import { getJobsFromStorage } from "@/lib/local-jobs";
import { prettifyEnum } from "@/lib/presentation";

function countMapToArray(input: Record<string, number>) {
  return Object.entries(input).map(([name, value]) => ({ name: prettifyEnum(name), value }));
}

export function DashboardClient() {
  const stats = useMemo(() => {
    const jobs = getJobsFromStorage();

    const statusCounts = jobs.reduce<Record<string, number>>((acc, job) => {
      acc[job.status] = (acc[job.status] ?? 0) + 1;
      return acc;
    }, {});

    const sourceCounts = jobs.reduce<Record<string, number>>((acc, job) => {
      acc[job.source] = (acc[job.source] ?? 0) + 1;
      return acc;
    }, {});

    const remoteCounts = jobs.reduce<Record<string, number>>((acc, job) => {
      acc[job.remoteType] = (acc[job.remoteType] ?? 0) + 1;
      return acc;
    }, {});

    const seniorityCounts = jobs.reduce<Record<string, number>>((acc, job) => {
      const key = job.seniority || "Unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const skillCounts = jobs.reduce<Record<string, number>>((acc, job) => {
      for (const skill of job.extractedSkills) {
        const key = skill.toLowerCase();
        acc[key] = (acc[key] ?? 0) + 1;
      }
      return acc;
    }, {});

    const topSkills = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const focusSkills = ["react", "typescript", "next.js"].map((skill) => ({ name: skill, count: skillCounts[skill] ?? 0 }));
    const avgFitScore =
      jobs.filter((job) => typeof job.fitScore === "number").reduce((sum, job) => sum + (job.fitScore ?? 0), 0) /
      (jobs.filter((job) => typeof job.fitScore === "number").length || 1);

    return {
      totalJobs: jobs.length,
      avgFitScore: Math.round(avgFitScore),
      statusCounts,
      sourceCounts,
      remoteCounts,
      seniorityCounts,
      topSkills,
      focusSkills,
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Analytics Dashboard</h2>
        <p className="text-sm text-slate-500">Monitor application momentum and demand signals from your saved postings.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          <p className="text-3xl font-semibold">{stats.focusSkills.find((s) => s.name === "react")?.count ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">TypeScript Postings</p>
          <p className="text-3xl font-semibold">{stats.focusSkills.find((s) => s.name === "typescript")?.count ?? 0}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Top Skills</CardTitle>
          <CardDescription>Most frequent skill keywords across saved postings.</CardDescription>
          <SkillBarChart data={stats.topSkills} />
        </Card>
        <Card>
          <CardTitle>Source Distribution</CardTitle>
          <CardDescription>Where your job opportunities come from.</CardDescription>
          <SourcePieChart data={countMapToArray(stats.sourceCounts)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardTitle>Focus Skill Frequency</CardTitle>
          <FocusSkillChart data={stats.focusSkills} />
        </Card>
        <Card>
          <CardTitle>Remote / Hybrid / On-site</CardTitle>
          <div className="space-y-2 pt-2">
            {countMapToArray(stats.remoteCounts).map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800">
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
              <div key={item.name} className="flex items-center justify-between rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800">
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
