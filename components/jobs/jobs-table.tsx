"use client";

import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
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
  remoteType: string;
  source: string;
  status: keyof typeof statusLabels;
  fitScore: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  extractedSkills: string[];
  nextAction: string | null;
  followUpDate: string | null;
  createdAt: string;
};

type JobsTableProps = {
  data: JobRow[];
  selectedIds: string[];
  onToggleSelect: (id: string, checked: boolean) => void;
};

const ROWS_PER_PAGE = 30;

export function JobsTable({
  data,
  selectedIds,
  onToggleSelect,
}: JobsTableProps) {
  const today = new Date().toISOString().slice(0, 10);

  const columns = React.useMemo<ColumnDef<JobRow>[]>(
    () => [
      {
        id: "select",
        header: "Compare",
        cell: ({ row }) => {
          const checked = selectedIds.includes(row.original.id);
          return (
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) =>
                onToggleSelect(row.original.id, event.target.checked)
              }
              aria-label={`Select ${row.original.title} for comparison`}
            />
          );
        },
      },
      {
        accessorKey: "title",
        header: "Role",
        cell: ({ row }) => {
          const encoded = encodeURIComponent(row.original.id);
          return (
            <div>
              <Link
                href={`/jobs?id=${encoded}`}
                className="font-semibold text-slate-900 hover:underline dark:text-slate-100"
              >
                {row.original.title}
              </Link>
              <p className="text-xs text-slate-500">{row.original.company}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "location",
        header: "Location",
        cell: ({ row }) => (
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {row.original.location || "-"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge className={statusBadgeClass(row.original.status)}>
            {statusLabels[row.original.status]}
          </Badge>
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
        cell: ({ row }) => (
          <span className="font-semibold">{row.original.fitScore ?? "-"}</span>
        ),
      },
      {
        accessorKey: "followUpDate",
        header: "Follow-up",
        cell: ({ row }) => {
          const date = row.original.followUpDate;
          if (!date) return <span className="text-sm text-slate-500">-</span>;
          const isInactive = row.original.status === "ARCHIVE";
          const due = !isInactive && date <= today;
          return (
            <span
              className={cn(
                "text-sm",
                due
                  ? "font-semibold text-amber-700 dark:text-amber-300"
                  : "text-slate-600 dark:text-slate-300",
              )}
            >
              {date}
            </span>
          );
        },
      },
      {
        accessorKey: "salaryMin",
        header: "Salary",
        cell: ({ row }) => {
          const { salaryMin, salaryMax, salaryCurrency } = row.original;
          if (!salaryMin && !salaryMax) return <span>-</span>;
          return (
            <span className="text-sm">
              {formatCurrency(salaryMin, salaryCurrency || "CAD")} -{" "}
              {formatCurrency(salaryMax, salaryCurrency || "CAD")}
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
            <Link
              href={`/jobs?id=${encoded}`}
              className={cn(
                buttonVariants({ size: "sm", variant: "secondary" }),
                "inline-flex",
              )}
            >
              Detail
            </Link>
          );
        },
      },
    ],
    [onToggleSelect, selectedIds, today],
  );

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "fitScore", desc: true },
  ]);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: ROWS_PER_PAGE,
  });

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;
  const totalRows = table.getPrePaginationRowModel().rows.length;
  const pageRows = table.getRowModel().rows.length;
  const startRow = totalRows === 0 ? 0 : pageIndex * ROWS_PER_PAGE + 1;
  const endRow =
    totalRows === 0
      ? 0
      : Math.min(pageIndex * ROWS_PER_PAGE + pageRows, totalRows);

  const visiblePageNumbers = React.useMemo(() => {
    if (pageCount <= 0) return [];
    const pages: number[] = [];
    const from = Math.max(0, pageIndex - 2);
    const to = Math.min(pageCount - 1, pageIndex + 2);
    for (let page = from; page <= to; page += 1) pages.push(page);
    return pages;
  }, [pageCount, pageIndex]);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="bg-slate-100/80 dark:bg-slate-900">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No job postings found.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-slate-200 dark:border-slate-800"
                >
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

      <div className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing {startRow}-{endRow} of {totalRows} postings (30 per page)
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            Prev
          </button>
          {visiblePageNumbers.map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => table.setPageIndex(page)}
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                page === pageIndex &&
                  "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white",
              )}
            >
              {page + 1}
            </button>
          ))}
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
