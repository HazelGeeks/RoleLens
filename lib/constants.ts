export const sourceOptions = ["LINKEDIN", "INDEED", "COMPANY_SITE", "MANUAL"] as const;
export const remoteTypeOptions = ["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"] as const;
export const employmentTypeOptions = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "TEMPORARY",
  "INTERNSHIP",
  "FREELANCE",
  "OTHER",
] as const;

export const statusOptions = [
  "SAVED",
  "REVIEWING",
  "READY_TO_APPLY",
  "APPLIED",
  "INTERVIEW",
  "REJECTED",
  "CLOSED",
] as const;

export const statusLabels: Record<(typeof statusOptions)[number], string> = {
  SAVED: "Saved",
  REVIEWING: "Reviewing",
  READY_TO_APPLY: "Ready To Apply",
  APPLIED: "Applied",
  INTERVIEW: "Interview",
  REJECTED: "Rejected",
  CLOSED: "Closed",
};

export const sourceLabels: Record<(typeof sourceOptions)[number], string> = {
  LINKEDIN: "LinkedIn",
  INDEED: "Indeed",
  COMPANY_SITE: "Company Site",
  MANUAL: "Manual",
};

export const remoteTypeLabels: Record<(typeof remoteTypeOptions)[number], string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ONSITE: "On-site",
  UNKNOWN: "Unknown",
};

export const currencyOptions = ["CAD", "USD", "EUR", "GBP"] as const;
