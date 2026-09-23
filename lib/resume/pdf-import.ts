import {
  emptyEducationEntry,
  emptyResumeEntry,
  emptyResumeProfile,
  resumeProfileSchema,
  type EducationEntry,
  type ResumeEntry,
  type ResumeProfile,
} from "./profile";

type Section = "summary" | "experience" | "projects" | "education" | "skills";

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/;
const URL_RE =
  /(https?:\/\/[^\s),]+|www\.[^\s),]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(com|io|dev|me|co|net|org|app|io|kr|so|github\.io)[^\s),]*)/i;
const YEAR_RE = /(19|20)\d{2}/;
const PRESENT_RE = /\b(present|current|now|ongoing|현재|재직중)\b/i;
const GPA_RE = /(\d{1,3}(?:\.\d{1,2})?)\s*\/\s*(\d{1,3}(?:\.\d{1,2})?)/;

function cleanHeading(line: string): string {
  return line
    .replace(/^[\d.\s)\-|•*#>]+/, "")
    .replace(/[\s_—–\-=|•*#:]+$/, "")
    .trim();
}

function detectSection(line: string): Section | null {
  const text = cleanHeading(line).toLowerCase();
  if (!text) return null;
  if (
    /^(professional\s+)?summary|^(professional\s+)?profile|objective|about(\s+me)?|자기소개|요약|프로필$/.test(
      text,
    )
  )
    return "summary";
  if (
    /experience|employment|work\s+history|career|경력|업무\s*경험|직무\s*경험/.test(
      text,
    ) &&
    !/project/.test(text)
  )
    return "experience";
  if (/project|프로젝트/.test(text)) return "projects";
  if (/education|academic|학력|교육/.test(text)) return "education";
  if (/skill|stack|competenc|기술|스킬|보유\s*역량/.test(text)) return "skills";
  return null;
}

function isContactLine(line: string): boolean {
  return (
    EMAIL_RE.test(line) ||
    URL_RE.test(line) ||
    (PHONE_RE.test(line) && (line.match(/\d/g) ?? []).length >= 9)
  );
}

function parseMonthYear(token: string): string {
  const cleaned = token.trim().replace(/[.,)\]]+$/, "");
  const korean = cleaned.match(/(\d{4})\s*년\s*(\d{1,2})\s*월?/);
  if (korean) return `${korean[1]}-${korean[2].padStart(2, "0")}`;
  const monthName = cleaned.match(/([a-z]+)\s+(\d{4})/i);
  if (monthName && MONTHS[monthName[1].toLowerCase()])
    return `${monthName[2]}-${MONTHS[monthName[1].toLowerCase()]}`;
  const monthFirst = cleaned.match(/([a-z]+)\.?$/i);
  const yearOnly = cleaned.match(/(19|20)\d{2}/);
  if (monthFirst && yearOnly && MONTHS[monthFirst[1].toLowerCase()])
    return `${yearOnly[0]}-${MONTHS[monthFirst[1].toLowerCase()]}`;
  const numeric = cleaned.match(/(19|20)(\d{2})[./-]?(\d{1,2})?/);
  if (numeric) {
    const year = `${numeric[1]}${numeric[2]}`;
    const month = numeric[3]?.padStart(2, "0") ?? "";
    if (!month) return "";
    if (Number(month) < 1 || Number(month) > 12) return "";
    return `${year}-${month}`;
  }
  return "";
}

const DATE_TOKEN =
  "(?:(19|20)\\d{2}[./-]\\d{1,2}|[a-z]+\\s+(19|20)\\d{2}|(19|20)\\d{2}\\s*년\\s*\\d{1,2}\\s*월?)";
const RANGE_RE = new RegExp(
  `(${DATE_TOKEN})\\s*[-~–—]\\s*(present|current|now|ongoing|현재|재직중|${DATE_TOKEN})`,
  "i",
);

function parseDateRange(line: string): { start: string; end: string } {
  const range = line.match(RANGE_RE);
  if (range) {
    return {
      start: parseMonthYear(range[1]),
      end: PRESENT_RE.test(range[5]) ? "" : parseMonthYear(range[5]),
    };
  }
  const single = line.match(
    /((19|20)\d{2}[./-]\d{1,2}|[a-z]+\s+(19|20)\d{2}|(19|20)\d{2}\s*년\s*\d{1,2}\s*월?)/i,
  );
  return { start: single ? parseMonthYear(single[1]) : "", end: "" };
}

function stripDateRange(line: string): string {
  return line
    .replace(
      /\(?\s*(19|20)\d{2}[./-]?(\d{1,2})?(\s*년(\s*\d{1,2}\s*월?)?)?\s*[-~–—]\s*(present|current|now|ongoing|현재|재직중|(19|20)\d{2}[./-]?(\d{1,2})?(\s*년(\s*\d{1,2}\s*월?)?)?)\s*\)?/gi,
      " ",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitTitleOrganization(header: string): {
  title: string;
  organization: string;
} {
  const separators = [" @ ", " | ", " at ", " — ", " – ", " - ", ", ", "·"];
  for (const separator of separators) {
    const index = header.indexOf(separator);
    if (index > 0) {
      return {
        title: header.slice(0, index).trim(),
        organization: header.slice(index + separator.length).trim(),
      };
    }
  }
  return { title: header, organization: "" };
}

function takeLocation(header: string): { text: string; location: string } {
  const match = header.match(/\(([^()]{2,60})\)\s*$/);
  if (!match) return { text: header, location: "" };
  return {
    text: header.slice(0, match.index).trim(),
    location: match[1].trim(),
  };
}

function isEntryStart(raw: string, line: string): boolean {
  if (
    /(19|20)\d{2}\s*[-~–—]\s*((19|20)\d{2}|present|current|now|ongoing|현재|재직중)/i.test(
      line,
    )
  )
    return true;
  // Detail lines often mention a year ("grew revenue 30% in 2023"); only
  // short, unbulleted lines start a new entry.
  const trimmed = raw.trim();
  if (/^[-•*▪◦‣]/.test(trimmed) || /^\d+[.)]/.test(trimmed)) return false;
  if (PRESENT_RE.test(line) && line.length <= 120) return true;
  return YEAR_RE.test(line) && line.length <= 120;
}

function parseEntries(lines: string[]): ResumeEntry[] {
  const entries: ResumeEntry[] = [];
  let current: ResumeEntry | null = null;
  const details: string[] = [];
  const flush = () => {
    if (!current) return;
    current.details = details.join("\n").slice(0, 4000);
    if (
      current.title.trim() ||
      current.organization.trim() ||
      current.details.trim()
    )
      entries.push(current);
  };
  for (const raw of lines) {
    const line = raw.replace(/^[-•*▪◦‣\d.)\s]+/, "").trim();
    if (!line) continue;
    if (isEntryStart(raw, line) || !current) {
      flush();
      details.length = 0;
      current = emptyResumeEntry();
      const { start, end } = parseDateRange(line);
      current.startDate = start;
      current.endDate = end;
      const withoutDates = stripDateRange(line);
      const { text, location } = takeLocation(withoutDates);
      current.location = location.slice(0, 200);
      const { title, organization } = splitTitleOrganization(text);
      current.title = title.slice(0, 200);
      current.organization = organization.slice(0, 200);
      if (!current.title && !current.organization) {
        current.title = line.slice(0, 200);
        current.startDate = "";
        current.endDate = "";
      }
    } else if (current) {
      details.push(line);
    }
  }
  flush();
  return entries.slice(0, 30);
}

const DEGREE_KEYWORDS: { level: EducationEntry["degreeLevel"]; re: RegExp }[] =
  [
    { level: "high-school", re: /high\s*school|고등학교/ },
    { level: "associate", re: /associate|전문학사/ },
    {
      level: "bachelor",
      re: /bachelor|b\.?\s?[as]\.?|bs\b|ba\b|학사/,
    },
    { level: "master", re: /master|m\.?\s?[as]\.?|mba|석사/ },
    { level: "doctorate", re: /ph\.?\s?d|doctor|박사/ },
    { level: "diploma", re: /diploma/ },
    { level: "certificate", re: /certificate|수료/ },
  ];

function parseEducation(lines: string[]): EducationEntry[] {
  const entries: EducationEntry[] = [];
  let current: EducationEntry | null = null;
  const details: string[] = [];
  const flush = () => {
    if (!current) return;
    if (details.length) {
      current.details = details.join("\n").slice(0, 4000);
      current.showDetails = true;
    }
    if (
      current.organization.trim() ||
      (current.major ?? "").trim() ||
      (current.degree ?? "").trim() ||
      (current.details ?? "").trim()
    )
      entries.push(current);
  };
  const startsSchool = (line: string) =>
    /univers|college|school|institute|academy|대학교|대학|고등학교/.test(
      line.toLowerCase(),
    );
  for (const raw of lines) {
    const line = raw.replace(/^[-•*▪◦‣\d.)\s]+/, "").trim();
    if (!line) continue;
    if (startsSchool(line) || !current) {
      flush();
      details.length = 0;
      current = emptyEducationEntry();
      const { text, location } = takeLocation(stripDateRange(line));
      const [school, ...rest] = text.split(",");
      current.organization = school.trim().slice(0, 200);
      const remainder = rest.join(",").trim();
      if (remainder) {
        const degreeHit = DEGREE_KEYWORDS.find(({ re }) =>
          re.test(remainder.toLowerCase()),
        );
        if (degreeHit) {
          current.degreeLevel = degreeHit.level;
          current.degree = remainder.slice(0, 200);
        } else {
          current.major = remainder.slice(0, 200);
          current.majorType = "single";
        }
      } else {
        const korean = text.match(/^(.*?(?:대학교|대학|고등학교))\s+(.+)$/);
        if (korean) {
          current.organization = korean[1].trim().slice(0, 200);
          current.major = korean[2].trim().slice(0, 200);
          current.majorType = "single";
        }
      }
      if (location) {
        current.location = location;
        current.showLocation = true;
      }
      const { start, end } = parseDateRange(line);
      current.startDate = start;
      current.endDate = end;
      if (end) current.dateDisplay = "end-month";
    } else if (current) {
      const degreeHit = DEGREE_KEYWORDS.find(({ re }) =>
        re.test(line.toLowerCase()),
      );
      const majorMatch = line.match(
        /(?:major(?:\s+in)?|전공)\s*[:：]?\s*(.+)/i,
      );
      const gpa = line.match(GPA_RE);
      if (degreeHit) {
        current.degreeLevel = degreeHit.level;
        const inMajor = line.match(/(?:in|전공)\s+(.+)/i);
        if (inMajor && !current.major) {
          current.major = inMajor[1].replace(/[.,;]+$/, "").slice(0, 200);
          current.majorType = "single";
        }
        if (!current.degree) current.degree = line.slice(0, 200);
        const { start, end } = parseDateRange(line);
        if (!current.startDate) current.startDate = start;
        if (!current.endDate) {
          current.endDate = end;
          if (end) current.dateDisplay = "end-month";
        }
      }
      if (majorMatch && !current.major) {
        current.major = majorMatch[1].slice(0, 200);
        current.majorType = "single";
      }
      if (
        gpa &&
        Number(gpa[2]) > 0 &&
        Number(gpa[2]) <= 100 &&
        Number(gpa[1]) <= Number(gpa[2])
      ) {
        current.gpa = gpa[1].slice(0, 10);
        current.gpaScale = gpa[2].slice(0, 10);
      }
      if (degreeHit || majorMatch || gpa) continue;
      details.push(line);
    }
  }
  flush();
  return entries.slice(0, 30);
}

/** Parse plain resume text (e.g. extracted from a PDF) into a profile. */
export function parseResumePdfText(raw: string): ResumeProfile | null {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const sections = new Map<Section, string[]>();
  let current: Section | null = null;
  const header: string[] = [];
  for (const line of lines.slice(0, 400)) {
    const section = detectSection(line);
    if (section) {
      current = section;
      if (!sections.has(section)) sections.set(section, []);
      continue;
    }
    if (current) sections.get(current)?.push(line);
    else if (header.length < 12) header.push(line);
  }

  const profile = emptyResumeProfile();
  // Contact lines often join several items with pipes or bullets.
  const headerParts = header.flatMap((line) =>
    line
      .split(/\s*[|•·]\s*/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
  const email = headerParts
    .map((line) => line.match(EMAIL_RE)?.[0])
    .find(Boolean);
  if (email) profile.email = email.slice(0, 254);
  const phone = headerParts
    .map((line) => {
      const match = line.match(PHONE_RE)?.[1] ?? "";
      return (match.match(/\d/g) ?? []).length >= 9 ? match.trim() : "";
    })
    .find(Boolean);
  if (phone) profile.phone = phone.slice(0, 200);
  const website = headerParts
    .map((line) => {
      if (EMAIL_RE.test(line)) return "";
      const match = line.match(URL_RE)?.[0] ?? "";
      return match.replace(/[.,;:!?]+$/, "");
    })
    .find(Boolean);
  if (website) profile.website = website.slice(0, 200);
  const contactFree = headerParts.filter((line) => !isContactLine(line));
  const name = contactFree.find(
    (line) => line.length <= 60 && !detectSection(line),
  );
  if (name) profile.name = name.slice(0, 200);
  const headline = contactFree.find(
    (line) => line !== name && line.length <= 120 && !detectSection(line),
  );
  if (headline && !profile.headline) profile.headline = headline.slice(0, 200);
  const location = contactFree.find(
    (line) => line !== name && line !== headline && line.includes(","),
  );
  if (location) profile.location = location.slice(0, 200);

  const summary = sections.get("summary") ?? [];
  if (summary.length) profile.summary = summary.join("\n").slice(0, 2000);
  const skills = sections.get("skills") ?? [];
  if (skills.length) profile.skills = skills.join("\n").slice(0, 2000);
  profile.experience = parseEntries(sections.get("experience") ?? []);
  profile.projects = parseEntries(sections.get("projects") ?? []);
  profile.education = parseEducation(sections.get("education") ?? []);

  const parsed = resumeProfileSchema.safeParse(profile);
  if (!parsed.success) return null;
  const filled =
    [
      parsed.data.name,
      parsed.data.headline,
      parsed.data.email,
      parsed.data.phone,
      parsed.data.location,
      parsed.data.website,
      parsed.data.summary,
      parsed.data.skills,
    ].some(Boolean) ||
    parsed.data.experience.length > 0 ||
    parsed.data.projects.length > 0 ||
    parsed.data.education.length > 0;
  return filled ? parsed.data : null;
}
