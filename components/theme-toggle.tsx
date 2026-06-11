"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { ActionIcon } from "@mantine/core";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <ActionIcon variant="light" radius="xl" aria-label="Toggle theme" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <ActionIcon
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      type="button"
      variant="light"
      radius="xl"
      size="lg"
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </ActionIcon>
  );
}
