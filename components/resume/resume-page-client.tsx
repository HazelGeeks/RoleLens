"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { DocumentWorkspace } from "@/components/documents/document-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  emptyResumeEntry,
  emptyResumeProfile,
  resumeProfileSchema,
  type ResumeEntry,
  type ResumeProfile,
  type ResumeSection,
} from "@/lib/resume/profile";
import { EducationFields } from "./education-fields";
import { ResumePreview } from "./resume-preview";
import styles from "./resume-page-client.module.css";

const sections: {
  key: Exclude<ResumeSection, "education">;
  label: string;
  title: string;
  organization: string;
}[] = [
  {
    key: "experience",
    label: "Career history",
    title: "Job title",
    organization: "Company",
  },
  {
    key: "projects",
    label: "Projects & other experience",
    title: "Project / activity",
    organization: "Organization",
  },
];
const basics = [
  ["name", "Full name"],
  ["headline", "Professional headline"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["location", "Location"],
  ["website", "Portfolio / website"],
] as const;

export function ResumePageClient() {
  const { user, status } = useAuth();
  if (status === "loading") return <p role="status">Checking session...</p>;
  if (!user) return null;
  return (
    <DocumentWorkspace
      key={user.id}
      userId={user.id}
      kind="resume"
      label="Resume"
      description="Save your story. Build a one-page resume."
      schema={resumeProfileSchema}
      empty={emptyResumeProfile}
      canPrint={(profile) => Boolean(profile.name.trim())}
      editor={(profile, change) => (
        <ResumeFields userId={user.id} profile={profile} change={change} />
      )}
      preview={(profile, onOverflow) => (
        <ResumePreview profile={profile} onOverflow={onOverflow} />
      )}
    />
  );
}
function ResumeFields({
  userId,
  profile,
  change,
}: {
  userId: string;
  profile: ResumeProfile;
  change: (profile: ResumeProfile) => void;
}) {
  const [legacy, setLegacy] = useState<{
    headline: string;
    resumeText: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(
        `rolelens.resume.draft.${userId}`,
      );
      if (!raw) return;
      const old = JSON.parse(raw);
      if (
        typeof old.headline === "string" &&
        typeof old.resumeText === "string"
      )
        setLegacy(old);
    } catch {
      // Legacy drafts are never rewritten or removed, even when unreadable.
      setError(
        "An older browser draft could not be read. It is still preserved in browser storage.",
      );
    }
  }, [userId]);
  function changeEntry(
    section: Exclude<ResumeSection, "education">,
    id: string,
    field: keyof ResumeEntry,
    value: string,
  ) {
    change({
      ...profile,
      [section]: profile[section].map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry,
      ),
    });
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <section className={styles.card}>
        <h2>Personal details</h2>
        <div className={styles.fields}>
          {basics.map(([key, label]) => (
            <label key={key} htmlFor={`resume-${key}`}>
              {label}
              <Input
                id={`resume-${key}`}
                value={profile[key]}
                maxLength={key === "email" ? 254 : 200}
                onChange={(event) =>
                  change({ ...profile, [key]: event.target.value })
                }
              />
            </label>
          ))}
        </div>
        <label htmlFor="resume-summary">
          Short summary
          <Textarea
            id="resume-summary"
            value={profile.summary}
            maxLength={2000}
            onChange={(event) =>
              change({ ...profile, summary: event.target.value })
            }
          />
        </label>
      </section>
      {sections.map(({ key, label, title, organization }) => (
        <section key={key} className={styles.card}>
          <h2>{label}</h2>
          {profile[key].length === 0 && (
            <p className={styles.hint}>
              Add the details you want to include in your resume.
            </p>
          )}
          {profile[key].map((entry, index) => (
            <div key={entry.id} className={styles.editorEntry}>
              <div className={styles.entryControls}>
                <h3>
                  {label} {index + 1}
                </h3>
                <Button
                  variant="ghost"
                  aria-label={`Remove ${label} ${index + 1}`}
                  onClick={() =>
                    change({
                      ...profile,
                      [key]: profile[key].filter(
                        (item) => item.id !== entry.id,
                      ),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
              <div className={styles.fields}>
                {(
                  [
                    ["title", title],
                    ["organization", organization],
                    ["location", "Location"],
                    ["startDate", "Start date"],
                    ["endDate", "End date (blank = present)"],
                  ] as const
                ).map(([field, fieldLabel]) => (
                  <label key={field} htmlFor={`${entry.id}-${field}`}>
                    {fieldLabel}
                    <Input
                      id={`${entry.id}-${field}`}
                      type={field.endsWith("Date") ? "month" : "text"}
                      maxLength={200}
                      value={entry[field]}
                      onChange={(event) =>
                        changeEntry(key, entry.id, field, event.target.value)
                      }
                    />
                  </label>
                ))}
              </div>
              <label htmlFor={`${entry.id}-details`}>
                Achievements / contributions
                <Textarea
                  id={`${entry.id}-details`}
                  rows={4}
                  maxLength={4000}
                  value={entry.details}
                  placeholder="One achievement per line"
                  onChange={(event) =>
                    changeEntry(key, entry.id, "details", event.target.value)
                  }
                />
              </label>
            </div>
          ))}
          <Button
            variant="secondary"
            disabled={profile[key].length >= 30}
            onClick={() =>
              change({
                ...profile,
                [key]: [...profile[key], emptyResumeEntry()],
              })
            }
          >
            Add {label.toLowerCase()}
          </Button>
        </section>
      ))}
      <EducationFields
        entries={profile.education}
        onChange={(education) => change({ ...profile, education })}
      />
      <section className={styles.card}>
        <h2>Skills</h2>
        <label htmlFor="resume-skills">
          Relevant skills
          <Textarea
            id="resume-skills"
            value={profile.skills}
            maxLength={2000}
            onChange={(event) =>
              change({ ...profile, skills: event.target.value })
            }
          />
        </label>
      </section>
      {legacy && (
        <details className={styles.card}>
          <summary>Previous resume draft</summary>
          <p className={styles.hint}>
            Copy any details you want to keep into the fields above.
          </p>
          <p>{legacy.headline}</p>
          <pre className={styles.legacy}>{legacy.resumeText}</pre>
        </details>
      )}
    </>
  );
}
