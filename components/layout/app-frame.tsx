"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  ClipboardList,
  FileText,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  Target,
  UserPlus,
  X,
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

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
            <div className={styles.brandActions}>
              <ThemeToggle />
              <button
                type="button"
                className={styles.mobileMenuButton}
                aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-navigation-menu"
                onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
              >
                {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>
          <div
            id="mobile-navigation-menu"
            className={`${styles.mobileMenuPanel} ${
              isMobileMenuOpen ? styles.mobileMenuPanelOpen : ""
            }`}
          >
            <nav className={styles.nav} aria-label="Primary navigation">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={styles.navLink}
                    onClick={closeMobileMenu}
                  >
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
                      closeMobileMenu();
                      void signOut();
                    }}
                  >
                    <LogOut size={15} />
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className={styles.authPrimary} onClick={closeMobileMenu}>
                    <LogIn size={15} />
                    Login
                  </Link>
                  <Link href="/signup" className={styles.authSecondary} onClick={closeMobileMenu}>
                    <UserPlus size={15} />
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </aside>
        <main id="main-content" tabIndex={-1} className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
