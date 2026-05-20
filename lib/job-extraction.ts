import { extractSkills } from "@/lib/fit-score";
import type { EmploymentType, JobSource, RemoteType } from "@/lib/local-jobs";

type SupportedCurrency = "CAD" | "USD" | "EUR" | "GBP";

export type ExtractedJobDraft = {
  source?: JobSource;
  company?: string;
  title?: string;
  location?: string;
  remoteType?: RemoteType;
  employmentType?: EmploymentType;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: SupportedCurrency;
  seniority?: string;
  workAuthorizationNote?: string;
  extractedSkills: string[];
  tags: string[];
};

type ExtractJobDraftInput = {
  sourceUrl?: string;
  descriptionRaw?: string;
  existingTitle?: string;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .map((chunk) =>
      chunk ? chunk[0].toUpperCase() + chunk.slice(1).toLowerCase() : chunk,
    )
    .join(" ");
}

function inferSourceFromUrl(sourceUrl?: string): JobSource | undefined {
  if (!sourceUrl) return undefined;
  const lower = sourceUrl.toLowerCase();
  if (lower.includes("linkedin.")) return "LINKEDIN";
  if (lower.includes("indeed.")) return "INDEED";
  if (lower.includes("saramin.co.kr")) return "SARAMIN";
  if (lower.includes("jobkorea.co.kr")) return "JOBKOREA";
  return "MANUAL";
}

function inferCompanyFromUrl(sourceUrl?: string) {
  if (!sourceUrl) return undefined;
  try {
    const hostname = new URL(sourceUrl).hostname.replace(/^www\./i, "");
    const parts = hostname.split(".");
    if (parts.length === 0) return undefined;

    const brandPart =
      parts.length >= 3 && parts[parts.length - 2] === "co"
        ? parts[parts.length - 3]
        : parts[Math.max(parts.length - 2, 0)];

    if (
      !brandPart ||
      ["linkedin", "indeed", "greenhouse", "lever"].includes(
        brandPart.toLowerCase(),
      )
    ) {
      return undefined;
    }

    return toTitleCase(brandPart.replace(/[-_]/g, " "));
  } catch {
    return undefined;
  }
}

function inferCompanyFromText(text: string) {
  const labeled = text.match(
    /(?:company|organization|employer)\s*[:\-]\s*([^\n]{2,80})/i,
  )?.[1];
  if (labeled) return normalizeWhitespace(labeled);

  const sentence = text.match(
    /^([A-Z][A-Za-z0-9&.,'\- ]{2,60})\s+(?:is|seeks|is hiring|hiring)/m,
  )?.[1];
  if (sentence) return normalizeWhitespace(sentence);

  return undefined;
}

function inferTitle(text: string) {
  const labeled = text.match(
    /(?:job\s*title|role\s*title|position|title)\s*[:\-]\s*([^\n]{2,100})/i,
  )?.[1];
  if (labeled) return normalizeWhitespace(labeled);

  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const byKeywords = lines.find(
    (line) =>
      /(frontend|front-end|react|web|ui)/i.test(line) &&
      /(engineer|developer|architect|lead|manager|specialist)/i.test(line) &&
      line.length <= 100,
  );

  if (byKeywords) return byKeywords;
  return undefined;
}

function decodeUriComponentSafe(value: string) {
  const plusNormalized = value.replace(/\+/g, " ");
  try {
    return decodeURIComponent(plusNormalized);
  } catch {
    return plusNormalized;
  }
}

function parseLocationFromSourceUrl(sourceUrl?: string) {
  if (!sourceUrl) return undefined;

  try {
    const parsed = new URL(sourceUrl);
    const location =
      parsed.searchParams.get("location") ?? parsed.searchParams.get("l");
    if (!location) return undefined;

    const cleaned = normalizeWhitespace(location.replace(/^=+/, ""));
    return cleaned || undefined;
  } catch {
    return undefined;
  }
}

function inferLocation(text: string, sourceUrl?: string) {
  const fromSourceUrl = parseLocationFromSourceUrl(sourceUrl);
  if (fromSourceUrl) return fromSourceUrl;

  const labeled = text.match(
    /(?:location|based\s+in|based\s+at)\s*[:\-]\s*([^\n]{2,100})/i,
  )?.[1];
  if (labeled) {
    const cleaned = normalizeWhitespace(
      decodeUriComponentSafe(labeled).replace(/^=+/, ""),
    );
    if (cleaned) return cleaned;
  }

  const queryStyle = text.match(/(?:^|[?&])(?:location|l)=([^&\n]{2,100})/i)?.[1];
  if (queryStyle) {
    const cleaned = normalizeWhitespace(
      decodeUriComponentSafe(queryStyle).replace(/^=+/, ""),
    );
    if (cleaned) return cleaned;
  }

  return undefined;
}

function inferRemoteType(text: string): RemoteType | undefined {
  if (/\bhybrid\b/i.test(text)) return "HYBRID";
  if (/\bremote\b/i.test(text)) return "REMOTE";
  if (/\bonsite\b|on-site|on site/i.test(text)) return "ONSITE";
  return undefined;
}

function inferEmploymentType(text: string): EmploymentType | undefined {
  if (/\bfull[ -]?time\b/i.test(text)) return "FULL_TIME";
  if (/\bpart[ -]?time\b/i.test(text)) return "PART_TIME";
  if (/\bcontract\b/i.test(text)) return "CONTRACT";
  if (/\btemp|temporary\b/i.test(text)) return "TEMPORARY";
  if (/\bintern(ship)?\b/i.test(text)) return "INTERNSHIP";
  if (/\bfreelance\b/i.test(text)) return "FREELANCE";
  return undefined;
}

function inferSeniority(text: string) {
  if (/\bjunior\b|\bentry\b/i.test(text)) return "Junior";
  if (/\bmid\b|\bintermediate\b/i.test(text)) return "Mid";
  if (/\bsenior\b/i.test(text)) return "Senior";
  if (/\bstaff\b/i.test(text)) return "Staff";
  if (/\blead\b|\bprincipal\b/i.test(text)) return "Lead";
  return undefined;
}

function inferWorkAuthorization(text: string) {
  const line = text
    .split(/\r?\n/)
    .map((value) => normalizeWhitespace(value))
    .find((value) =>
      /sponsor|visa|authorized|work permit|citizen|permanent resident|pr only/i.test(
        value,
      ),
    );

  return line || undefined;
}

function parseAmount(input: string) {
  const normalized = input.replace(/[,$\s]/g, "").toLowerCase();
  if (!normalized) return undefined;
  const isK = normalized.endsWith("k");
  const numeric = Number.parseFloat(isK ? normalized.slice(0, -1) : normalized);
  if (!Number.isFinite(numeric)) return undefined;
  return isK ? Math.round(numeric * 1000) : Math.round(numeric);
}

function inferCurrency(
  text: string,
  symbol?: string,
): SupportedCurrency | undefined {
  if (symbol === "$") {
    if (/\bCAD\b/i.test(text)) return "CAD";
    if (/\bUSD\b/i.test(text)) return "USD";
    return "CAD";
  }
  if (symbol === "€") return "EUR";
  if (symbol === "£") return "GBP";
  if (/\bCAD\b/i.test(text)) return "CAD";
  if (/\bUSD\b/i.test(text)) return "USD";
  if (/\bEUR\b/i.test(text)) return "EUR";
  if (/\bGBP\b/i.test(text)) return "GBP";
  return undefined;
}

function inferSalary(text: string) {
  const range = text.match(
    /(?:\b(CAD|USD|EUR|GBP)\b|([$€£]))?\s*(\d{2,3}(?:[,\s]\d{3})+|\d{2,3}\s?[kK]|\d{5,6})\s*(?:-|to|–|~)\s*(\d{2,3}(?:[,\s]\d{3})+|\d{2,3}\s?[kK]|\d{5,6})/i,
  );

  if (range) {
    const symbol = range[2];
    const min = parseAmount(range[3]);
    const max = parseAmount(range[4]);
    return {
      salaryMin: min,
      salaryMax: max,
      salaryCurrency: inferCurrency(text, symbol),
    };
  }

  const single = text.match(
    /(?:\b(CAD|USD|EUR|GBP)\b|([$€£]))\s*(\d{2,3}(?:[,\s]\d{3})+|\d{2,3}\s?[kK]|\d{5,6})/i,
  );
  if (!single) return {};

  const value = parseAmount(single[3]);
  return {
    salaryMin: value,
    salaryMax: value,
    salaryCurrency: inferCurrency(text, single[2]),
  };
}

export function extractJobDraft(
  input: ExtractJobDraftInput,
): ExtractedJobDraft {
  const source = inferSourceFromUrl(input.sourceUrl);
  const description = input.descriptionRaw ?? "";
  const extractionText = [input.existingTitle, description]
    .filter(Boolean)
    .join("\n");

  const salary = inferSalary(extractionText);
  const extractedSkills = Array.from(new Set(extractSkills(extractionText)));

  const tags = new Set<string>();
  if (source) tags.add(source.toLowerCase());

  const remoteType = inferRemoteType(extractionText);
  if (remoteType) tags.add(remoteType.toLowerCase());

  const seniority = inferSeniority(extractionText);
  if (seniority) tags.add(seniority.toLowerCase());

  extractedSkills.slice(0, 4).forEach((skill) => tags.add(skill.toLowerCase()));

  return {
    source,
    company:
      inferCompanyFromText(extractionText) ??
      inferCompanyFromUrl(input.sourceUrl),
    title: inferTitle(extractionText),
    location: inferLocation(extractionText, input.sourceUrl),
    remoteType,
    employmentType: inferEmploymentType(extractionText),
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    salaryCurrency: salary.salaryCurrency,
    seniority,
    workAuthorizationNote: inferWorkAuthorization(extractionText),
    extractedSkills,
    tags: Array.from(tags),
  };
}
