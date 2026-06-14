import * as React from "react";
import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { Truck, AlertTriangle, Wrench, CalendarClock } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { moduleEnabled } from "@/lib/verticals";
import { humanise } from "@/lib/utils";
import { cn } from "@/lib/utils";

type ComplianceFlag =
  | "out_of_service"
  | "defect"
  | "overdue_service"
  | "expiring_docs"
  | "ok";

type BadgeVariant = "destructive" | "warning" | "info" | "success" | "muted";

const FLAG_META: Record<
  ComplianceFlag,
  { label: string; variant: BadgeVariant }
> = {
  out_of_service: { label: "Out of service", variant: "destructive" },
  defect: { label: "Open defect", variant: "warning" },
  overdue_service: { label: "Service overdue", variant: "warning" },
  expiring_docs: { label: "Docs expiring", variant: "info" },
  ok: { label: "Roadworthy", variant: "success" },
};

export default function FleetPage() {
  const { org } = useGatherHub();
  const fleetEnabled = moduleEnabled(org, "fleet");
  const [flag, setFlag] = React.useState<"all" | ComplianceFlag>("all");
  const data = useQuery(api.fleet.dashboard, fleetEnabled ? {} : "skip");

  if (!fleetEnabled) {
    return (
      <EmptyState
        icon={Truck}
        title="Fleet is off"
        description="Enable the Fleet & compliance module in Settings to track vehicles, plant, inspections, and maintenance."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Fleet"
        description="Vehicles, trailers, plant, and equipment with inspections, defects, and maintenance compliance."
      />

      {data === undefined ? (
        <LoadingState />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Tracked" value={data.counts.total} icon={Truck} />
            <StatCard
              label="Out of service"
              value={data.counts.outOfService}
              icon={AlertTriangle}
              tone="destructive"
            />
            <StatCard
              label="Open defects"
              value={data.counts.defect}
              icon={AlertTriangle}
              tone="warning"
            />
            <StatCard
              label="Service overdue"
              value={data.counts.overdueService}
              icon={Wrench}
              tone="warning"
            />
            <StatCard
              label="Docs expiring"
              value={data.counts.expiringDocs}
              icon={CalendarClock}
              tone="info"
            />
            <StatCard
              label="Roadworthy"
              value={data.counts.ok}
              icon={Truck}
              tone="success"
            />
          </div>

          <div className="mb-4 flex items-center gap-2">
            <span className="text-caption text-ink-quiet">Filter</span>
            <Select
              value={flag}
              onValueChange={(v) => setFlag(v as typeof flag)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assets</SelectItem>
                {(Object.keys(FLAG_META) as ComplianceFlag[]).map((f) => (
                  <SelectItem key={f} value={f}>
                    {FLAG_META[f].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {data.assets.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No fleet assets yet"
              description="Open an asset and set its fleet type to start tracking inspections and compliance."
            />
          ) : (
            <div className="grid gap-3">
              {data.assets
                .filter((a) => flag === "all" || a.flag === flag)
                .map((a) => (
                  <Link
                    key={a._id}
                    to={`/fleet/${a._id}`}
                    className="block rounded-md border border-hairline bg-surface px-4 py-3 transition-colors hover:border-border"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-body-strong text-ink-strong">
                            {a.name}
                          </span>
                          <Badge variant="muted">{humanise(a.assetType)}</Badge>
                          {a.registration && (
                            <span className="text-caption text-ink-quiet">
                              {a.registration}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-quiet">
                          {a.odometer !== null && (
                            <span>
                              {a.odometer.toLocaleString()} {a.odometerUnit}
                            </span>
                          )}
                          {a.assignedDriverName && (
                            <span>Driver: {a.assignedDriverName}</span>
                          )}
                          {a.openDefectCount > 0 && (
                            <span>
                              {a.openDefectCount} open defect
                              {a.openDefectCount === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant={FLAG_META[a.flag as ComplianceFlag].variant}
                      >
                        {FLAG_META[a.flag as ComplianceFlag].label}
                      </Badge>
                    </div>
                    {a.alerts.length > 0 && (
                      <p className="mt-1.5 text-caption text-ink-soft">
                        {a.alerts.join(" · ")}
                      </p>
                    )}
                  </Link>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "muted",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "muted" | "destructive" | "warning" | "info" | "success";
}) {
  const toneClass = {
    muted: "text-ink-quiet",
    destructive: value > 0 ? "text-danger" : "text-ink-quiet",
    warning: value > 0 ? "text-warning" : "text-ink-quiet",
    info: value > 0 ? "text-info" : "text-ink-quiet",
    success: "text-success",
  }[tone];
  return (
    <div className="rounded-md border border-hairline bg-surface px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-caption text-ink-quiet">
        <Icon className={cn("h-3.5 w-3.5", toneClass)} />
        {label}
      </div>
      <p className={cn("mt-1 text-h3 font-semibold", toneClass)}>{value}</p>
    </div>
  );
}
