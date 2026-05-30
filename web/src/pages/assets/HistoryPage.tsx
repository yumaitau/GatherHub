import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { History, Download } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import {
  downloadCsv,
  formatDateTime,
  humanise,
  relativeTime,
  toCsv,
} from "@/lib/utils";

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

export default function AssetHistoryPage() {
  const rows = useQuery(api.assets.allHistory, {});

  function exportCsv() {
    if (!rows) return;
    const out = rows.map((r) => ({
      timestamp: new Date(r.performedAt).toISOString(),
      asset: r.assetName,
      action: r.action,
      actor: r.performerName,
      fromStatus: r.fromStatus ?? "",
      toStatus: r.toStatus ?? "",
      fromCustodian: r.fromCustodianName ?? "",
      toCustodian: r.toCustodianName ?? "",
      toLocation: r.toLocation ?? "",
      notes: r.notes ?? "",
    }));
    downloadCsv(
      "asset-history.csv",
      toCsv(out, [
        "timestamp",
        "asset",
        "action",
        "actor",
        "fromStatus",
        "toStatus",
        "fromCustodian",
        "toCustodian",
        "toLocation",
        "notes",
      ]),
    );
  }

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: "performedAt",
      header: "When",
      meta: { className: "whitespace-nowrap" },
      cell: ({ row }) => (
        <div>
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
      accessorKey: "assetName",
      header: "Asset",
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
      header: "By",
      cell: ({ row }) => (
        <span className="text-ink-soft">{row.original.performerName}</span>
      ),
    },
    {
      id: "transition",
      header: "Details",
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const bits: string[] = [];
        if (r.fromStatus && r.toStatus) {
          bits.push(`${humanise(r.fromStatus)} → ${humanise(r.toStatus)}`);
        }
        if (r.fromCustodianName || r.toCustodianName) {
          bits.push(
            `${r.fromCustodianName ?? "—"} → ${r.toCustodianName ?? "—"}`,
          );
        }
        if (r.toLocation) bits.push(`@ ${r.toLocation}`);
        return (
          <span className="text-body text-ink-soft">
            {bits.join(" · ") || "—"}
          </span>
        );
      },
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
        title="Asset history"
        description="Every KitTrace action across every item, newest first. Use this to track an item's lifecycle, audit who did what, or export for reports."
        actions={
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={!rows || rows.length === 0}
          >
            <Download className="h-4 w-4" /> Export CSV
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
              icon={History}
              title="No activity yet"
              description="Once items are issued, returned, or moved, the trail will show here."
            />
          }
        />
      )}
    </div>
  );
}
