import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { BarChart3, ClipboardList } from "lucide-react";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RoleLens",
  description: "Track, analyze, and manage frontend job postings",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${manrope.variable} ${jetbrainsMono.variable} min-h-screen antialiased`}
      >
        <ThemeProvider>
          <div className="relative min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe_0,_#f8fafc_45%,_#eef2ff_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_top,_#0f172a_0,_#020617_45%,_#020617_100%)] dark:text-slate-100">
            <div className="grid min-h-screen grid-cols-1 gap-3 px-2 py-3 sm:px-3 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-4 lg:px-4 lg:py-4">
              <aside className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                      Career Ops
                    </p>
                    <h1 className="text-xl font-semibold">RoleLens</h1>
                  </div>
                  <ThemeToggle />
                </div>
                <nav className="space-y-2">
                  <Link
                    href="/"
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <ClipboardList className="h-4 w-4" />
                    Jobs
                  </Link>
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Dashboard
                  </Link>
                </nav>
              </aside>
              <main className="min-w-0 rounded-2xl border border-slate-200/70 bg-white/85 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 lg:p-6">
                {children}
              </main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
