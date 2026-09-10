"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "@/components/resume/resume-page-client.module.css";

export function DocumentPaper({
  children,
  label,
  onOverflow,
}: {
  children: ReactNode;
  label: string;
  onOverflow: (overflow: boolean) => void;
}) {
  const pageRef = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const parent = pageRef.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setScale(Math.min(1, entry.contentRect.width / ((210 * 96) / 25.4)));
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const measure = () => onOverflow(page.scrollHeight > page.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    if (page.firstElementChild) observer.observe(page.firstElementChild);
    return () => observer.disconnect();
  }, [children, onOverflow]);
  return (
    <article
      ref={pageRef}
      className={styles.paper}
      style={{ zoom: scale }}
      aria-label={label}
    >
      <div>{children}</div>
    </article>
  );
}
