"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { AuthRequiredModal } from "@/components/auth/auth-required-modal";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { statusLabels } from "@/lib/constants";
import type { LocalJobPosting } from "@/lib/local-jobs";
import {
  reviewResumeForJobs,
  type ResumeReviewResult,
} from "@/lib/resume-review";
import { useLiveLocalJobs } from "@/lib/use-live-local-jobs";

type ResumeDraft = {
  headline: string;
  resumeText: string;
};

function getResumeDraftStorageKey(userId: string) {
  return `rolelens.resume.draft.${userId}`;
}

function toResumeTargetJobs(jobs: LocalJobPosting[]) {
  return jobs.map((job) => ({
    id: job.id,
    company: job.company,
    title: job.title,
    status: job.status,
    extractedSkills: job.extractedSkills,
    fitScore: job.fitScore,
  }));
}

export function ResumePageClient() {
  const { status, user } = useAuth();
  const { jobs } = useLiveLocalJobs();
  const [headline, setHeadline] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [review, setReview] = useState<ResumeReviewResult | null>(null);

  const candidateJobs = useMemo(
    () => jobs.filter((job) => job.status !== "ARCHIVE"),
    [jobs],
  );

  const selectedJobs = useMemo(
    () => candidateJobs.filter((job) => selectedJobIds.includes(job.id)),
    [candidateJobs, selectedJobIds],
  );

  const toggleJob = useCallback((jobId: string) => {
    setSelectedJobIds((current) =>
      current.includes(jobId)
        ? current.filter((id) => id !== jobId)
        : [...current, jobId],
    );
  }, []);

  useEffect(() => {
    if (!user) {
      setHeadline("");
      setResumeText("");
      setReview(null);
      return;
    }

    const storageKey = getResumeDraftStorageKey(user.id);
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setHeadline("");
      setResumeText("");
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<ResumeDraft>;
      if (typeof parsed.headline === "string") setHeadline(parsed.headline);
      if (typeof parsed.resumeText === "string") setResumeText(parsed.resumeText);
    } catch {
      window.localStorage.removeItem(storageKey);
      setHeadline("");
      setResumeText("");
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const storageKey = getResumeDraftStorageKey(user.id);
    const draft: ResumeDraft = {
      headline,
      resumeText,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [headline, resumeText, user]);

  useEffect(() => {
    setSelectedJobIds((current) => {
      const availableIds = new Set(candidateJobs.map((job) => job.id));
      const kept = current.filter((jobId) => availableIds.has(jobId));
      if (kept.length > 0) return kept;

      const defaults = candidateJobs
        .filter((job) => ["SAVE", "INTEREST", "SUBMITTED"].includes(job.status))
        .map((job) => job.id);

      return defaults.length > 0
        ? defaults
        : candidateJobs.slice(0, 8).map((job) => job.id);
    });
  }, [candidateJobs]);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const isTextLike =
        file.type.startsWith("text/") || /\.(txt|md|markdown)$/i.test(file.name);

      if (!isTextLike) {
        setUploadMessage(null);
        setErrorMessage(
          "This version supports .txt or .md upload. For PDF/DOCX, paste text below.",
        );
        event.currentTarget.value = "";
        return;
      }

      const fileText = (await file.text()).trim();
      if (!fileText) {
        setUploadMessage(null);
        setErrorMessage("Uploaded file is empty. Please choose a file with content.");
        event.currentTarget.value = "";
        return;
      }

      setResumeText(fileText);
      setUploadMessage(`${file.name} uploaded and parsed.`);
      setErrorMessage(null);
      event.currentTarget.value = "";
    },
    [],
  );

  const handleReview = useCallback(() => {
    const normalizedResumeText = resumeText.trim();
    if (!normalizedResumeText) {
      setErrorMessage("Add resume text before running the review.");
      setReview(null);
      return;
    }

    if (selectedJobs.length === 0) {
      setErrorMessage("Select at least one target posting for fit review.");
      setReview(null);
      return;
    }

    const reviewed = reviewResumeForJobs({
      resumeText: [headline.trim(), normalizedResumeText].filter(Boolean).join("\n\n"),
      jobs: toResumeTargetJobs(selectedJobs),
    });

    setReview(reviewed);
    setErrorMessage(null);
  }, [headline, resumeText, selectedJobs]);

  if (status === "loading") {
    return (
      <Card role="status" aria-live="polite" className="mx-auto mt-16 max-w-md">
        <CardTitle>Checking session...</CardTitle>
        <CardDescription>
          We are verifying your account before opening the resume workspace.
        </CardDescription>
      </Card>
    );
  }

  if (!user) {
    return (
      <AuthRequiredModal
        id="resume-auth-required"
        title="Resume review requires login"
        description="Sign in to upload your resume and review how well it matches your saved job postings."
      />
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Resume Studio</h2>
        <p className="text-sm text-slate-500">
          Upload or paste your resume, review strengths, and check fit against your
          target postings.
        </p>
      </header>

      <Card className="space-y-3">
        <CardTitle>Resume content</CardTitle>
        <CardDescription>
          Keep visible details concise and measurable (impact, stack, ownership).
        </CardDescription>

        <div className="space-y-2">
          <label htmlFor="resume-headline" className="text-sm font-medium">
            Headline
          </label>
          <Input
            id="resume-headline"
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            placeholder="Frontend Engineer | React + TypeScript"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="resume-file" className="text-sm font-medium">
            Upload resume file (.txt, .md)
          </label>
          <Input
            id="resume-file"
            type="file"
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            onChange={handleFileChange}
          />
          <p className="text-xs text-slate-500">
            PDF and DOCX parsing is not included yet. Paste text below for those
            formats.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="resume-text" className="text-sm font-medium">
            Resume text
          </label>
          <Textarea
            id="resume-text"
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
            className="min-h-[220px]"
            placeholder="Paste your latest resume content here..."
          />
        </div>

        {uploadMessage ? (
          <p className="text-sm text-green-700 dark:text-green-300">{uploadMessage}</p>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <CardTitle>Target postings</CardTitle>
        <CardDescription>
          Select postings to measure how well your resume matches each role.
        </CardDescription>

        {candidateJobs.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No tracked postings yet. Save at least one posting first.
            <span className="ml-2 inline-block">
              <Link href="/jobs/new" className="font-medium text-blue-700 underline">
                Save a posting
              </Link>
            </span>
          </p>
        ) : (
          <ul className="space-y-2">
            {candidateJobs.map((job) => {
              const checked = selectedJobIds.includes(job.id);
              return (
                <li key={job.id}>
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleJob(job.id)}
                      className="mt-0.5 h-4 w-4"
                      aria-label={`Select posting: ${job.title} at ${job.company}`}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900 dark:text-slate-100">
                        {job.title}
                      </span>
                      <span className="block text-slate-500">
                        {job.company} · {statusLabels[job.status]}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleReview}>Review resume fit</Button>
        </div>

        {errorMessage ? (
          <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
        ) : null}
      </Card>

      {review ? (
        <Card className="space-y-3">
          <CardTitle>Review result</CardTitle>
          <CardDescription>
            Overall fit score across selected postings: {review.overallScore}
          </CardDescription>

          <div className="space-y-2 text-sm">
            <p className="font-medium">Strengths</p>
            <ul className="list-disc space-y-1 pl-5">
              {review.strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-2 text-sm">
            <p className="font-medium">Recommendations</p>
            <ul className="list-disc space-y-1 pl-5">
              {review.recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Role-by-role fit</p>
            <ul className="space-y-2">
              {review.jobFits.map((jobFit) => (
                <li
                  key={jobFit.jobId}
                  className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                >
                  <p className="font-medium">
                    {jobFit.title} · {jobFit.company}
                  </p>
                  <p className="text-sm text-slate-500">Fit score: {jobFit.score}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Matched skills: {jobFit.matchedSkills.join(", ") || "None"}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Missing skills: {jobFit.missingSkills.join(", ") || "None"}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
