import * as React from "react";
import { Button as MantineButton, type ButtonProps as MantineButtonProps } from "@mantine/core";

type ButtonVariant = "default" | "secondary" | "ghost";
type ButtonSize = "default" | "sm" | "lg";

export type ButtonProps = Omit<
  MantineButtonProps,
  "variant" | "size" | "type"
> &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  };

const variantMap: Record<ButtonVariant, MantineButtonProps["variant"]> = {
  default: "filled",
  secondary: "light",
  ghost: "subtle",
};

const sizeMap: Record<ButtonSize, MantineButtonProps["size"]> = {
  default: "sm",
  sm: "xs",
  lg: "md",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <MantineButton
      ref={ref}
      radius="md"
      variant={variantMap[variant]}
      size={sizeMap[size]}
      fullWidth={className?.includes("w-full")}
      className={className}
      {...props}
    />
  ),
);

Button.displayName = "Button";

export { Button };
