import * as React from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, humanise } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
      <div className="min-w-0">
        <h1 className="text-display text-ink-strong">{title}</h1>
        {description && (
          <p className="max-w-prose text-body text-ink-soft mt-1.5">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("h-4 w-4 animate-spin text-ink-quiet", className)}
      aria-hidden="true"
    />
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2.5 py-16 text-body text-ink-quiet"
    >
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mx-auto flex max-w-[360px] flex-col items-center gap-2 py-12 text-center">
      {Icon && (
        <Icon
          className="h-6 w-6 text-ink-quiet mb-1"
          aria-hidden="true"
        />
      )}
      <p className="text-body-strong text-ink-strong">{title}</p>
      {description && (
        <p className="max-w-prose text-body text-ink-soft">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const ASSET_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "success" | "warning" | "muted"
> = {
  available: "success",
  checked_out: "warning",
  in_use: "warning",
  maintenance: "secondary",
  lost: "destructive",
  retired: "muted",
};

export function AssetStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={ASSET_STATUS_VARIANT[status] ?? "default"}>
      {humanise(status)}
    </Badge>
  );
}

const RSVP_VARIANT: Record<string, "success" | "destructive" | "warning"> = {
  going: "success",
  not_going: "destructive",
  maybe: "warning",
};

export function RsvpBadge({ status }: { status: string }) {
  return (
    <Badge variant={RSVP_VARIANT[status] ?? "muted"}>
      {status === "not_going" ? "Not going" : humanise(status)}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return <Badge variant="secondary">{humanise(role)}</Badge>;
}
