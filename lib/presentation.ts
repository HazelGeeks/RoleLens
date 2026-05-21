import { statusLabels } from "@/lib/constants";

export function formatCurrency(value?: number | null, currency = "CAD") {
  if (!value) return "-";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function statusBadgeClass(status: keyof typeof statusLabels) {
  const map: Record<keyof typeof statusLabels, string> = {
    NONE: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
    NEW: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    SAVE: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    INTEREST: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
    SUBMITTED:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200",
    ARCHIVE: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  };

  return map[status];
}

export function prettifyEnum(value?: string | null) {
  if (!value) return "-";
  return value
    .toLowerCase()
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}
