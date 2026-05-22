import { describe, expect, it } from "vitest";
import type { LocalJobPosting } from "@/lib/local-jobs";
import {
  buildPredictedInterviewQuestions,
  evaluateSpokenAnswer,
} from "@/lib/interview-practice";

function buildJob(seed: {
  id: string;
  title: string;
  company: string;
  extractedSkills: string[];
}): LocalJobPosting {
  const now = "2026-05-22T00:00:00.000Z";

  return {
    id: seed.id,
    source: "LINKEDIN",
    sourceUrl: `https://example.com/jobs/${seed.id}`,
    company: seed.company,
    title: seed.title,
    remoteType: "REMOTE",
    descriptionRaw: "Role description",
    extractedSkills: seed.extractedSkills,
    fitScore: 80,
    status: "INTEREST",
    statusHistory: [
      {
        id: `history-${seed.id}`,
        status: "INTEREST",
        changedAt: now,
      },
    ],
    tags: [],
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe("interview practice helpers", () => {
  it("builds predicted questions from target jobs and skills", () => {
    const jobs = [
      buildJob({
        id: "job-1",
        title: "Frontend Engineer",
        company: "Acme",
        extractedSkills: ["React", "TypeScript"],
      }),
    ];

    const questions = buildPredictedInterviewQuestions(jobs, 8);

    expect(questions.length).toBeGreaterThan(2);
    expect(
      questions.some((question) =>
        question.prompt.includes("Frontend Engineer") &&
        question.prompt.includes("Acme"),
      ),
    ).toBe(true);
    expect(
      questions.some((question) => question.prompt.toLowerCase().includes("react")),
    ).toBe(true);
  });

  it("deduplicates repeated prompts", () => {
    const jobs = [
      buildJob({
        id: "job-1",
        title: "Frontend Engineer",
        company: "Acme",
        extractedSkills: ["React"],
      }),
      buildJob({
        id: "job-2",
        title: "Frontend Engineer",
        company: "Acme",
        extractedSkills: ["React"],
      }),
    ];

    const questions = buildPredictedInterviewQuestions(jobs, 20);
    const uniquePrompts = new Set(questions.map((question) => question.prompt));

    expect(uniquePrompts.size).toBe(questions.length);
  });

  it("evaluates spoken answers with actionable feedback", () => {
    const feedback = evaluateSpokenAnswer({
      prompt: "Tell me about a challenge you solved with TypeScript.",
      transcript:
        "First, I audited our weakly typed API module and found repeated runtime failures around response parsing. Then I introduced strict TypeScript contracts and runtime validation for edge payloads because we needed a safe rollout path. The result was a 30 percent drop in production errors, faster incident response, and clearer ownership across backend and frontend teams.",
    });

    expect(feedback.summary.length).toBeGreaterThan(0);
    expect(feedback.level).not.toBe("Needs Work");
  });
});

