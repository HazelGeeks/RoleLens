import Link from "next/link";
import { notFound } from "next/navigation";
import { getJobById } from "@/lib/jobs";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { AddNoteForm } from "@/components/jobs/add-note-form";
import { StatusUpdateForm } from "@/components/jobs/status-update-form";
import { formatCurrency, prettifyEnum, statusBadgeClass } from "@/lib/presentation";
import { sourceLabels, statusLabels } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJobById(id);

  if (!job) {
    notFound();
  }

  const breakdown = (job.fitBreakdown as Record<string, number> | null) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{job.company}</p>
          <h2 className="text-2xl font-semibold">{job.title}</h2>
          <p className="text-sm text-slate-500">{job.location || "Location not specified"}</p>
        </div>
        <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-300">
          Back to list
        </Link>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge className={statusBadgeClass(job.status)}>{statusLabels[job.status]}</Badge>
          <Badge>{sourceLabels[job.source]}</Badge>
          <Badge>{prettifyEnum(job.remoteType)}</Badge>
          {job.employmentType ? <Badge>{prettifyEnum(job.employmentType)}</Badge> : null}
          {job.seniority ? <Badge>{job.seniority}</Badge> : null}
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm lg:grid-cols-3">
          <div>
            <p className="text-slate-500">Salary Range</p>
            <p>
              {formatCurrency(job.salaryMin, job.salaryCurrency || "CAD")} -
              {" "}
              {formatCurrency(job.salaryMax, job.salaryCurrency || "CAD")}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Fit Score</p>
            <p className="text-xl font-semibold">{job.fitScore ?? "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Original URL</p>
            {job.sourceUrl ? (
              <a href={job.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-300">
                Open source link
              </a>
            ) : (
              <p>-</p>
            )}
          </div>
        </div>
        <StatusUpdateForm jobId={job.id} currentStatus={job.status} />
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="space-y-3">
          <CardTitle>Description</CardTitle>
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{job.descriptionRaw}</p>
        </Card>

        <Card className="space-y-3">
          <CardTitle>Extracted Skills & Fit Breakdown</CardTitle>
          <div className="flex flex-wrap gap-2">
            {job.extractedSkills.length ? job.extractedSkills.map((skill) => <Badge key={skill}>{skill}</Badge>) : <p>-</p>}
          </div>
          {breakdown ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(breakdown).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                  <p className="capitalize text-slate-500">{key}</p>
                  <p className="font-semibold">{value}</p>
                </div>
              ))}
            </div>
          ) : null}
          <p className="text-sm text-slate-500">{job.workAuthorizationNote || "No work authorization note"}</p>
        </Card>
      </div>

      <Card className="space-y-3">
        <CardTitle>Notes</CardTitle>
        <CardDescription>Track application strategy, blockers, and interview prep notes.</CardDescription>
        <AddNoteForm jobId={job.id} />
        <div className="space-y-2">
          {job.notes.length === 0 ? (
            <p className="text-sm text-slate-500">No notes yet.</p>
          ) : (
            job.notes.map((note) => (
              <div key={note.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                <p>{note.content}</p>
                <p className="mt-2 text-xs text-slate-500">{new Date(note.createdAt).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
