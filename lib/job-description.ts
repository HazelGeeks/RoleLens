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
