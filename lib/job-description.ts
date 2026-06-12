export const SCRAPED_LINK_PLACEHOLDER_DESCRIPTION_PREFIX = "scraped link from ";

export function normalizeDescriptionWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function isScrapedLinkPlaceholderDescription(value: string) {
  return normalizeDescriptionWhitespace(value)
    .toLowerCase()
    .startsWith(SCRAPED_LINK_PLACEHOLDER_DESCRIPTION_PREFIX);
}

export function sanitizeJobDescription(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  if (isScrapedLinkPlaceholderDescription(normalized)) return "";
  return normalized;
}

function decodeJobDescriptionEntities(value: string) {
  let next = value;

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

function splitLongDescriptionLine(line: string) {
  if (line.length <= 280) return [line];

  const sentences = line
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length <= 1) return [line];

  const paragraphs: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (current && next.length > 320) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) paragraphs.push(current);

  return paragraphs;
}

export function formatJobDescriptionForDisplay(value: unknown) {
  const cleanValue = sanitizeJobDescription(value);
  if (!cleanValue) return "";

  const decoded = decodeJobDescriptionEntities(cleanValue)
    .replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, "$1")
    .replace(/\*\*([^*\n]{2,80})\*\*/g, "\n$1\n")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(
      /<\/(p|div|section|article|li|ul|ol|h[1-6]|tr|table|blockquote)>/gi,
      "\n",
    )
    .replace(
      /<(p|div|section|article|li|ul|ol|h[1-6]|tr|table|blockquote)\b[^>]*>/gi,
      "\n",
    )
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*-{3,}\s*/gm, "")
    .replace(
      /\b(DESCRIPTION|BASIC QUALIFICATIONS|PREFERRED QUALIFICATIONS|KEY JOB RESPONSIBILITIES|RESPONSIBILITIES|REQUIREMENTS|QUALIFICATIONS|ABOUT THE TEAM|BENEFITS)\b\s*:?\s*/g,
      "\n$1\n",
    );

  const lines = decoded
    .split("\n")
    .map((line) => normalizeDescriptionWhitespace(line))
    .filter(Boolean);
  const contentLines =
    lines[0]?.toUpperCase() === "DESCRIPTION" ? lines.slice(1) : lines;

  const formattedLines = contentLines.flatMap(splitLongDescriptionLine);
  return formattedLines.join("\n\n");
}
