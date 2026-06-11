import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "@mantine/core/styles.css";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { MantineThemeProvider } from "@/components/providers/mantine-theme-provider";
import { AppFrame } from "@/components/layout/app-frame";

const appSans = Plus_Jakarta_Sans({
  variable: "--font-app-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const appMono = JetBrains_Mono({
  variable: "--font-app-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
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
        className={`${appSans.variable} ${appMono.variable}`}
      >
        <ThemeProvider>
          <MantineThemeProvider>
            <AuthProvider>
              <AppFrame>{children}</AppFrame>
            </AuthProvider>
          </MantineThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
