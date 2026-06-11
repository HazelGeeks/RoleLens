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
import { Button, Group, ScrollArea, Table, Text } from "@mantine/core";
import { ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { statusLabels } from "@/lib/constants";
import { formatCurrency, statusBadgeColor } from "@/lib/presentation";
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
  publishedAt: string | null;
  createdAt: string;
};

type JobsTableProps = {
  data: JobRow[];
  selectedIds: string[];
  onToggleSelect: (id: string, checked: boolean) => void;
};

const ROWS_PER_PAGE = 30;

function formatPostedDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.length >= 10 ? value.slice(0, 10) : value;
  }
  return parsed.toISOString().slice(0, 10);
}

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
              aria-label={`Select ${row.original.title} at ${row.original.company} for comparison`}
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
            </div>
          );
        },
      },
      {
        accessorKey: "company",
        header: "Company",
        cell: ({ row }) => (
          <span className="text-sm text-slate-700 dark:text-slate-200">
            {row.original.company}
          </span>
        ),
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
          <Badge color={statusBadgeColor(row.original.status)}>
            {statusLabels[row.original.status]}
          </Badge>
        ),
      },
      {
        accessorKey: "publishedAt",
        header: "Posted",
        cell: ({ row }) => (
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {formatPostedDate(row.original.publishedAt)}
          </span>
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
            <Button
              component={Link}
              href={`/jobs?id=${encoded}`}
              variant="light"
              size="xs"
            >
              Detail
            </Button>
          );
        },
      },
    ],
    [onToggleSelect, selectedIds, today],
  );

  const [sorting, setSorting] = React.useState<SortingState>([]);
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
      <ScrollArea type="auto" offsetScrollbars>
        <Table
          striped
          highlightOnHover
          withTableBorder
          withColumnBorders={false}
          verticalSpacing="sm"
          className="min-w-[1360px]"
        >
          <Table.Thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <Table.Tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <Table.Th key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </Table.Th>
                ))}
              </Table.Tr>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {table.getRowModel().rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={columns.length}>
                  <Text ta="center" c="dimmed" py="xl">
                  No job postings found.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <Table.Tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <Table.Td key={cell.id} style={{ verticalAlign: "top" }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <div className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing {startRow}-{endRow} of {totalRows} postings (30 per page)
        </p>
        <Group gap={4}>
          <Button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            variant="light"
            size="xs"
          >
            Prev
          </Button>
          {visiblePageNumbers.map((page) => (
            <Button
              key={page}
              type="button"
              onClick={() => table.setPageIndex(page)}
              variant={page === pageIndex ? "filled" : "light"}
              size="xs"
            >
              {page + 1}
            </Button>
          ))}
          <Button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            variant="light"
            size="xs"
          >
            Next
          </Button>
        </Group>
      </div>
    </div>
  );
}
