import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { sourceLabels, statusLabels, statusOptions } from "@/lib/constants";
import {
  formatCurrency,
  prettifyEnum,
  statusBadgeClass,
} from "@/lib/presentation";
import type { LocalJobPosting } from "@/lib/local-jobs";

export function JobDetailNotFound() {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-semibold">Job not found</h2>
      <p className="text-sm text-slate-500">
        This item may not exist in local storage.
      </p>
      <Link href="/" className="text-blue-600 hover:underline">
        Back to list
      </Link>
    </div>
  );
}

type JobDetailHeaderProps = {
  job: LocalJobPosting;
};

export function JobDetailHeader({ job }: JobDetailHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
          {job.company}
        </p>
        <h2 className="text-2xl font-semibold">{job.title}</h2>
        <p className="text-sm text-slate-500">
          {job.location || "Location not specified"}
        </p>
      </div>
      <Link
        href="/"
        className="text-sm text-blue-600 hover:underline dark:text-blue-300"
      >
        Back to list
      </Link>
    </div>
  );
}

type JobOverviewCardProps = {
  job: LocalJobPosting;
  statusValue: (typeof statusOptions)[number] | "";
  onStatusChange: (value: (typeof statusOptions)[number]) => void;
  onSaveStatus: () => void;
  nextActionInput: string;
  onNextActionChange: (value: string) => void;
  followUpDateInput: string;
  onFollowUpDateChange: (value: string) => void;
  onSetFollowUpAfterDays: (days: number) => void;
  onSaveFollowUp: () => void;
  isFollowUpOverdue: boolean;
};

export function JobOverviewCard({
  job,
  statusValue,
  onStatusChange,
  onSaveStatus,
  nextActionInput,
  onNextActionChange,
  followUpDateInput,
  onFollowUpDateChange,
  onSetFollowUpAfterDays,
  onSaveFollowUp,
  isFollowUpOverdue,
}: JobOverviewCardProps) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge className={statusBadgeClass(job.status)}>
          {statusLabels[job.status]}
        </Badge>
        <Badge>{sourceLabels[job.source]}</Badge>
        <Badge>{prettifyEnum(job.remoteType)}</Badge>
        {job.employmentType ? (
          <Badge>{prettifyEnum(job.employmentType)}</Badge>
        ) : null}
        {job.seniority ? <Badge>{job.seniority}</Badge> : null}
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm lg:grid-cols-3">
        <div>
          <p className="text-slate-500">Salary Range</p>
          <p>
            {formatCurrency(job.salaryMin, job.salaryCurrency || "CAD")} -{" "}
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
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-300"
            >
              Open source link
            </a>
          ) : (
            <p>-</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-[220px]">
          <label className="mb-1 block text-sm font-medium">
            Update Status
          </label>
          <Select
            value={statusValue || job.status}
            onChange={(event) =>
              onStatusChange(
                event.target.value as (typeof statusOptions)[number],
              )
            }
          >
            {statusOptions.map((item) => (
              <option key={item} value={item}>
                {statusLabels[item]}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" onClick={onSaveStatus}>
          Save
        </Button>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <h3 className="text-sm font-semibold">Follow-up Automation</h3>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_200px]">
          <div className="space-y-1">
            <label className="text-sm font-medium">Next Action</label>
            <Textarea
              value={nextActionInput}
              onChange={(event) => onNextActionChange(event.target.value)}
              className="min-h-[90px]"
              placeholder="Example: submit application, then follow up with recruiter"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Follow-up Date</label>
            <Input
              type="date"
              value={followUpDateInput}
              onChange={(event) => onFollowUpDateChange(event.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onSetFollowUpAfterDays(3)}
              >
                +3d
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onSetFollowUpAfterDays(7)}
              >
                +7d
              </Button>
            </div>
            <Button type="button" variant="secondary" onClick={onSaveFollowUp}>
              Save Follow-up
            </Button>
            {isFollowUpOverdue ? (
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                Follow-up is due now.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

type JobInsightCardsProps = {
  job: LocalJobPosting;
};

export function JobInsightCards({ job }: JobInsightCardsProps) {
  const breakdown = job.fitBreakdown ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="space-y-3">
        <CardTitle>Description</CardTitle>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">
          {job.descriptionRaw}
        </p>
      </Card>

      <Card className="space-y-3">
        <CardTitle>Extracted Skills & Fit Breakdown</CardTitle>
        <div className="flex flex-wrap gap-2">
          {job.extractedSkills.length > 0 ? (
            job.extractedSkills.map((skill) => (
              <Badge key={skill}>{skill}</Badge>
            ))
          ) : (
            <p>-</p>
          )}
        </div>
        {breakdown ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(breakdown).map(([key, value]) => (
              <div
                key={key}
                className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800"
              >
                <p className="capitalize text-slate-500">{key}</p>
                <p className="font-semibold">{value}</p>
              </div>
            ))}
          </div>
        ) : null}
        <p className="text-sm text-slate-500">
          {job.workAuthorizationNote || "No work authorization note"}
        </p>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-sm font-semibold">Status Timeline</p>
          {job.statusHistory.length === 0 ? (
            <p className="text-sm text-slate-500">No status history.</p>
          ) : (
            job.statusHistory.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800"
              >
                <p className="font-medium">{statusLabels[item.status]}</p>
                <p className="text-xs text-slate-500">
                  {new Date(item.changedAt).toLocaleString()}
                </p>
                {item.note ? <p className="text-xs">{item.note}</p> : null}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

type JobNotesCardProps = {
  notes: LocalJobPosting["notes"];
  newNote: string;
  onNewNoteChange: (value: string) => void;
  onAddNote: () => void;
};

export function JobNotesCard({
  notes,
  newNote,
  onNewNoteChange,
  onAddNote,
}: JobNotesCardProps) {
  return (
    <Card className="space-y-3">
      <CardTitle>Notes</CardTitle>
      <CardDescription>
        Track application strategy, blockers, and interview prep notes.
      </CardDescription>
      <div className="space-y-2">
        <label className="block text-sm font-medium">Add Note</label>
        <Textarea
          value={newNote}
          onChange={(event) => onNewNoteChange(event.target.value)}
          className="min-h-[100px]"
        />
        <Button variant="secondary" onClick={onAddNote}>
          Add Note
        </Button>
      </div>
      <div className="space-y-2">
        {notes.length === 0 ? (
          <p className="text-sm text-slate-500">No notes yet.</p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800"
            >
              <p>{note.content}</p>
              <p className="mt-2 text-xs text-slate-500">
                {new Date(note.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
