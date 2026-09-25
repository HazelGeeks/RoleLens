"use client";

import {
  DocumentPaper,
  type PaperSize,
} from "@/components/documents/document-paper";
import { getResumeWebsiteHref } from "@/lib/resume/website";
import { formatResumePeriod } from "@/lib/resume/duration";
import {
  formatEducationDate,
  formatEducationSummary,
} from "@/lib/resume/education";
import type { ResumeProfile, ResumeSection } from "@/lib/resume/profile";
import styles from "./resume-page-client.module.css";

const sections: { key: Exclude<ResumeSection, "education">; label: string }[] =
  [
    { key: "experience", label: "Professional Experience" },
    { key: "projects", label: "Projects & activities" },
  ];
export function ResumePreview({
  profile,
  onOverflow,
  paperSize,
}: {
  profile: ResumeProfile;
  onOverflow: (overflow: boolean) => void;
  paperSize?: PaperSize;
}) {
  const websiteHref = getResumeWebsiteHref(profile.website);
  const contactDetails = [profile.email, profile.phone, profile.location]
    .filter(Boolean)
    .join(" · ");
  return (
    <DocumentPaper
      label="Resume preview"
      onOverflow={onOverflow}
      paperSize={paperSize}
      paperClassName={styles.resumePaper}
    >
      <header className={styles.resumeHeader}>
        <h2>{profile.name || "Your name"}</h2>
        {profile.headline && (
          <p className={styles.resumeHeadline}>{profile.headline}</p>
        )}
        {(contactDetails || profile.website) && (
          <p className={styles.contact}>
            {contactDetails}
            {contactDetails && profile.website && " · "}
            {websiteHref ? (
              <a href={websiteHref} target="_blank" rel="noopener noreferrer">
                {profile.website}
              </a>
            ) : (
              profile.website
            )}
          </p>
        )}
      </header>
      {profile.summary && (
        <section>
          <h3>Professional Summary</h3>
          <p className={styles.preserveLines}>{profile.summary}</p>
        </section>
      )}
      {profile.skills && (
        <section>
          <h3>Technical Skills</h3>
          {profile.skills
            .split("\n")
            .filter((line) => line.trim())
            .map((line, index) => {
              const separator = line.indexOf(":");
              return (
                <p key={index} className={styles.skillLine}>
                  {separator > 0 ? (
                    <>
                      <strong>{line.slice(0, separator + 1)}</strong>
                      {line.slice(separator + 1)}
                    </>
                  ) : (
                    line
                  )}
                </p>
              );
            })}
        </section>
      )}
      {sections.map(({ key, label }) => {
        const entries = profile[key].filter((entry) =>
          [entry.title, entry.organization, entry.details].some((value) =>
            value.trim(),
          ),
        );
        if (!entries.length) return null;
        return (
          <section key={key}>
            <h3>{label}</h3>
            {entries.map((entry) => (
              <div key={entry.id} className={styles.resumeEntry}>
                <div className={styles.entryHeading}>
                  <div className={styles.entryIdentity}>
                    <strong>{entry.title || entry.organization}</strong>
                    {entry.title && entry.organization && (
                      <strong> | {entry.organization}</strong>
                    )}
                    {entry.location && <strong>, {entry.location}</strong>}
                  </div>
                  <div className={styles.entryMeta}>
                    {formatResumePeriod(entry.startDate, entry.endDate)}
                  </div>
                </div>
                {entry.details && (
                  <ul>
                    {entry.details
                      .split("\n")
                      .filter((line) => line.trim())
                      .map((line, index) => (
                        <li key={index}>{line.replace(/^\s*[-•]\s*/, "")}</li>
                      ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        );
      })}
      {profile.education.some(
        (entry) =>
          entry.organization.trim() ||
          formatEducationSummary(entry) ||
          (entry.showDetails && entry.details.trim()),
      ) && (
        <section>
          <h3>Education</h3>
          {profile.education
            .filter(
              (entry) =>
                entry.organization.trim() ||
                formatEducationSummary(entry) ||
                (entry.showDetails && entry.details.trim()),
            )
            .map((entry) => (
              <div key={entry.id} className={styles.educationEntry}>
                <div className={styles.entryHeading}>
                  <div className={styles.entryIdentity}>
                    <strong>{entry.organization}</strong>
                    {formatEducationSummary(entry) && (
                      <p>{formatEducationSummary(entry)}</p>
                    )}
                  </div>
                  <div className={styles.entryMeta}>
                    <span>{formatEducationDate(entry)}</span>
                    {entry.showLocation && entry.location && (
                      <p>{entry.location}</p>
                    )}
                  </div>
                </div>
                {entry.showDetails && entry.details && (
                  <ul>
                    {entry.details
                      .split("\n")
                      .filter((line) => line.trim())
                      .map((line, index) => (
                        <li key={index}>{line.replace(/^\s*[-•]\s*/, "")}</li>
                      ))}
                  </ul>
                )}
              </div>
            ))}
        </section>
      )}
    </DocumentPaper>
  );
}
