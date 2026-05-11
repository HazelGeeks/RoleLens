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
    SAVED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    REVIEWING: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
    READY_TO_APPLY: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
    APPLIED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200",
    INTERVIEW_PENDING:
      "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200",
    INTERVIEWING:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
    OFFER: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-200",
    REJECTED: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
    WITHDRAWN:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200",
    CLOSED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
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
