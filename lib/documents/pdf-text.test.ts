// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { MAX_PDF_SIZE_BYTES, PdfReadError, extractPdfText } from "./pdf-text";

function file(
  content: string | ArrayBuffer,
  name = "resume.pdf",
  type = "application/pdf",
): File {
  return new File([content], name, { type });
}

describe("extractPdfText validation", () => {
  it("rejects non-PDF files", async () => {
    await expect(
      extractPdfText(file("hello", "notes.txt", "text/plain")),
    ).rejects.toThrowError(PdfReadError);
    await expect(
      extractPdfText(file("hello", "notes.txt", "text/plain")),
    ).rejects.toThrow("Please choose a PDF file.");
  });

  it("rejects oversized and empty files without loading the reader", async () => {
    const big = new File([new ArrayBuffer(MAX_PDF_SIZE_BYTES + 1)], "big.pdf", {
      type: "application/pdf",
    });
    await expect(extractPdfText(big)).rejects.toThrow("larger than 10 MB");
    await expect(extractPdfText(file("", "empty.pdf"))).rejects.toThrow(
      "empty",
    );
  });

  it("rejects files without a PDF header", async () => {
    await expect(
      extractPdfText(file("definitely not a pdf", "fake.pdf")),
    ).rejects.toThrow("does not look like a PDF");
  });

  it("extracts text from a real PDF document", async () => {
    const pdf = buildPdf([
      "Jordan Lee",
      "jordan@example.com",
      "Experience",
      "Designer @ Acme 2020-05 - Present",
    ]);
    const bytes = new Uint8Array(pdf.length);
    bytes.set(pdf);
    const text = await extractPdfText(
      new File([bytes], "resume.pdf", { type: "application/pdf" }),
    );
    expect(text).toContain("Jordan Lee");
    expect(text).toContain("Designer @ Acme");
  });
});

/** Minimal valid single-page PDF with uncompressed text. ASCII only. */
function buildPdf(textLines: string[]): Uint8Array {
  const escape = (value: string): string =>
    value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = textLines
    .map(
      (line, index) =>
        `BT /F1 12 Tf 72 ${720 - index * 18} Td (${escape(line)}) Tj ET`,
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
