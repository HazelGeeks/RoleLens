"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "@/components/resume/resume-page-client.module.css";

export type PaperSize = "A4" | "Letter";

const paperDimensions = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
};

export function DocumentPaper({
  children,
  label,
  onOverflow,
  paperSize = "A4",
}: {
  paperSize?: PaperSize;
  children: ReactNode;
  label: string;
  onOverflow: (overflow: boolean) => void;
}) {
  const { width, height } = paperDimensions[paperSize];
  const pageRef = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const parent = pageRef.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setScale(Math.min(1, entry.contentRect.width / ((width * 96) / 25.4)));
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [width]);
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const measure = () => onOverflow(page.scrollHeight > page.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    if (page.firstElementChild) observer.observe(page.firstElementChild);
    return () => observer.disconnect();
  }, [children, onOverflow, paperSize]);
  return (
    <>
      <style>{`@media print { @page { size: ${paperSize}; margin: 0; } }`}</style>
      <article
        ref={pageRef}
        className={styles.paper}
        style={{ zoom: scale, width: `${width}mm`, height: `${height}mm` }}
        aria-label={label}
      >
        <div>{children}</div>
      </article>
    </>
  );
}
