import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { ScrollText, ShieldOff, History } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { formatDateTime, humanise, relativeTime } from "@/lib/utils";

type Row = NonNullable<
  ReturnType<typeof useQuery<typeof api.assets.allHistory>>
>[number];

const ACTION_VARIANT: Record<
  string,
  "accent" | "success" | "warning" | "destructive" | "muted" | "info"
> = {
  created: "accent",
  updated: "info",
  checked_out: "warning",
  checked_in: "success",
  transferred: "info",
  reported_lost: "destructive",
  maintenance: "warning",
  retired: "muted",
  tag_registered: "accent",
  tag_reassigned: "accent",
};

export default function AuditLogsPage() {
  const { can } = useGatherHub();
  const rows = useQuery(api.assets.allHistory, {});

  if (!can("admin")) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="Admin only"
        description="Audit logs are restricted to owners and admins."
      />
    );
  }

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: "performedAt",
      header: "When",
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <p className="text-mono text-ink">
            {relativeTime(row.original.performedAt)}
          </p>
          <p className="text-caption text-ink-quiet">
            {formatDateTime(row.original.performedAt)}
          </p>
        </div>
      ),
    },
    {
      id: "scope",
      header: "Scope",
      enableSorting: false,
      cell: () => <Badge variant="muted">KitTrace</Badge>,
    },
    {
      accessorKey: "assetName",
      header: "Subject",
      cell: ({ row }) => (
        <Link
          to={`/assets/${row.original.assetId}`}
          className="font-semi text-ink-strong hover:text-primary"
        >
          {row.original.assetName}
        </Link>
      ),
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => (
        <Badge variant={ACTION_VARIANT[row.original.action] ?? "muted"}>
          {humanise(row.original.action)}
        </Badge>
      ),
    },
    {
      accessorKey: "performerName",
      header: "Actor",
      cell: ({ row }) => (
        <span className="text-ink-soft">{row.original.performerName}</span>
      ),
    },
    {
      accessorKey: "notes",
      header: "Notes",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.notes ? (
          <span className="text-caption text-ink-soft">
            {row.original.notes}
          </span>
        ) : (
          <span className="text-ink-quiet">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Audit logs"
        description="Every mutating action across the workspace. Currently covers KitTrace asset operations; member, registration, and event audits land here as they're wired."
        actions={
          <Button variant="outline" asChild>
            <Link to="/assets/history">
              <History className="h-4 w-4" /> Full KitTrace history
            </Link>
          </Button>
        }
      />
      {rows === undefined ? (
        <LoadingState />
      ) : (
        <DataTable<Row>
          data={rows}
          columns={columns}
          getRowId={(r) => String(r._id)}
          searchPlaceholder="Search asset, action, actor, notes"
          defaultPageSize={50}
          emptyState={
            <EmptyState
              icon={ScrollText}
              title="No audit entries yet"
              description="Once you start using KitTrace or other tracked features, audit entries land here."
            />
          }
        />
      )}
    </div>
  );
}
