"use client";

import { DocumentPaper } from "@/components/documents/document-paper";
import type { CoverLetter } from "@/lib/cover-letter/profile";
import { getResumeWebsiteHref } from "@/lib/resume/website";
import styles from "@/components/resume/resume-page-client.module.css";

export function CoverLetterPreview({
  letter,
  onOverflow,
}: {
  letter: CoverLetter;
  onOverflow: (overflow: boolean) => void;
}) {
  const websiteHref = getResumeWebsiteHref(letter.website);
  const contact = [letter.email, letter.phone, letter.location]
    .filter(Boolean)
    .join(" · ");
  return (
    <DocumentPaper label="Cover letter preview" onOverflow={onOverflow}>
      <header className={styles.resumeHeader}>
        <h2>{letter.name || "Your name"}</h2>
        <p className={styles.contact}>
          {contact}
          {contact && letter.website && " · "}
          {websiteHref ? (
            <a href={websiteHref} target="_blank" rel="noopener noreferrer">
              {letter.website}
            </a>
          ) : (
            letter.website
          )}
        </p>
      </header>
      {letter.date && (
        <p className={styles.letterBlock}>
          {new Date(`${letter.date}T00:00:00Z`).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })}
        </p>
      )}
      {(letter.recipient || letter.company || letter.recipientAddress) && (
        <div className={styles.letterBlock}>
          {letter.recipient && <p>{letter.recipient}</p>}
          {letter.company && <p>{letter.company}</p>}
          {letter.recipientAddress && (
            <p className={styles.preserveLines}>{letter.recipientAddress}</p>
          )}
        </div>
      )}
      {letter.role && (
        <p className={styles.letterBlock}>
          <strong>Re: {letter.role}</strong>
        </p>
      )}
      {letter.greeting && (
        <p className={styles.letterBlock}>{letter.greeting}</p>
      )}
      {letter.body && (
        <div className={`${styles.letterBody} ${styles.letterBlock}`}>
          {letter.body}
        </div>
      )}
      <div className={styles.letterBlock}>
        {letter.closing && <p>{letter.closing}</p>}
        {letter.name && <p>{letter.name}</p>}
      </div>
    </DocumentPaper>
  );
}
