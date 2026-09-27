import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sourceLabels, statusLabels, statusOptions } from "@/lib/constants";
import { formatCurrency, prettifyEnum } from "@/lib/presentation";
import type { LocalJobPosting } from "@/lib/local-jobs";
import { formatJobDescriptionForDisplay } from "@/lib/job-description";
import styles from "./job-detail-sections.module.css";

function normalizeDescriptionForDisplay(value: string) {
  return formatJobDescriptionForDisplay(value);
}

function formatSalaryRange(job: LocalJobPosting) {
  const currency = job.salaryCurrency || "CAD";
  if (job.salaryMin && job.salaryMax) {
    return `${formatCurrency(job.salaryMin, currency)} - ${formatCurrency(job.salaryMax, currency)}`;
  }

  if (job.salaryMin) {
    return `From ${formatCurrency(job.salaryMin, currency)}`;
  }

  if (job.salaryMax) {
    return `Up to ${formatCurrency(job.salaryMax, currency)}`;
  }

  return null;
}

export function JobDetailNotFound() {
  return (
    <div className={styles.detailStack}>
      <h2 className="text-2xl font-semibold">Job not found</h2>
      <p className={styles.emptyText}>
        This item may not exist in the current local cache or persistence store.
      </p>
      <Link href="/jobs" className={styles.backLink}>
        Back to list
      </Link>
    </div>
  );
}

type JobDetailHeaderProps = {
  job: LocalJobPosting;
};

export function JobDetailHeader({ job }: JobDetailHeaderProps) {
  const heroMetaItems = [
    job.location,
    sourceLabels[job.source],
    job.remoteType !== "UNKNOWN" ? prettifyEnum(job.remoteType) : null,
    job.employmentType ? prettifyEnum(job.employmentType) : null,
    job.seniority,
  ].filter((item): item is string => Boolean(item && item !== "-"));

  return (
    <header className={styles.hero}>
      <div className={styles.heroMain}>
        <p className={styles.heroEyebrow}>{job.company}</p>
        <h2 className={styles.heroTitle}>{job.title}</h2>
        {heroMetaItems.length > 0 ? (
          <div className={styles.heroMeta}>
            {heroMetaItems.map((item) => (
              <span key={item} className={styles.heroMetaItem}>
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className={styles.heroActions}>
        <Link href="/jobs" className={styles.backLink}>
          Back to list
        </Link>
      </div>
    </header>
  );
}

type JobOverviewCardProps = {
  job: LocalJobPosting;
  onSaveStatus: (value: (typeof statusOptions)[number]) => void;
  nextActionInput: string;
  onNextActionChange: (value: string) => void;
  followUpDateInput: string;
  onFollowUpDateChange: (value: string) => void;
  onSetFollowUpAfterDays: (days: number) => void;
  onSaveFollowUp: () => void;
  isFollowUpOverdue: boolean;
};

export function JobOverviewCard({
  job,
  onSaveStatus,
  nextActionInput,
  onNextActionChange,
  followUpDateInput,
  onFollowUpDateChange,
  onSetFollowUpAfterDays,
  onSaveFollowUp,
  isFollowUpOverdue,
}: JobOverviewCardProps) {
  const hasFitScore = job.fitScore !== null && job.fitScore !== undefined;
  const hasSourceUrl = Boolean(job.sourceUrl);
  const salaryRange = formatSalaryRange(job);

  return (
    <Card className={styles.overview}>
      {salaryRange || hasFitScore || hasSourceUrl ? (
        <div className={styles.metricsGrid}>
          {salaryRange ? (
            <div className={styles.metric}>
              <p className={styles.metricLabel}>Salary Range</p>
              <p className={styles.metricValue}>{salaryRange}</p>
            </div>
          ) : null}
          {hasFitScore ? (
            <div className={styles.metric}>
              <p className={styles.metricLabel}>Fit Score</p>
              <p className={`${styles.metricValue} ${styles.metricValueLarge}`}>
                {job.fitScore}
              </p>
            </div>
          ) : null}
          {hasSourceUrl ? (
            <div className={styles.metric}>
              <p className={styles.metricLabel}>Original URL</p>
              <a
                href={job.sourceUrl as string}
                target="_blank"
                rel="noreferrer"
                className={styles.sourceLink}
              >
                Open source link
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.controlGrid}>
        <section
          className={styles.panel}
          aria-labelledby="application-status-title"
        >
          <div className={styles.panelHeading}>
            <h3 id="application-status-title" className={styles.panelTitle}>
              My application
            </h3>
            <span className={styles.currentStatus}>
              {job.status === "NONE" ? "No status" : statusLabels[job.status]}
            </span>
          </div>
          <div className={styles.statusControl}>
            <label htmlFor="job-status" className={styles.label}>
              Update Status
            </label>
            <Select
              id="job-status"
              className={styles.statusSelect}
              value={job.status}
              aria-describedby="job-status-help"
              onChange={(event) => {
                const value = event.target.value as LocalJobPosting["status"];
                if (value !== job.status) onSaveStatus(value);
              }}
            >
              <option value="NONE">No status</option>
              <optgroup label="Application">
                {(
                  [
                    "PLANNED",
                    "SUBMITTED",
                    "ON_HOLD",
                    "NOT_APPLYING",
                    "EXPIRED",
                  ] as const
                ).map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Organize">
                {(["NEW", "SAVE", "INTEREST", "ARCHIVE"] as const).map(
                  (status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ),
                )}
              </optgroup>
            </Select>
            <p id="job-status-help" className={styles.helpText}>
              Changes save automatically. Track your decision for this posting.
            </p>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="follow-up-title">
          <h3 id="follow-up-title" className={styles.panelTitle}>
            Follow-up
          </h3>
          <div className={styles.followUpGrid}>
            <div className={styles.fieldGroup}>
              <label htmlFor="job-next-action" className={styles.label}>
                Next Action
              </label>
              <Textarea
                id="job-next-action"
                value={nextActionInput}
                onChange={(event) => onNextActionChange(event.target.value)}
                className={styles.followUpTextarea}
                placeholder="Example: submit application, then follow up with recruiter"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="job-follow-up-date" className={styles.label}>
                Follow-up Date
              </label>
              <Input
                id="job-follow-up-date"
                type="date"
                value={followUpDateInput}
                onChange={(event) => onFollowUpDateChange(event.target.value)}
              />
              <div className={styles.dateActions}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onSetFollowUpAfterDays(3)}
                >
                  In 3 days
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onSetFollowUpAfterDays(7)}
                >
                  In 7 days
                </Button>
              </div>
              <Button
                type="button"
                variant="secondary"
                className={styles.inlineAction}
                onClick={onSaveFollowUp}
              >
                Save Follow-up
              </Button>
              {isFollowUpOverdue ? (
                <p className={styles.dueText}>Follow-up is due now.</p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </Card>
  );
}

type JobInsightCardsProps = {
  job: LocalJobPosting;
  notesCard?: ReactNode;
};

export function JobInsightCards({ job, notesCard }: JobInsightCardsProps) {
  const breakdown = job.fitBreakdown ?? null;
  const description = normalizeDescriptionForDisplay(job.descriptionRaw);
  const hasDescription = Boolean(description);
  const descriptionParagraphs = description.split(/\n{2,}/).filter(Boolean);
  const hasSkills = job.extractedSkills.length > 0;
  const hasBreakdown = Boolean(breakdown && Object.keys(breakdown).length > 0);
  const hasStatusHistory = job.statusHistory.length > 0;
  const hasSidePanels = hasSkills || hasBreakdown || hasStatusHistory;

  return (
    <div
      className={hasSidePanels ? styles.insightGrid : styles.singleColumnGrid}
    >
      <div className={styles.mainStack}>
        <Card className={`${styles.descriptionCard} space-y-2`}>
          <CardTitle className={styles.sectionTitle}>Job description</CardTitle>
          {hasDescription ? (
            <div className={styles.descriptionText}>
              {descriptionParagraphs.map((paragraph, index) => {
                const key = `${index}-${paragraph.slice(0, 24)}`;
                const isHeading =
                  /^(about (us|the (role|team)|you)|the (role|team)|your (role|responsibilities)|responsibilities|key job responsibilities|requirements|(?:basic |preferred |minimum )?qualifications|benefits|what (you’ll|you'll|you will|we) (do|bring|offer)|compensation)[:\s]*$/i.test(
                    paragraph,
                  );
                return isHeading ? (
                  <h4 key={key}>{paragraph}</h4>
                ) : (
                  <p key={key}>{paragraph}</p>
                );
              })}
            </div>
          ) : (
            <div className={styles.descriptionUnavailable}>
              <p className={styles.emptyText}>
                The full description is not available here. Open the original
                posting for role details and requirements.
              </p>
              {job.sourceUrl ? (
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.sourceLink}
                >
                  Open original posting
                </a>
              ) : null}
            </div>
          )}
        </Card>
        {notesCard}
      </div>

      {hasSidePanels ? (
        <div className={styles.sideStack}>
          {hasSkills || hasBreakdown ? (
            <Card className={styles.sideCard}>
              <CardTitle className={styles.sectionTitle}>
                Skills & fit
              </CardTitle>
              {hasSkills ? (
                <div className={styles.skillsList}>
                  {job.extractedSkills.map((skill) => (
                    <Badge key={skill}>{skill}</Badge>
                  ))}
                </div>
              ) : null}
              {hasBreakdown && breakdown ? (
                <div className={styles.fitGrid}>
                  {Object.entries(breakdown).map(([key, value]) => (
                    <div key={key} className={styles.fitItem}>
                      <p className={styles.fitKey}>{key}</p>
                      <p className={styles.fitValue}>{value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          ) : null}

          {hasStatusHistory ? (
            <Card className={styles.sideCard}>
              <CardTitle className={styles.sectionTitle}>
                Status history
              </CardTitle>
              <div className={styles.timeline}>
                {job.statusHistory.slice(0, 8).map((item) => (
                  <div key={item.id} className={styles.timelineItem}>
                    <p className={styles.timelineStatus}>
                      {item.status === "NONE"
                        ? "No status"
                        : statusLabels[item.status]}
                    </p>
                    <p className={styles.timelineDate}>
                      {new Date(item.changedAt).toLocaleString()}
                    </p>
                    {item.note ? (
                      <p className={styles.timelineNote}>{item.note}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type JobNotesCardProps = {
  notes: LocalJobPosting["notes"];
  newNote: string;
  onNewNoteChange: (value: string) => void;
  onAddNote: () => void;
};

export function JobNotesCard({
  notes,
  newNote,
  onNewNoteChange,
  onAddNote,
}: JobNotesCardProps) {
  const hasNotes = notes.length > 0;

  return (
    <Card className={styles.notesCard}>
      <CardTitle className={styles.sectionTitle}>My notes</CardTitle>
      {hasNotes ? (
        <CardDescription>
          Track application strategy, blockers, and interview prep notes.
        </CardDescription>
      ) : null}
      <div className={styles.fieldGroup}>
        <label htmlFor="job-new-note" className={styles.label}>
          Add Note
        </label>
        <Textarea
          id="job-new-note"
          value={newNote}
          onChange={(event) => onNewNoteChange(event.target.value)}
          className={styles.noteTextarea}
        />
        <Button
          variant="secondary"
          className={styles.inlineAction}
          onClick={onAddNote}
        >
          Add Note
        </Button>
      </div>
      {hasNotes ? (
        <div className={styles.notesList}>
          {notes.map((note) => (
            <div key={note.id} className={styles.noteItem}>
              <p className={styles.noteContent}>{note.content}</p>
              <p className={styles.noteDate}>
                {new Date(note.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
