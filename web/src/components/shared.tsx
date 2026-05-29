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
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("h-5 w-5 animate-spin text-muted-foreground", className)}
    />
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 justify-center text-muted-foreground">
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
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      {Icon && <Icon className="h-10 w-10 text-muted-foreground mb-3" />}
      <h3 className="font-medium">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
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
