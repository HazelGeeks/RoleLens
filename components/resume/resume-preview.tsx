"use client";

import { DocumentPaper } from "@/components/documents/document-paper";
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
    { key: "experience", label: "Experience" },
    { key: "projects", label: "Projects & activities" },
  ];
export function ResumePreview({
  profile,
  onOverflow,
}: {
  profile: ResumeProfile;
  onOverflow: (overflow: boolean) => void;
}) {
  const websiteHref = getResumeWebsiteHref(profile.website);
  const contactDetails = [profile.email, profile.phone, profile.location]
    .filter(Boolean)
    .join(" · ");
  return (
    <DocumentPaper label="Resume preview" onOverflow={onOverflow}>
      <header className={styles.resumeHeader}>
        <h2>{profile.name || "Your name"}</h2>
        {profile.headline && <p>{profile.headline}</p>}
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
      </header>
      {profile.summary && (
        <section>
          <h3>Profile</h3>
          <p className={styles.preserveLines}>{profile.summary}</p>
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
                      <p>{entry.organization}</p>
                    )}
                  </div>
                  <div className={styles.entryMeta}>
                    <span>
                      {formatResumePeriod(entry.startDate, entry.endDate)}
                    </span>
                    {entry.location && <p>{entry.location}</p>}
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
      {profile.skills && (
        <section>
          <h3>Skills</h3>
          <p className={styles.preserveLines}>{profile.skills}</p>
        </section>
      )}
    </DocumentPaper>
  );
}
