import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { Award, Download } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { downloadCsv, toCsv } from "@/lib/utils";

type Row = NonNullable<
  ReturnType<typeof useQuery<typeof api.members.list>>
>[number];

export default function LifetimeMembersPage() {
  const rows = useQuery(api.members.list, { lifetimeOnly: true });
  const count = rows?.length ?? 0;

  function exportCsv() {
    if (!rows) return;
    const out = rows.map((m) => ({
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email ?? "",
      since: m.lifetimeMemberSince ?? "",
      notes: m.lifetimeMemberNotes ?? "",
    }));
    downloadCsv(
      "lifetime-members.csv",
      toCsv(out, ["firstName", "lastName", "email", "since", "notes"]),
    );
  }

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: "firstName",
      header: "First name",
      cell: ({ row }) => (
        <Link
          to={`/members/${row.original._id}`}
          className="font-semi text-ink-strong hover:text-primary"
        >
          {row.original.firstName}
        </Link>
      ),
    },
    {
      accessorKey: "lastName",
      header: "Last name",
      cell: ({ row }) => (
        <span className="text-ink-strong font-semi">
          {row.original.lastName}
        </span>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-ink-soft">{row.original.email ?? "—"}</span>
      ),
    },
    {
      accessorKey: "lifetimeMemberSince",
      header: "Member since",
      cell: ({ row }) => (
        <span className="text-ink-soft" data-numeric>
          {row.original.lifetimeMemberSince ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "lifetimeMemberNotes",
      header: "Notes",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.lifetimeMemberNotes ? (
          <span className="text-caption text-ink-soft">
            {row.original.lifetimeMemberNotes}
          </span>
        ) : (
          <span className="text-ink-quiet">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={`Lifetime Members (${count})`}
        description="People recognised with lifetime club membership."
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
          searchPlaceholder="Search name, email, year"
          emptyState={
            <EmptyState
              icon={Award}
              title="No lifetime members yet"
              description="Flag a member as a lifetime member from their profile."
            />
          }
        />
      )}
    </div>
  );
}
