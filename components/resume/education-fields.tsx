"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { emptyEducationEntry, type EducationEntry } from "@/lib/resume/profile";
import {
  academicStatusLabels,
  admissionTypeLabels,
  educationDateLabels,
  degreeLevelLabels,
  majorTypeLabels,
  getEducationDegreeChoice,
} from "@/lib/resume/education";
import styles from "./resume-page-client.module.css";

export function EducationFields({
  entries,
  onChange,
}: {
  entries: EducationEntry[];
  onChange: (entries: EducationEntry[]) => void;
}) {
  function update(id: string, changes: Partial<EducationEntry>) {
    onChange(
      entries.map((entry) =>
        entry.id === id ? { ...entry, ...changes } : entry,
      ),
    );
  }
  return (
    <section className={styles.card}>
      <h2>Education</h2>
      <p className={styles.hint}>
        School and completion date on the first line; major, degree and academic
        status below.
      </p>
      {entries.map((entry, index) => (
        <div className={styles.editorEntry} key={entry.id}>
          <div className={styles.entryControls}>
            <h3>Education {index + 1}</h3>
            <Button
              variant="ghost"
              aria-label={`Remove Education ${index + 1}`}
              onClick={() =>
                onChange(entries.filter((item) => item.id !== entry.id))
              }
            >
              Remove
            </Button>
          </div>
          <div className={styles.fields}>
            {(
              [
                ["organization", "School"],
                ["major", "Major / field of study"],
              ] as const
            ).map(([field, label]) => (
              <label key={field} htmlFor={`${entry.id}-${field}`}>
                {label}
                <Input
                  id={`${entry.id}-${field}`}
                  type={field.endsWith("Date") ? "month" : "text"}
                  value={entry[field] ?? ""}
                  maxLength={200}
                  onChange={(event) =>
                    update(entry.id, { [field]: event.target.value })
                  }
                />
              </label>
            ))}
            <label htmlFor={`${entry.id}-degreeLevel`}>
              Degree
              <Select
                id={`${entry.id}-degreeLevel`}
                value={getEducationDegreeChoice(entry)}
                onChange={(event) =>
                  update(entry.id, {
                    degreeLevel: event.target
                      .value as EducationEntry["degreeLevel"],
                  })
                }
              >
                {Object.entries(degreeLevelLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            {getEducationDegreeChoice(entry) === "other" && (
              <label htmlFor={`${entry.id}-degree`}>
                Custom degree
                <Input
                  id={`${entry.id}-degree`}
                  value={entry.degree ?? entry.title}
                  maxLength={200}
                  placeholder="e.g. BSc, MBA, Bachelor of Engineering"
                  onChange={(event) =>
                    update(entry.id, { degree: event.target.value })
                  }
                />
              </label>
            )}
            <label htmlFor={`${entry.id}-majorType`}>
              Major type
              <Select
                id={`${entry.id}-majorType`}
                value={entry.majorType ?? ""}
                onChange={(event) =>
                  update(entry.id, {
                    majorType: event.target
                      .value as EducationEntry["majorType"],
                  })
                }
              >
                {Object.entries(majorTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            {(entry.majorType === "double" || entry.majorType === "minor") && (
              <label htmlFor={`${entry.id}-additionalMajor`}>
                {entry.majorType === "double"
                  ? "Second major"
                  : "Minor field of study"}
                <Input
                  id={`${entry.id}-additionalMajor`}
                  value={entry.additionalMajor ?? ""}
                  maxLength={200}
                  onChange={(event) =>
                    update(entry.id, { additionalMajor: event.target.value })
                  }
                />
              </label>
            )}
            <label htmlFor={`${entry.id}-gpa`}>
              GPA
              <Input
                id={`${entry.id}-gpa`}
                type="number"
                min={0}
                max={entry.gpaScale || 100}
                step="any"
                value={entry.gpa ?? ""}
                placeholder="e.g. 3.8"
                onChange={(event) =>
                  update(entry.id, { gpa: event.target.value })
                }
              />
            </label>
            <label htmlFor={`${entry.id}-gpaScale`}>
              GPA scale
              <Input
                id={`${entry.id}-gpaScale`}
                type="number"
                min={0}
                max={100}
                step="any"
                value={entry.gpaScale ?? ""}
                placeholder="e.g. 4.0, 4.3, 4.5 or 100"
                onChange={(event) =>
                  update(entry.id, { gpaScale: event.target.value })
                }
              />
            </label>
            <label htmlFor={`${entry.id}-academicStatus`}>
              Academic status
              <Select
                id={`${entry.id}-academicStatus`}
                value={entry.academicStatus ?? ""}
                onChange={(event) =>
                  update(entry.id, {
                    academicStatus: event.target
                      .value as EducationEntry["academicStatus"],
                  })
                }
              >
                {Object.entries(academicStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label htmlFor={`${entry.id}-admissionType`}>
              Admission type
              <Select
                id={`${entry.id}-admissionType`}
                value={entry.admissionType ?? ""}
                onChange={(event) =>
                  update(entry.id, {
                    admissionType: event.target
                      .value as EducationEntry["admissionType"],
                  })
                }
              >
                {Object.entries(admissionTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            {(
              [
                ["startDate", "Admission date"],
                ["endDate", "Completion / expected end date"],
              ] as const
            ).map(([field, label]) => (
              <label key={field} htmlFor={`${entry.id}-${field}`}>
                {label}
                <Input
                  id={`${entry.id}-${field}`}
                  type="month"
                  value={entry[field]}
                  onChange={(event) =>
                    update(entry.id, { [field]: event.target.value })
                  }
                />
              </label>
            ))}
            <label htmlFor={`${entry.id}-dateDisplay`}>
              Dates shown on resume
              <Select
                id={`${entry.id}-dateDisplay`}
                value={entry.dateDisplay ?? "end-month"}
                onChange={(event) =>
                  update(entry.id, {
                    dateDisplay: event.target
                      .value as EducationEntry["dateDisplay"],
                  })
                }
              >
                {Object.entries(educationDateLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <details className={styles.educationOptions}>
            <summary>Optional location & highlights</summary>
            <div>
              <p className={styles.hint}>
                These details stay saved. Include them in the preview only when
                needed.
              </p>
              <label htmlFor={`${entry.id}-location`}>
                School location
                <Input
                  id={`${entry.id}-location`}
                  value={entry.location}
                  maxLength={200}
                  onChange={(event) =>
                    update(entry.id, { location: event.target.value })
                  }
                />
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={entry.showLocation ?? false}
                  onChange={(event) =>
                    update(entry.id, { showLocation: event.target.checked })
                  }
                />
                Show school location on resume
              </label>
              <label htmlFor={`${entry.id}-details`}>
                Highlights / coursework
                <Textarea
                  id={`${entry.id}-details`}
                  value={entry.details}
                  rows={3}
                  maxLength={4000}
                  onChange={(event) =>
                    update(entry.id, { details: event.target.value })
                  }
                />
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={entry.showDetails ?? false}
                  onChange={(event) =>
                    update(entry.id, { showDetails: event.target.checked })
                  }
                />
                Show education highlights on resume
              </label>
            </div>
          </details>
        </div>
      ))}
      <Button
        variant="secondary"
        disabled={entries.length >= 30}
        onClick={() => onChange([...entries, emptyEducationEntry()])}
      >
        Add education
      </Button>
    </section>
  );
}
