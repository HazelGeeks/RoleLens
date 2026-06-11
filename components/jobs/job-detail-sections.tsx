import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { sourceLabels, statusLabels, statusOptions } from "@/lib/constants";
import {
  formatCurrency,
  prettifyEnum,
  statusBadgeColor,
} from "@/lib/presentation";
import type { LocalJobPosting } from "@/lib/local-jobs";
import styles from "./job-detail-sections.module.css";

function decodeHtmlEntities(value: string) {
  let next = value;

  // Decode repeatedly so values like "&amp;lt;h2&amp;gt;" also normalize.
  for (let i = 0; i < 3; i += 1) {
    const decoded = next
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
        String.fromCodePoint(parseInt(hex, 16)),
      )
      .replace(/&#([0-9]+);/g, (_, dec: string) =>
        String.fromCodePoint(parseInt(dec, 10)),
      );

    if (decoded === next) break;
    next = decoded;
  }

  return next;
}

function normalizeDescriptionForDisplay(value: string) {
  const decoded = decodeHtmlEntities(value);
  const withBreaks = decoded
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(
      /<\/(p|div|section|article|li|ul|ol|h[1-6]|tr|table|blockquote)>/gi,
      "\n",
    )
    .replace(
      /<(p|div|section|article|li|ul|ol|h[1-6]|tr|table|blockquote)\b[^>]*>/gi,
      "\n",
    )
    .replace(/<[^>]+>/g, " ");

  const lines = withBreaks
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return lines.join("\n");
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
      <Link href="/" className={styles.backLink}>
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
    prettifyEnum(job.remoteType),
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
        <Link href="/" className={styles.backLink}>
          Back to list
        </Link>
      </div>
    </header>
  );
}

type JobOverviewCardProps = {
  job: LocalJobPosting;
  statusValue: (typeof statusOptions)[number] | "";
  onStatusChange: (value: (typeof statusOptions)[number]) => void;
  onSaveStatus: () => void;
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
  statusValue,
  onStatusChange,
  onSaveStatus,
  nextActionInput,
  onNextActionChange,
  followUpDateInput,
  onFollowUpDateChange,
  onSetFollowUpAfterDays,
  onSaveFollowUp,
  isFollowUpOverdue,
}: JobOverviewCardProps) {
  const badges = [
    { label: statusLabels[job.status], color: statusBadgeColor(job.status) },
    { label: sourceLabels[job.source] },
    { label: prettifyEnum(job.remoteType) },
    job.employmentType ? { label: prettifyEnum(job.employmentType) } : null,
    job.seniority ? { label: job.seniority } : null,
  ].filter((item): item is { label: string; color?: string } =>
    Boolean(item && item.label && item.label !== "-"),
  );
  const hasFitScore = job.fitScore !== null && job.fitScore !== undefined;
  const hasSourceUrl = Boolean(job.sourceUrl);
  const hasNextAction = Boolean(nextActionInput.trim());
  const hasFollowUpDate = Boolean(followUpDateInput.trim());
  const hasFollowUpContent = hasNextAction || hasFollowUpDate || isFollowUpOverdue;
  const salaryRange = formatSalaryRange(job);

  return (
    <Card className={styles.overview}>
      {badges.length > 0 ? (
        <div className={styles.badgeRow}>
          {badges.map((badge) => (
            <Badge key={badge.label} color={badge.color}>
              {badge.label}
            </Badge>
          ))}
        </div>
      ) : null}

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
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Status</h3>
          <div className={styles.statusControl}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Update Status</label>
              <Select
                value={statusValue || job.status}
                onChange={(event) =>
                  onStatusChange(
                    event.target.value as (typeof statusOptions)[number],
                  )
                }
              >
                {statusOptions.map((item) => (
                  <option key={item} value={item}>
                    {statusLabels[item]}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="secondary" onClick={onSaveStatus}>
              Save Status
            </Button>
          </div>
        </div>

        <div className={`${styles.panel} ${!hasFollowUpContent ? styles.compactPanel : ""}`}>
          <h3 className={styles.panelTitle}>Follow-up Automation</h3>
          <div className={styles.followUpGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Next Action</label>
              <Textarea
                value={nextActionInput}
                onChange={(event) => onNextActionChange(event.target.value)}
                className="min-h-[90px]"
                placeholder="Example: submit application, then follow up with recruiter"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Follow-up Date</label>
              <Input
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
                  +3d
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onSetFollowUpAfterDays(7)}
                >
                  +7d
                </Button>
              </div>
              <Button type="button" variant="secondary" onClick={onSaveFollowUp}>
                Save Follow-up
              </Button>
              {isFollowUpOverdue ? (
                <p className={styles.dueText}>Follow-up is due now.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

type JobInsightCardsProps = {
  job: LocalJobPosting;
};

export function JobInsightCards({ job }: JobInsightCardsProps) {
  const breakdown = job.fitBreakdown ?? null;
  const description = normalizeDescriptionForDisplay(job.descriptionRaw);
  const hasDescription = Boolean(description);
  const hasSkills = job.extractedSkills.length > 0;
  const hasBreakdown = Boolean(breakdown && Object.keys(breakdown).length > 0);
  const hasStatusHistory = job.statusHistory.length > 0;
  const hasSidePanels = hasSkills || hasBreakdown || hasStatusHistory;

  return (
    <div className={hasSidePanels && hasDescription ? styles.insightGrid : styles.singleColumnGrid}>
      {hasDescription ? (
        <Card className={`${styles.descriptionCard} space-y-3`}>
          <CardTitle>Description</CardTitle>
          <p className={styles.descriptionText}>
            {description}
          </p>
        </Card>
      ) : null}

      {hasSidePanels ? (
        <div className={styles.sideStack}>
        {hasSkills || hasBreakdown ? (
          <Card className="space-y-3">
            <CardTitle>Skills & Fit</CardTitle>
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
          <Card className="space-y-3">
            <CardTitle>Status Timeline</CardTitle>
            <div className={styles.timeline}>
              {job.statusHistory.slice(0, 8).map((item) => (
                <div key={item.id} className={styles.timelineItem}>
                  <p className={styles.timelineStatus}>
                    {statusLabels[item.status]}
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
    <Card className={`${styles.notesCard} space-y-3`}>
      <CardTitle>Notes</CardTitle>
      {hasNotes ? (
        <CardDescription>
          Track application strategy, blockers, and interview prep notes.
        </CardDescription>
      ) : null}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Add Note</label>
        <Textarea
          value={newNote}
          onChange={(event) => onNewNoteChange(event.target.value)}
          className="min-h-[100px]"
        />
        <Button variant="secondary" onClick={onAddNote}>
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
