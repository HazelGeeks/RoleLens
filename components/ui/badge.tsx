import type { ReactNode } from "react";
import { Badge as MantineBadge, type BadgeProps as MantineBadgeProps } from "@mantine/core";

export function Badge({
  className,
  children,
  color = "gray",
}: {
  className?: string;
  children: ReactNode;
  color?: MantineBadgeProps["color"];
}) {
  return (
    <MantineBadge variant="light" radius="xl" color={color} className={className}>
      {children}
    </MantineBadge>
  );
}
