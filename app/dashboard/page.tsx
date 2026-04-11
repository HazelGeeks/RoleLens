import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { FocusSkillChart, SkillBarChart, SourcePieChart } from "@/components/dashboard/charts";
import { getDashboardStats } from "@/lib/jobs";
import { prettifyEnum } from "@/lib/presentation";

export const dynamic = "force-dynamic";

function countMapToArray(input: Record<string, number>) {
  return Object.entries(input).map(([name, value]) => ({ name: prettifyEnum(name), value }));
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

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
