"use client";

import { MantineProvider, createTheme } from "@mantine/core";
import { useTheme } from "next-themes";
import * as React from "react";

const theme = createTheme({
  primaryColor: "indigo",
  defaultRadius: "md",
  fontFamily: "var(--font-app-sans), sans-serif",
  fontFamilyMonospace: "var(--font-app-mono), monospace",
  headings: {
    fontFamily: "var(--font-app-sans), sans-serif",
    fontWeight: "800",
  },
  colors: {
    indigo: [
      "#eef2ff",
      "#e0e7ff",
      "#c7d2fe",
      "#a5b4fc",
      "#818cf8",
      "#6366f1",
      "#4f46e5",
      "#4338ca",
      "#3730a3",
      "#312e81",
    ],
  },
});

export function MantineThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <MantineProvider
      theme={theme}
      forceColorScheme={mounted && resolvedTheme === "dark" ? "dark" : "light"}
    >
      {children}
    </MantineProvider>
  );
}
