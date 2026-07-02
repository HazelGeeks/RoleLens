"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarCheck, LockKeyhole, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import styles from "./protected-route.module.css";

const demoHref =
  "mailto:hello@rolelens.app?subject=RoleLens%20demo%20request&body=Hi%20RoleLens%20team%2C%0A%0AI%27d%20like%20to%20book%20a%20demo.";

type ProtectedRouteProps = {
  children: ReactNode;
  featureName: string;
  description?: string;
};

export function ProtectedRoute({
  children,
  featureName,
  description,
}: ProtectedRouteProps) {
  const { status } = useAuth();

  if (status === "authenticated") {
    return <>{children}</>;
  }

  if (status === "loading") {
    return (
      <section className={styles.shell} aria-label="Checking account access">
        <div className={styles.loading} role="status" aria-live="polite">
          <span className={styles.loadingBar} />
          <span className={styles.loadingLine} />
          <span className={styles.loadingLineShort} />
        </div>
      </section>
    );
  }

  return (
    <section className={styles.shell} aria-labelledby="protected-route-title">
      <div className={styles.gate}>
        <div className={styles.icon} aria-hidden="true">
          <LockKeyhole size={23} />
        </div>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Account required</p>
          <h2 id="protected-route-title">Sign up to use {featureName}.</h2>
          <p>
            {description ??
              "RoleLens keeps live job data, resume work, and interview prep behind account access. Create an account or book a demo to continue."}
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/signup" className={styles.primaryAction}>
            <UserPlus size={16} />
            Sign up
          </Link>
          <a href={demoHref} className={styles.secondaryAction}>
            <CalendarCheck size={16} />
            Book a Demo
          </a>
          <Link href="/login" className={styles.textAction}>
            <LogIn size={16} />
            Login
          </Link>
        </div>
      </div>
    </section>
  );
}
