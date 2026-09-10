import type { EducationEntry } from "./profile";
import { formatResumeDateRange } from "./duration";

export const academicStatusLabels = {
  "": "Not specified",
  graduated: "Graduated",
  enrolled: "Enrolled",
  expected: "Expected graduation",
  withdrawn: "Withdrawn",
  "transferred-out": "Transferred out",
  completed: "Coursework completed",
  "on-leave": "On leave",
} as const;
export const admissionTypeLabels = {
  "": "Not specified",
  regular: "Regular admission",
  transfer: "Transfer",
} as const;
export const educationDateLabels = {
  "end-month": "Completion month only",
  "end-year": "Completion year only",
  range: "Full date range",
  hidden: "Hide dates",
} as const;

export const degreeLevelLabels = {
  "": "Not specified",
  associate: "Associate degree",
  bachelor: "Bachelor's",
  master: "Master's",
  doctorate: "Doctorate",
  diploma: "Diploma",
  certificate: "Certificate",
  "high-school": "High school",
  other: "Custom degree",
} as const;
export const majorTypeLabels = {
  "": "Not specified",
  single: "Single major",
  double: "Double major",
  minor: "Major with minor",
} as const;

function formatMajor(entry: EducationEntry): string {
  const major = entry.major?.trim() ?? "";
  const additional = entry.additionalMajor?.trim() ?? "";
  if (entry.majorType === "double") {
    return `${[major, additional].filter(Boolean).join(" & ")}${major || additional ? " (Double major)" : "Double major"}`;
  }
  if (entry.majorType === "minor") {
    return [major, additional ? `Minor in ${additional}` : "Minor"]
      .filter(Boolean)
      .join(" · ");
  }
  return major;
}

export function getEducationDegreeChoice(
  entry: EducationEntry,
): NonNullable<EducationEntry["degreeLevel"]> {
  // An explicit empty selection means no degree should be printed. Older free
  // text remains editable as a custom degree until the user chooses a preset.
  return (
    entry.degreeLevel ?? ((entry.degree ?? entry.title).trim() ? "other" : "")
  );
}

function formatDegree(entry: EducationEntry): string {
  const qualification = (entry.degree ?? entry.title).trim();
  const choice = getEducationDegreeChoice(entry);
  if (!choice) return "";
  return choice === "other" ? qualification : degreeLevelLabels[choice];
}

export function formatEducationSummary(entry: EducationEntry): string {
  return [
    formatMajor(entry),
    formatDegree(entry),
    entry.gpa?.trim() && entry.gpaScale?.trim()
      ? `GPA ${entry.gpa.trim()}/${entry.gpaScale.trim()}`
      : "",
    entry.admissionType === "transfer" ? "Transfer" : "",
    entry.academicStatus ? academicStatusLabels[entry.academicStatus] : "",
  ]
    .filter((value) => value?.trim())
    .filter(
      (value, index, values) =>
        values.findIndex(
          (candidate) =>
            candidate.normalize("NFKC").trim().toLowerCase() ===
            value.normalize("NFKC").trim().toLowerCase(),
        ) === index,
    )
    .join(" · ");
}

export function formatEducationDate(entry: EducationEntry): string {
  if (entry.dateDisplay === "hidden") return "";
  if (entry.dateDisplay === "range") {
    // Missing completion dates do not imply attendance is still ongoing.
    if (
      !entry.endDate &&
      !["enrolled", "expected", "on-leave"].includes(entry.academicStatus ?? "")
    )
      return entry.startDate;
    return formatResumeDateRange(entry.startDate, entry.endDate);
  }
  if (!entry.endDate) return "";
  return entry.dateDisplay === "end-year"
    ? entry.endDate.slice(0, 4)
    : entry.endDate.replace("-", ".");
}
