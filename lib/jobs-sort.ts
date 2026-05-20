export const jobsSortOptions = [
  "SMART",
  "CREATED_DESC",
  "FIT_DESC",
  "LOCATION_PRIORITY",
] as const;

export type JobsSortOption = (typeof jobsSortOptions)[number];

export const jobsSortLabels: Record<JobsSortOption, string> = {
  SMART: "Default",
  CREATED_DESC: "Newest first",
  FIT_DESC: "Highest fit first",
  LOCATION_PRIORITY: "Location priority",
};
