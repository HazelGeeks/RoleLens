import { statusLabels } from "@/lib/constants";

export function formatCurrency(value?: number | null, currency = "CAD") {
  if (!value) return "-";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function statusBadgeColor(status: keyof typeof statusLabels) {
  const map: Record<keyof typeof statusLabels, string> = {
    NONE: "gray",
    NEW: "yellow",
    SAVE: "gray",
    INTEREST: "blue",
    SUBMITTED: "indigo",
    ARCHIVE: "dark",
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
