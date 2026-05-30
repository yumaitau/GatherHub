import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { Users, Download } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { downloadCsv, toCsv } from "@/lib/utils";

export default function SoccerPlayersPage() {
  const { org } = useGatherHub();
  const rows = useQuery(api.soccer.playerListing, {});

  if (!org?.soccerMode) {
    return (
      <EmptyState
        icon={Users}
        title="Soccer mode is off"
        description="Enable Soccer club mode in Settings to use the player roster."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  function exportCsv() {
    if (!rows) return;
    const out = rows.map((r) => ({
      name: r.name,
      email: r.email ?? "",
      dob: r.dateOfBirth ?? "",
      registered: r.registered ? "yes" : "no",
      paid: r.paid ? "yes" : "no",
      team: r.teamName ?? "",
      division: r.divisionName ?? "",
      grade: r.grade != null ? r.grade.toFixed(1) : "",
      scored: `${r.scoredCount}/${r.totalSkills}`,
    }));
    downloadCsv(
      "players.csv",
      toCsv(out, [
        "name",
        "email",
        "dob",
        "registered",
        "paid",
        "team",
        "division",
        "grade",
        "scored",
      ]),
    );
  }

  return (
    <div>
      <PageHeader
        title={`Player Roster (${rows?.length ?? 0})`}
        description="Every member with a soccer registration or evaluation, including team, division, and grade progress."
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
        <DataTable
          data={rows}
          columns={
            [
              {
                accessorKey: "name",
                header: "Player",
                cell: ({ row }) => (
                  <>
                    <Link
                      to={`/members/${row.original.memberId}`}
                      className="font-semi text-ink-strong hover:text-primary"
                    >
                      {row.original.name}
                    </Link>
                    {row.original.email && (
                      <p className="text-caption text-ink-quiet truncate max-w-[24ch]">
                        {row.original.email}
                      </p>
                    )}
                  </>
                ),
              },
              {
                id: "status",
                accessorFn: (r) =>
                  !r.hasRegistration
                    ? "norego"
                    : r.registered && r.paid
                      ? "active"
                      : r.registered
                        ? r.paymentPlan
                          ? "plan"
                          : "unpaid"
                        : "pending",
                header: "Status",
                cell: ({ row }) =>
                  !row.original.hasRegistration ? (
                    <Badge variant="outline">No rego</Badge>
                  ) : row.original.registered && row.original.paid ? (
                    <Badge variant="success">Active</Badge>
                  ) : row.original.registered ? (
                    row.original.paymentPlan ? (
                      <Badge variant="warning">Plan</Badge>
                    ) : (
                      <Badge variant="destructive">Unpaid</Badge>
                    )
                  ) : (
                    <Badge variant="muted">Pending</Badge>
                  ),
              },
              {
                accessorKey: "teamName",
                header: "Team",
                cell: ({ row }) => (
                  <span className="text-ink-soft">
                    {row.original.teamName ?? "—"}
                  </span>
                ),
              },
              {
                accessorKey: "divisionName",
                header: "Division",
                cell: ({ row }) =>
                  row.original.divisionName ? (
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block h-3 w-3 rounded-xs"
                        style={{
                          background:
                            row.original.divisionColor ?? "transparent",
                        }}
                      />
                      {row.original.divisionName}
                    </span>
                  ) : (
                    <span className="text-ink-quiet">—</span>
                  ),
              },
              {
                accessorFn: (r) => r.grade ?? -1,
                id: "grade",
                header: "Grade",
                meta: { numeric: true },
                cell: ({ row }) =>
                  row.original.grade != null
                    ? row.original.grade.toFixed(1)
                    : "—",
              },
              {
                accessorFn: (r) => r.scoredCount,
                id: "progress",
                header: "Progress",
                cell: ({ row }) => (
                  <Link
                    to={`/soccer/grading/${row.original.memberId}`}
                    className="text-ink-soft hover:text-primary"
                  >
                    <span data-numeric>{row.original.scoredCount}</span>
                    {" / "}
                    <span data-numeric>{row.original.totalSkills}</span>
                  </Link>
                ),
              },
            ] as ColumnDef<(typeof rows)[number]>[]
          }
          getRowId={(r) => String(r.memberId)}
          searchPlaceholder="Search player, email, team, division"
          emptyState={
            <EmptyState
              icon={Users}
              title="No members yet"
              description="Add members and assign registrations to populate the player roster."
            />
          }
        />
      )}
    </div>
  );
}
