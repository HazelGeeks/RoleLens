/** Build a web link while preserving plain text for incomplete or unsafe input. */
export function getResumeWebsiteHref(website: string): string | null {
  const value = website.trim();
  if (!value || /[\s\u0000-\u001f\u007f]/.test(value)) return null;
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  const candidate = value.startsWith("//")
    ? `https:${value}`
    : hasScheme
      ? value
      : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !url.hostname.includes(".") ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
