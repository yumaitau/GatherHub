import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "accent";

const TONE: Record<StatusTone, string> = {
  neutral: "bg-ink-quiet",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  accent: "bg-primary",
};

interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  pulse?: boolean;
  label?: string;
}

// Standalone status indicator. Used in presence indicators, audit markers,
// sidebar notification badges. When `label` is provided, the dot stays
// visual and the label is announced to screen readers.
export const StatusDot = React.forwardRef<HTMLSpanElement, StatusDotProps>(
  ({ className, tone = "neutral", pulse, label, ...props }, ref) => (
    <span
      ref={ref}
      role={label ? "status" : undefined}
      aria-label={label}
      className={cn("relative inline-flex size-2", className)}
      {...props}
    >
      {pulse && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 rounded-full opacity-60 animate-ping",
            TONE[tone],
          )}
        />
      )}
      <span
        aria-hidden={label ? "true" : undefined}
        className={cn("relative inline-flex size-2 rounded-full", TONE[tone])}
      />
    </span>
  ),
);
StatusDot.displayName = "StatusDot";
