"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { DocumentWorkspace } from "@/components/documents/document-workspace";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  coverLetterSchema,
  emptyCoverLetter,
  type CoverLetter,
} from "@/lib/cover-letter/profile";
import { CoverLetterPreview } from "./cover-letter-preview";
import styles from "@/components/resume/resume-page-client.module.css";

const senderFields = [
  ["name", "Full name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["location", "Location"],
  ["website", "Portfolio / website"],
] as const;
const applicationFields = [
  ["company", "Company"],
  ["role", "Position applying for"],
  ["recipient", "Recipient name / title"],
  ["date", "Letter date"],
] as const;

export function CoverLetterPageClient() {
  const { user, status } = useAuth();
  if (status === "loading") return <p role="status">Checking session...</p>;
  if (!user) return null;
  return (
    <DocumentWorkspace
      key={user.id}
      userId={user.id}
      kind="cover-letter"
      label="Cover Letter"
      description="Tell the story behind your experience. Tailor a letter for each application."
      schema={coverLetterSchema}
      empty={emptyCoverLetter}
      canPrint={(letter) => Boolean(letter.name.trim() && letter.body.trim())}
      editor={(letter, change) => (
        <CoverLetterFields letter={letter} change={change} />
      )}
      preview={(letter, onOverflow) => (
        <CoverLetterPreview letter={letter} onOverflow={onOverflow} />
      )}
    />
  );
}
function CoverLetterFields({
  letter,
  change,
}: {
  letter: CoverLetter;
  change: (letter: CoverLetter) => void;
}) {
  function update(key: keyof CoverLetter, value: string) {
    change({ ...letter, [key]: value });
  }
  return (
    <>
      <section className={styles.card}>
        <h2>Your details</h2>
        <div className={styles.fields}>
          {senderFields.map(([key, label]) => (
            <label key={key} htmlFor={`letter-${key}`}>
              {label}
              <Input
                id={`letter-${key}`}
                value={letter[key]}
                maxLength={key === "email" ? 254 : 200}
                onChange={(event) => update(key, event.target.value)}
              />
            </label>
          ))}
        </div>
      </section>
      <section className={styles.card}>
        <h2>Application details</h2>
        <div className={styles.fields}>
          {applicationFields.map(([key, label]) => (
            <label key={key} htmlFor={`letter-${key}`}>
              {label}
              <Input
                id={`letter-${key}`}
                type={key === "date" ? "date" : "text"}
                value={letter[key]}
                maxLength={200}
                onChange={(event) => update(key, event.target.value)}
              />
            </label>
          ))}
        </div>
        <label htmlFor="letter-recipientAddress">
          Company address (optional)
          <Textarea
            id="letter-recipientAddress"
            value={letter.recipientAddress}
            maxLength={500}
            rows={2}
            onChange={(event) => update("recipientAddress", event.target.value)}
          />
        </label>
      </section>
      <section className={styles.card}>
        <h2>Letter</h2>
        <label htmlFor="letter-greeting">
          Greeting
          <Input
            id="letter-greeting"
            value={letter.greeting}
            maxLength={200}
            onChange={(event) => update("greeting", event.target.value)}
          />
        </label>
        <label htmlFor="letter-body">
          Body
          <Textarea
            id="letter-body"
            value={letter.body}
            maxLength={12000}
            rows={16}
            aria-describedby="letter-guidance"
            placeholder={
              "Introduce the role you’re applying for and why it interests you.\n\nConnect one or two relevant experiences to what the company needs.\n\nClose with your interest in an interview and a brief thank-you."
            }
            onChange={(event) => update("body", event.target.value)}
          />
        </label>
        <p id="letter-guidance" className={styles.hint}>
          Aim for 3–4 short paragraphs. Use specific examples from your
          experience and explain why this role interests you.
        </p>
        <label htmlFor="letter-closing">
          Closing
          <Input
            id="letter-closing"
            value={letter.closing}
            maxLength={200}
            onChange={(event) => update("closing", event.target.value)}
          />
        </label>
      </section>
    </>
  );
}
