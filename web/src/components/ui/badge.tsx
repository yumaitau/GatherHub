import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Status chip primitive. Always pair colour with text/icon (DESIGN.md §2 rule).
// A leading status dot is rendered for status variants when `withDot` is true
// or by default on success/warning/danger/info.
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5",
    "rounded-full px-2 h-[22px]",
    "text-caption font-regular",
    "transition-colors duration-fast ease-out",
    "border border-transparent",
  ].join(" "),
  {
    variants: {
      variant: {
        // Neutral (default tag/filter chip)
        default: "bg-surface-sunk text-ink-soft",
        muted: "bg-surface-sunk text-ink-quiet",
        secondary: "bg-surface-sunk text-ink",
        outline: "bg-paper text-ink border-border",
        // Brand
        accent: "bg-primary-wash text-primary",
        // Status family
        success: "bg-success-wash text-success",
        warning: "bg-warning-wash text-warning",
        destructive: "bg-danger-wash text-danger",
        info: "bg-info-wash text-info",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const STATUS_VARIANTS = new Set([
  "success",
  "warning",
  "destructive",
  "info",
  "accent",
]);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  withDot?: boolean;
}

function Badge({
  className,
  variant,
  withDot,
  children,
  ...props
}: BadgeProps) {
  const showDot = withDot ?? (variant ? STATUS_VARIANTS.has(variant) : false);
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {showDot && (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-current shrink-0"
        />
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
