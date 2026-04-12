import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { NewJobClient } from "@/components/jobs/new-job-client";

export const runtime = "edge";

export default function NewJobPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Save Job Posting</h2>
        <p className="text-sm text-slate-500">
          Paste URL and description text, auto-fill key fields, then review fit
          score and follow-up plan.
        </p>
      </div>
      <Card>
        <CardTitle>Posting Details</CardTitle>
        <CardDescription className="mb-4">
          Prioritize readability, information density, and automation for daily
          job search execution.
        </CardDescription>
        <NewJobClient />
      </Card>
    </div>
  );
}
