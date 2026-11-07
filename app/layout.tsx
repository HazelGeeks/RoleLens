import type { Metadata } from "next";
import localFont from "next/font/local";
import "@mantine/core/styles.css";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { MantineThemeProvider } from "@/components/providers/mantine-theme-provider";
import { AppFrame } from "@/components/layout/app-frame";

const appSans = localFont({
  src: "./fonts/PlusJakartaSans.woff2",
  weight: "200 800",
  variable: "--font-app-sans",
  display: "swap",
});

const appMono = localFont({
  src: "./fonts/JetBrainsMono.woff2",
  weight: "100 800",
  variable: "--font-app-mono",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["monospace"],
});

export const metadata: Metadata = {
  title: "RoleLens",
  description:
    "Bring your experience, resume, and job applications into one clear workspace.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${appSans.variable} ${appMono.variable}`}>
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
