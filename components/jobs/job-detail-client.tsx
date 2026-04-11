"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { statusLabels, statusOptions, sourceLabels } from "@/lib/constants";
import { formatCurrency, prettifyEnum, statusBadgeClass } from "@/lib/presentation";
import { addNote, getJobById, updateStatus } from "@/lib/local-jobs";

export function JobDetailClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const [newNote, setNewNote] = useState("");
  const [status, setStatus] = useState<(typeof statusOptions)[number] | "">("");

  const job = useMemo(() => getJobById(id), [id]);

  if (!job) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold">Job not found</h2>
        <p className="text-sm text-slate-500">This item may not exist in local storage.</p>
        <Link href="/" className="text-blue-600 hover:underline">
          Back to list
        </Link>
      </div>
    );
  }

  const breakdown = job.fitBreakdown ?? null;

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
              {formatCurrency(job.salaryMin, job.salaryCurrency || "CAD")} - {formatCurrency(job.salaryMax, job.salaryCurrency || "CAD")}
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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="w-full sm:max-w-[220px]">
            <label className="mb-1 block text-sm font-medium">Update Status</label>
            <Select value={status || job.status} onChange={(e) => setStatus(e.target.value as (typeof statusOptions)[number])}>
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {statusLabels[item]}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              updateStatus(job.id, (status || job.status) as (typeof statusOptions)[number]);
              router.refresh();
            }}
          >
            Save
          </Button>
        </div>
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
        <div className="space-y-2">
          <label className="block text-sm font-medium">Add Note</label>
          <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} className="min-h-[100px]" />
          <Button
            variant="secondary"
            onClick={() => {
              if (!newNote.trim()) return;
              addNote(job.id, newNote.trim());
              setNewNote("");
              router.refresh();
            }}
          >
            Add Note
          </Button>
        </div>
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
