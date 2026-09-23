/**
 * Build a safe default filename for "Print / Save PDF".
 *
 * Browsers derive the suggested PDF filename from `document.title`, so the
 * workspace sets the title to the document's name just before printing.
 * This helper strips characters that are illegal in file names while keeping
 * readable Unicode (e.g. Korean) intact.
 */
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;
const ILLEGAL_FILENAME_CHARS = /[/\\?%*:|"<>]/g;

export function toPrintFileName(title: string, fallbackLabel: string): string {
  const cleaned = title
    .replace(CONTROL_CHARS, " ")
    .replace(ILLEGAL_FILENAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  const base = cleaned || fallbackLabel.trim() || "document";
  return base.slice(0, 120);
}
