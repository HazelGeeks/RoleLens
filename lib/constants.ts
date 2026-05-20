export const sourceOptions = ["LINKEDIN", "INDEED", "SARAMIN", "JOBKOREA", "MANUAL"] as const;
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
  "SAVE",
  "INTEREST",
  "SUBMITTED",
  "ARCHIVE",
] as const;

export const statusLabels: Record<(typeof statusOptions)[number], string> = {
  SAVE: "Save",
  INTEREST: "Interest",
  SUBMITTED: "Submitted",
  ARCHIVE: "Archive",
};

export const sourceLabels: Record<(typeof sourceOptions)[number], string> = {
  LINKEDIN: "LinkedIn",
  INDEED: "Indeed",
  SARAMIN: "Saramin",
  JOBKOREA: "JobKorea",
  MANUAL: "Manual",
};

export const remoteTypeLabels: Record<(typeof remoteTypeOptions)[number], string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ONSITE: "On-site",
  UNKNOWN: "Unknown",
};

export const currencyOptions = ["CAD", "USD", "EUR", "GBP"] as const;
