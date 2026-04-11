"use client";

import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import * as React from "react";
import { ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { statusLabels } from "@/lib/constants";
import { formatCurrency, statusBadgeClass } from "@/lib/presentation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type JobRow = {
  id: string;
  company: string;
  title: string;
  location: string | null;
  source: string;
  status: keyof typeof statusLabels;
  fitScore: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  extractedSkills: string[];
  createdAt: string;
};

const columns: ColumnDef<JobRow>[] = [
  {
    accessorKey: "title",
    header: "Role",
    cell: ({ row }) => (
      <div>
        <Link href={`/jobs/${row.original.id}`} className="font-semibold text-slate-900 hover:underline dark:text-slate-100">
          {row.original.title}
        </Link>
        <p className="text-xs text-slate-500">{row.original.company}</p>
      </div>
    ),
  },
  {
    accessorKey: "location",
    header: "Location",
    cell: ({ row }) => <span className="text-sm text-slate-600 dark:text-slate-300">{row.original.location || "-"}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge className={statusBadgeClass(row.original.status)}>{statusLabels[row.original.status]}</Badge>
    ),
  },
  {
    accessorKey: "fitScore",
    header: ({ column }) => (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Fit <ArrowUpDown className="h-3 w-3" />
      </button>
    ),
    cell: ({ row }) => <span className="font-semibold">{row.original.fitScore ?? "-"}</span>,
  },
  {
    accessorKey: "salaryMin",
    header: "Salary",
    cell: ({ row }) => {
      const { salaryMin, salaryMax, salaryCurrency } = row.original;
      if (!salaryMin && !salaryMax) return <span>-</span>;
      return (
        <span className="text-sm">
          {formatCurrency(salaryMin, salaryCurrency || "CAD")} - {formatCurrency(salaryMax, salaryCurrency || "CAD")}
        </span>
      );
    },
  },
  {
    accessorKey: "extractedSkills",
    header: "Skills",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.extractedSkills.slice(0, 3).map((skill) => (
          <Badge key={skill}>{skill}</Badge>
        ))}
      </div>
    ),
  },
  {
    accessorKey: "id",
    header: "",
    cell: ({ row }) => {
      const encoded = encodeURIComponent(row.original.id);
      return (
        <Link href={`/jobs?id=${encoded}`} className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "inline-flex")}>
          Detail
        </Link>
      );
    },
  },
];

export function JobsTable({ data }: { data: JobRow[] }) {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "fitScore", desc: true }]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="bg-slate-100/80 dark:bg-slate-900">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                No job postings found.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-200 dark:border-slate-800">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
