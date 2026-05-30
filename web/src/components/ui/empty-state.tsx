import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

// Empty states are teaching surfaces, not "nothing here" placeholders
// (DESIGN.md §5, §6). No illustration. One title, one explanatory line,
// one secondary action.
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, title, description, action, icon, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "mx-auto flex max-w-[360px] flex-col items-center gap-2",
        "py-10 text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="mb-1 text-ink-quiet [&_svg]:size-6">{icon}</div>
      )}
      <p className="text-body-strong text-ink-strong">{title}</p>
      {description && (
        <p className="max-w-prose text-body text-ink-soft">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  ),
);
EmptyState.displayName = "EmptyState";
