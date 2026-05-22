import type { LocalJobPosting } from "@/lib/local-jobs";

export type InterviewQuestionSource = "predicted" | "manual";

export type InterviewQuestion = {
  id: string;
  prompt: string;
  source: InterviewQuestionSource;
  relatedJobId?: string;
};

export type InterviewFeedbackLevel = "Needs Work" | "Good" | "Strong";

export type InterviewFeedback = {
  level: InterviewFeedbackLevel;
  summary: string;
  tips: string[];
};

const BEHAVIORAL_PROMPTS = [
  "Tell me about a project where you had to align stakeholders with conflicting priorities.",
  "Describe a technical decision you made with incomplete information and how you reduced risk.",
  "Walk me through a time when your first implementation failed and how you iterated.",
  "How do you prioritize scope when deadlines are fixed but requirements keep changing?",
] as const;

const STRUCTURE_CUES = [
  "first",
  "then",
  "because",
  "result",
  "impact",
  "learned",
] as const;

function normalizePrompt(prompt: string) {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}

function hashToId(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  return `interview-${Math.abs(hash).toString(16)}`;
}

function dedupePrompts(questions: InterviewQuestion[]) {
  const unique = new Map<string, InterviewQuestion>();
  for (const question of questions) {
    const key = normalizePrompt(question.prompt);
    if (unique.has(key)) continue;
    unique.set(key, question);
  }

  return Array.from(unique.values());
}

function getTopSkills(jobs: LocalJobPosting[], maxSkills = 8) {
  const counts = new Map<string, number>();

  for (const job of jobs) {
    for (const skill of job.extractedSkills) {
      const normalized = skill.trim();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, maxSkills)
    .map(([skill]) => skill);
}

function toQuestion(seed: {
  prompt: string;
  relatedJobId?: string;
}): InterviewQuestion {
  return {
    id: hashToId(`${seed.relatedJobId || "global"}:${seed.prompt}`),
    prompt: seed.prompt,
    source: "predicted",
    relatedJobId: seed.relatedJobId,
  };
}

function normalizeTranscript(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function buildPredictedInterviewQuestions(
  jobs: LocalJobPosting[],
  maxQuestions = 20,
) {
  const targetJobs = jobs
    .filter((job) => job.status !== "ARCHIVE")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8);

  const generated: InterviewQuestion[] = [];

  for (const job of targetJobs) {
    generated.push(
      toQuestion({
        relatedJobId: job.id,
        prompt: `Why are you interested in the ${job.title} role at ${job.company}?`,
      }),
    );
    generated.push(
      toQuestion({
        relatedJobId: job.id,
        prompt: `What experience from your past work is most relevant to succeeding as a ${job.title}?`,
      }),
    );
  }

  for (const skill of getTopSkills(targetJobs)) {
    generated.push(
      toQuestion({
        prompt: `Tell me about a challenging problem you solved using ${skill}.`,
      }),
    );
  }

  for (const prompt of BEHAVIORAL_PROMPTS) {
    generated.push(toQuestion({ prompt }));
  }

  return dedupePrompts(generated).slice(0, Math.max(4, maxQuestions));
}

export function evaluateSpokenAnswer(input: {
  prompt: string;
  transcript: string;
}): InterviewFeedback {
  const transcript = normalizeTranscript(input.transcript);
  if (!transcript) {
    return {
      level: "Needs Work",
      summary: "No answer captured yet. Start with a concise story and concrete impact.",
      tips: [
        "Answer in 45-90 seconds.",
        "Use Situation -> Action -> Result.",
      ],
    };
  }

  const words = transcript.split(/\s+/);
  const promptKeywords = input.prompt
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .filter((token) => token.length >= 4);
  const transcriptLower = transcript.toLowerCase();

  const structureHits = STRUCTURE_CUES.filter((cue) =>
    transcriptLower.includes(cue),
  ).length;
  const keywordHits = promptKeywords.filter((keyword) =>
    transcriptLower.includes(keyword),
  ).length;

  const score =
    Math.min(words.length / 90, 1) * 40 +
    Math.min(structureHits / 3, 1) * 30 +
    Math.min(keywordHits / 3, 1) * 30;

  const tips: string[] = [];
  if (words.length < 45) {
    tips.push("Add more context and measurable impact to strengthen credibility.");
  }
  if (structureHits < 2) {
    tips.push("Use clear sequencing (first, then, result) so listeners can follow your thinking.");
  }
  if (keywordHits === 0 && promptKeywords.length > 0) {
    tips.push("Mirror one or two keywords from the question to show direct relevance.");
  }
  if (tips.length === 0) {
    tips.push("Good baseline. Tighten wording and add one more quantified outcome.");
  }

  if (score >= 75) {
    return {
      level: "Strong",
      summary: "Strong answer flow. Your response is relevant and well-structured.",
      tips,
    };
  }

  if (score >= 45) {
    return {
      level: "Good",
      summary: "Solid start. Add clearer outcomes and tighter structure for interview-ready delivery.",
      tips,
    };
  }

  return {
    level: "Needs Work",
    summary: "Early draft quality. Expand the story and anchor it with concrete results.",
    tips,
  };
}

