export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 10;
const MAX_PDF_CHARS = 200_000;

export class PdfReadError extends Error {}

type Pdfjs = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<Pdfjs["getDocument"]>["promise"]>;
type PdfTextItem = { str?: unknown; hasEOL?: unknown };

/** Extract plain text from a PDF file entirely in the browser. */
export async function extractPdfText(file: File): Promise<string> {
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  )
    throw new PdfReadError("Please choose a PDF file.");
  if (file.size > MAX_PDF_SIZE_BYTES)
    throw new PdfReadError("This PDF is larger than 10 MB.");
  if (file.size === 0) throw new PdfReadError("This file is empty.");

  const buffer = await file.arrayBuffer();
  const header = new TextDecoder().decode(buffer.slice(0, 5));
  if (!header.startsWith("%PDF-"))
    throw new PdfReadError("This file does not look like a PDF.");

  // No worker bundle is configured on purpose: without workerSrc pdf.js
  // falls back to its main-thread worker, which avoids bundler-specific
  // worker wiring and behaves identically in dev, production, and tests.
  let pdfjs: Pdfjs;
  try {
    pdfjs = await import("pdfjs-dist");
  } catch {
    throw new PdfReadError(
      "The PDF reader could not start. Please reload and try again.",
    );
  }

  let document: PdfDocument | null = null;
  try {
    const loading = pdfjs.getDocument({ data: buffer });
    document = await loading.promise;
    const pages: string[] = [];
    const count = Math.min(document.numPages, MAX_PDF_PAGES);
    for (let index = 1; index <= count; index += 1) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      const items = content.items as PdfTextItem[];
      const text = items
        .map((item) =>
          typeof item.str === "string"
            ? `${item.str}${item.hasEOL ? "\n" : " "}`
            : "",
        )
        .join("")
        .trim();
      if (text) pages.push(text);
      if (pages.join("\n").length > MAX_PDF_CHARS) break;
    }
    const result = pages.join("\n").slice(0, MAX_PDF_CHARS).trim();
    if (!result)
      throw new PdfReadError(
        "No readable text was found. Scanned image PDFs are not supported yet.",
      );
    return result;
  } catch (cause) {
    if (cause instanceof PdfReadError) throw cause;
    throw new PdfReadError(
      "This PDF could not be read. It may be corrupted or password protected.",
    );
  } finally {
    await document?.destroy().catch(() => {});
  }
}
