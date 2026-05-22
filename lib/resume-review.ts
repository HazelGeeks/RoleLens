import type { JobStatus } from "@/lib/local-jobs";

export type ResumeTargetJob = {
  id: string;
  company: string;
  title: string;
  status: JobStatus;
  extractedSkills: string[];
  fitScore: number;
};

export type ResumeJobFit = {
  jobId: string;
  title: string;
  company: string;
  status: JobStatus;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  recommended: boolean;
};

export type ResumeReviewResult = {
  overallScore: number;
  resumeSkills: string[];
  strengths: string[];
  recommendations: string[];
  jobFits: ResumeJobFit[];
};

const RESUME_SKILL_DICTIONARY = [
  "react",
  "typescript",
  "next.js",
  "nextjs",
  "javascript",
  "html",
  "css",
  "tailwind",
  "accessibility",
  "jest",
  "vitest",
  "playwright",
  "cypress",
  "storybook",
  "graphql",
  "rest",
  "redux",
  "zustand",
] as const;

function normalizeSkill(value: string) {
  return value.trim().toLowerCase().replace(/\./g, "");
}

function uniqueCasePreserved(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeSkill(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }

  return result;
}

export function extractResumeSkills(resumeText: string) {
  const normalized = resumeText.toLowerCase();

  const matched = RESUME_SKILL_DICTIONARY.filter((skill) => {
    const plain = normalizeSkill(skill);
    return normalized.includes(skill) || normalized.includes(plain);
  }).map((skill) => {
    if (skill === "nextjs" || skill === "next.js") return "Next.js";
    if (skill === "typescript") return "TypeScript";
    if (skill === "javascript") return "JavaScript";
    return skill.charAt(0).toUpperCase() + skill.slice(1);
  });

  return uniqueCasePreserved(matched);
}

function buildJobFit(args: {
  job: ResumeTargetJob;
  resumeSkills: string[];
  resumeText: string;
}): ResumeJobFit {
  const requiredSkills = uniqueCasePreserved(args.job.extractedSkills);
  const normalizedResumeSkills = new Set(args.resumeSkills.map(normalizeSkill));

  const matchedSkills = requiredSkills.filter((skill) =>
    normalizedResumeSkills.has(normalizeSkill(skill)),
  );
  const missingSkills = requiredSkills.filter(
    (skill) => !normalizedResumeSkills.has(normalizeSkill(skill)),
  );

  const overlapScore =
    requiredSkills.length === 0
      ? 60
      : Math.round((matchedSkills.length / requiredSkills.length) * 100);

  const titleKeywords = args.job.title
    .toLowerCase()
    .split(/[^a-z0-9+.#]+/)
    .filter((token) => token.length >= 4);

  const titleHits = titleKeywords.filter((keyword) =>
    args.resumeText.toLowerCase().includes(keyword),
  ).length;
  const titleScore =
    titleKeywords.length === 0
      ? 60
      : Math.round((titleHits / titleKeywords.length) * 100);

  const score = Math.round(
    overlapScore * 0.65 + args.job.fitScore * 0.25 + titleScore * 0.1,
  );

  return {
    jobId: args.job.id,
    title: args.job.title,
    company: args.job.company,
    status: args.job.status,
    score,
    matchedSkills,
    missingSkills,
    recommended: score >= 70,
  };
}

export function reviewResumeForJobs(input: {
  resumeText: string;
  jobs: ResumeTargetJob[];
}): ResumeReviewResult {
  const resumeText = input.resumeText.trim();
  const resumeSkills = extractResumeSkills(resumeText);

  const jobFits = input.jobs
    .map((job) =>
      buildJobFit({
        job,
        resumeSkills,
        resumeText,
      }),
    )
    .sort((left, right) => right.score - left.score);

  const overallScore =
    jobFits.length === 0
      ? 0
      : Math.round(
          jobFits.reduce((total, jobFit) => total + jobFit.score, 0) /
            jobFits.length,
        );

  const missingSkillCounts = new Map<string, number>();
  for (const jobFit of jobFits) {
    for (const skill of jobFit.missingSkills) {
      missingSkillCounts.set(skill, (missingSkillCounts.get(skill) ?? 0) + 1);
    }
  }

  const topMissingSkills = Array.from(missingSkillCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([skill]) => skill);

  const strengths =
    resumeSkills.length > 0
      ? [
          `Detected core skills: ${resumeSkills.slice(0, 5).join(", ")}${resumeSkills.length > 5 ? ", ..." : ""}.`,
          `Top-fit role score: ${jobFits[0]?.score ?? 0}.`,
        ]
      : ["No skill keywords were detected yet. Add a detailed resume summary."];

  const recommendations: string[] = [];
  if (resumeText.length < 500) {
    recommendations.push(
      "Add more project details (impact, metrics, and used stack) to improve review accuracy.",
    );
  }
  if (topMissingSkills.length > 0) {
    recommendations.push(
      `Consider adding examples for these frequently requested skills: ${topMissingSkills.join(", ")}.`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Your resume aligns well. Tailor bullet points per target role before applying.",
    );
  }

  return {
    overallScore,
    resumeSkills,
    strengths,
    recommendations,
    jobFits,
  };
}
