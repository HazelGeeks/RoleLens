"use client";

import Link from "next/link";
import {
  BarChart3,
  ClipboardList,
  FileText,
  LogIn,
  LogOut,
  MessageSquare,
  Target,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./app-frame.module.css";

const navigationItems = [
  { href: "/", label: "Jobs", icon: ClipboardList },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/interview", label: "Interview", icon: MessageSquare },
  { href: "/interview/goals", label: "Goals", icon: Target },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const { status, user, signOut } = useAuth();

  return (
    <div className={styles.shell}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>
      <div className={styles.grid}>
        <aside className={styles.sidebar}>
          <div className={styles.brandRow}>
            <div>
              <p className={styles.eyebrow}>Career Ops</p>
              <h1 className={styles.brandTitle}>RoleLens</h1>
            </div>
            <ThemeToggle />
          </div>
          <nav className={styles.nav} aria-label="Primary navigation">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={styles.navLink}>
                  <Icon size={17} strokeWidth={2.2} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className={styles.navUtility} aria-label="Account actions">
            {status === "loading" ? (
              <span className={styles.userLabel} role="status" aria-live="polite">
                Checking session...
              </span>
            ) : status === "authenticated" && user ? (
              <>
                <span className={styles.userLabel} title={user.email}>
                  {user.name || user.email}
                </span>
                <button
                  type="button"
                  className={styles.authButton}
                  onClick={() => {
                    void signOut();
                  }}
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className={styles.authPrimary}>
                  <LogIn size={15} />
                  Login
                </Link>
                <Link href="/signup" className={styles.authSecondary}>
                  <UserPlus size={15} />
                  Sign up
                </Link>
              </>
            )}
          </div>
        </aside>
        <main id="main-content" tabIndex={-1} className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
