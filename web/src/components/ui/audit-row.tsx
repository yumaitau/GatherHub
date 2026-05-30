import * as React from "react";
import { cn } from "@/lib/utils";

interface AuditRowProps extends React.HTMLAttributes<HTMLDivElement> {
  timestamp: string;
  actor: React.ReactNode;
  action: React.ReactNode;
  expandable?: boolean;
  defaultExpanded?: boolean;
  children?: React.ReactNode;
}

// Audit-first pattern (DESIGN.md §5, signature). Three columns desktop,
// stacked mobile: mono timestamp | actor | active-verb action. Click to
// expand and show before/after detail.
export const AuditRow = React.forwardRef<HTMLDivElement, AuditRowProps>(
  (
    {
      className,
      timestamp,
      actor,
      action,
      expandable,
      defaultExpanded,
      children,
      ...props
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(defaultExpanded ?? false);
    const canExpand = expandable && Boolean(children);
    const handleToggle = canExpand ? () => setOpen((v) => !v) : undefined;

    return (
      <div
        ref={ref}
        data-state={open ? "expanded" : "collapsed"}
        className={cn(
          "group/audit border-b border-hairline last:border-0",
          "transition-colors duration-fast ease-out hover:bg-surface-sunk/60",
          canExpand && "cursor-pointer",
          className,
        )}
        onClick={handleToggle}
        role={canExpand ? "button" : undefined}
        tabIndex={canExpand ? 0 : undefined}
        onKeyDown={
          canExpand
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen((v) => !v);
                }
              }
            : undefined
        }
        {...props}
      >
        <div className="flex flex-col gap-1 px-4 py-2.5 md:grid md:grid-cols-[96px_minmax(0,180px)_1fr] md:items-center md:gap-4">
          <time className="text-mono text-ink-quiet shrink-0">{timestamp}</time>
          <div className="flex items-center gap-2 min-w-0 text-body text-ink">
            {actor}
          </div>
          <div className="text-body text-ink-soft min-w-0">{action}</div>
        </div>
        {canExpand && open && (
          <div className="border-t border-hairline bg-surface-sunk/40 px-4 py-3 text-caption text-ink-soft md:px-[120px]">
            {children}
          </div>
        )}
      </div>
    );
  },
);
AuditRow.displayName = "AuditRow";
