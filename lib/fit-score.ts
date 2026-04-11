export type FitBreakdown = {
  react: number;
  typescript: number;
  nextjs: number;
  frontend: number;
  experience: number;
  workAuthorizationRisk: number;
  overall: number;
};

function scoreByKeywords(text: string, keywords: string[]) {
  const lower = text.toLowerCase();
  const hits = keywords.reduce((acc, keyword) => (lower.includes(keyword) ? acc + 1 : acc), 0);
  return Math.min(100, Math.round((hits / keywords.length) * 100));
}

function inferExperienceScore(seniority?: string | null) {
  const value = (seniority ?? "").toLowerCase();
  if (!value) return 60;
  if (value.includes("junior") || value.includes("entry")) return 90;
  if (value.includes("mid")) return 80;
  if (value.includes("senior")) return 65;
  if (value.includes("staff") || value.includes("lead")) return 50;
  return 60;
}

function inferWorkAuthorizationRisk(note?: string | null) {
  const value = (note ?? "").toLowerCase();
  if (!value) return 75;
  if (value.includes("citizen") || value.includes("pr only")) return 35;
  if (value.includes("must be authorized")) return 55;
  if (value.includes("open") || value.includes("visa")) return 80;
  return 70;
}

export function calculateFitScore(input: {
  title: string;
  descriptionRaw: string;
  seniority?: string | null;
  workAuthorizationNote?: string | null;
}): FitBreakdown {
  const text = `${input.title} ${input.descriptionRaw}`;

  const react = scoreByKeywords(text, ["react", "react.js", "reactjs", "hooks"]);
  const typescript = scoreByKeywords(text, ["typescript", "ts", "strict typing"]);
  const nextjs = scoreByKeywords(text, ["next.js", "nextjs", "app router", "ssr"]);
  const frontend = scoreByKeywords(text, ["frontend", "ui", "ux", "accessibility", "css", "design system"]);
  const experience = inferExperienceScore(input.seniority);
  const workAuthorizationRisk = inferWorkAuthorizationRisk(input.workAuthorizationNote);

  const overall = Math.round(
    react * 0.2 +
      typescript * 0.2 +
      nextjs * 0.15 +
      frontend * 0.2 +
      experience * 0.15 +
      workAuthorizationRisk * 0.1,
  );

  return {
    react,
    typescript,
    nextjs,
    frontend,
    experience,
    workAuthorizationRisk,
    overall,
  };
}

export function extractSkills(descriptionRaw: string) {
  const normalized = descriptionRaw.toLowerCase();
  const dictionary = [
    "react",
    "typescript",
    "next.js",
    "javascript",
    "graphql",
    "rest",
    "tailwind",
    "css",
    "accessibility",
    "testing",
    "jest",
    "playwright",
    "storybook",
  ];

  const hasSkill = (skill: string) => {
    const plain = skill.replaceAll(".", "").toLowerCase();
    return normalized.includes(skill.toLowerCase()) || normalized.includes(plain);
  };

  return dictionary
    .filter(hasSkill)
    .map((skill) => {
      if (skill === "next.js") return "Next.js";
      if (skill === "typescript") return "TypeScript";
      if (skill === "javascript") return "JavaScript";
      return skill.charAt(0).toUpperCase() + skill.slice(1);
    });
}
