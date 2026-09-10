"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  FileText,
  Mail,
  LogIn,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./app-frame.module.css";

const navigationItems = [
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/cover-letter", label: "Cover Letter", icon: Mail },
  { href: "/jobs", label: "Jobs", icon: ClipboardList },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/admin", label: "Admin", icon: ShieldCheck },
];

const SIDEBAR_PREFERENCE_KEY = "rolelens.sidebar.collapsed";

export function AppFrame({ children }: { children: React.ReactNode }) {
  const { status, user, signOut } = useAuth();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      setIsSidebarCollapsed(
        window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === "true",
      );
    } catch {
      // Browser preferences are optional when storage is unavailable.
    }
  }, []);

  const toggleSidebar = () => {
    const next = !isSidebarCollapsed;
    setIsSidebarCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(next));
    } catch {
      // Keep the toggle working for this session even if storage is blocked.
    }
  };

  if (pathname === "/") {
    return <>{children}</>;
  }

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div className={styles.shell}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>
      <div
        className={`${styles.grid} ${isSidebarCollapsed ? styles.gridCollapsed : ""}`}
      >
        <aside className={styles.sidebar}>
          <div className={styles.brandRow}>
            <Link
              href="/"
              className={styles.brandLink}
              aria-label="Go to RoleLens home"
              onClick={closeMobileMenu}
            >
              <span className={styles.fullBrand}>
                <span className={styles.eyebrow}>Career Ops</span>
                <span className={styles.brandTitle}>RoleLens</span>
              </span>
              <span className={styles.compactBrand} aria-hidden="true">
                RL
              </span>
            </Link>
            <div className={styles.brandActions}>
              <button
                type="button"
                className={styles.sidebarToggle}
                aria-label={
                  isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
                }
                title={
                  isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
                }
                aria-expanded={!isSidebarCollapsed}
                aria-controls="mobile-navigation-menu"
                onClick={toggleSidebar}
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen size={18} aria-hidden="true" />
                ) : (
                  <PanelLeftClose size={18} aria-hidden="true" />
                )}
              </button>
              <ThemeToggle />
              <button
                type="button"
                className={styles.mobileMenuButton}
                aria-label={
                  isMobileMenuOpen
                    ? "Close navigation menu"
                    : "Open navigation menu"
                }
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
                    aria-label={item.label}
                    title={item.label}
                    aria-current={
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`)
                        ? "page"
                        : undefined
                    }
                    onClick={closeMobileMenu}
                  >
                    <Icon size={17} strokeWidth={2.2} aria-hidden="true" />
                    <span className={styles.navLabel}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className={styles.navUtility} aria-label="Account actions">
              {status === "loading" ? (
                <span
                  className={styles.userLabel}
                  role="status"
                  aria-live="polite"
                >
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
                    aria-label="Sign out"
                    title="Sign out"
                    onClick={() => {
                      closeMobileMenu();
                      void signOut();
                    }}
                  >
                    <LogOut size={15} aria-hidden="true" />
                    <span className={styles.navLabel}>Sign out</span>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className={styles.authPrimary}
                    aria-label="Login"
                    title="Login"
                    onClick={closeMobileMenu}
                  >
                    <LogIn size={15} aria-hidden="true" />
                    <span className={styles.navLabel}>Login</span>
                  </Link>
                  <Link
                    href="/signup"
                    className={styles.authSecondary}
                    aria-label="Sign up"
                    title="Sign up"
                    onClick={closeMobileMenu}
                  >
                    <UserPlus size={15} aria-hidden="true" />
                    <span className={styles.navLabel}>Sign up</span>
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
