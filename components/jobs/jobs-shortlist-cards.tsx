"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { statusLabels } from "@/lib/constants";
import { formatCurrency } from "@/lib/presentation";
import type { LocalJobPosting } from "@/lib/local-jobs";
import type { JobRow } from "./jobs-table";

type DueFollowUpsCardProps = {
  dueFollowUps: LocalJobPosting[];
};

export function DueFollowUpsCard({ dueFollowUps }: DueFollowUpsCardProps) {
  return (
    <Card className="space-y-3">
      <h3 className="text-base font-semibold">Follow-up Due</h3>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {dueFollowUps.map((job) => (
          <div
            key={job.id}
            className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{job.title}</p>
              <span className="text-xs font-semibold">{job.followUpDate}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {job.company}
            </p>
            <p className="mt-1 text-xs">
              Next: {job.nextAction || "No next action set"}
            </p>
            <Link
              href={`/jobs?id=${encodeURIComponent(job.id)}`}
              className="mt-2 inline-flex text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              Open detail
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}

type CompareShortlistCardProps = {
  compareRows: JobRow[];
  onRemoveRow: (id: string) => void;
  onClear: () => void;
};

export function CompareShortlistCard({
  compareRows,
  onRemoveRow,
  onClear,
}: CompareShortlistCardProps) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Compare Shortlist</h3>
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-500">
            Selected {compareRows.length} / 3
          </p>
          {compareRows.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClear}
            >
              Clear all
            </Button>
          ) : null}
        </div>
      </div>

      {compareRows.length < 2 ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">
            Choose at least 2 postings in the table to compare key fields.
          </p>
          {compareRows.length > 0 ? (
            <ul className="space-y-2">
              {compareRows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
                >
                  <span>
                    {row.title}{" "}
                    <span className="text-slate-500">· {row.company}</span>
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onRemoveRow(row.id)}
                    aria-label={`Remove ${row.title} at ${row.company} from compare shortlist`}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-100/80 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Fit</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Salary</th>
                <th className="px-3 py-2 font-medium">Follow-up</th>
                <th className="px-3 py-2 font-medium">Remove</th>
                <th className="px-3 py-2 font-medium">Next Action</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-slate-200 dark:border-slate-800"
                >
                  <td className="px-3 py-2 align-top">
                    <p className="font-medium">{row.title}</p>
                    <p className="text-xs text-slate-500">{row.company}</p>
                  </td>
                  <td className="px-3 py-2 align-top font-semibold">
                    {row.fitScore ?? "-"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {statusLabels[row.status]}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {formatCurrency(row.salaryMin, row.salaryCurrency || "CAD")}{" "}
                    -{" "}
                    {formatCurrency(row.salaryMax, row.salaryCurrency || "CAD")}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.followUpDate || "-"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onRemoveRow(row.id)}
                      aria-label={`Remove ${row.title} at ${row.company} from compare shortlist`}
                    >
                      Remove
                    </Button>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.nextAction || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
