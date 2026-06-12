import * as React from "react";
import { Paper, Text, Title } from "@mantine/core";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Paper
      component="section"
      radius="md"
      p="md"
      shadow="sm"
      withBorder
      className={cn(
        "rolelens-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <Title order={3} className={cn("text-base font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <Text size="sm" c="dimmed" className={className} {...props} />;
}
