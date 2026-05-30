import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { UserCog, Download, ShieldCheck } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { downloadCsv, humanise, toCsv } from "@/lib/utils";

type Row = NonNullable<
  ReturnType<typeof useQuery<typeof api.soccer.coachesAndManagers>>
>[number];

const WWVP_VARIANT: Record<
  string,
  "success" | "warning" | "destructive" | "muted"
> = {
  approved: "success",
  sighted: "success",
  pending: "warning",
  not_provided: "destructive",
};

const WWVP_LABEL: Record<string, string> = {
  approved: "Approved",
  sighted: "Sighted",
  pending: "Pending approval",
  not_provided: "Not provided",
};

export default function CoachesManagersPage() {
  const { org, can } = useGatherHub();
  const rows = useQuery(api.soccer.coachesAndManagers, {});
  const canEdit = can("committee");

  if (!org?.soccerMode) {
    return (
      <EmptyState
        icon={UserCog}
        title="Soccer mode is off"
        description="Enable Soccer club mode in Settings to track coaches and managers."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  const count = rows?.length ?? 0;

  function exportCsv() {
    if (!rows) return;
    const out = rows.map((r) => ({
      role: humanise(r.clubRole),
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email ?? "",
      phone: r.phone ?? "",
      teams: r.teams.map((t) => `${t.name} (${humanise(t.role)})`).join("; "),
      wwvpStatus: WWVP_LABEL[r.wwvpStatus] ?? r.wwvpStatus,
      wwvpSightedAt: r.wwvpSightedAt ?? "",
      wwvpExpiresAt: r.wwvpExpiresAt ?? "",
    }));
    downloadCsv(
      "coaches-managers.csv",
      toCsv(out, [
        "role",
        "firstName",
        "lastName",
        "email",
        "phone",
        "teams",
        "wwvpStatus",
        "wwvpSightedAt",
        "wwvpExpiresAt",
      ]),
    );
  }

  const columns: ColumnDef<Row>[] = [
    {
      accessorFn: (r) => `${r.lastName}, ${r.firstName}`,
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <Link
          to={`/members/${row.original.memberId}`}
          className="font-semi text-ink-strong hover:text-primary"
        >
          {row.original.firstName} {row.original.lastName}
        </Link>
      ),
    },
    {
      accessorKey: "clubRole",
      header: "Role",
      cell: ({ row }) => (
        <Badge variant="muted">{humanise(row.original.clubRole)}</Badge>
      ),
    },
    {
      id: "teams",
      header: "Teams",
      accessorFn: (r) => r.teams.map((t) => t.name).join(" "),
      cell: ({ row }) =>
        row.original.teams.length === 0 ? (
          <span className="text-ink-quiet">Club-wide</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {row.original.teams.map((t) => (
              <Badge
                key={String(t.id)}
                variant="muted"
                className="font-medium"
                title={humanise(t.role)}
              >
                {t.name}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      accessorKey: "wwvpStatus",
      header: "WWVP",
      cell: ({ row }) => (
        <div>
          <Badge
            variant={WWVP_VARIANT[row.original.wwvpStatus] ?? "muted"}
            withDot
          >
            {WWVP_LABEL[row.original.wwvpStatus] ?? row.original.wwvpStatus}
          </Badge>
          {row.original.wwvpSightedAt && (
            <p className="text-caption text-ink-quiet mt-0.5">
              sighted {row.original.wwvpSightedAt}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: "Contact",
      cell: ({ row }) => (
        <div className="text-caption">
          {row.original.email && (
            <p className="text-ink-soft truncate max-w-[24ch]">
              {row.original.email}
            </p>
          )}
          {row.original.phone && (
            <p className="text-ink-quiet">{row.original.phone}</p>
          )}
        </div>
      ),
    },
    ...(canEdit
      ? ([
          {
            id: "actions",
            header: "",
            enableSorting: false,
            cell: ({ row }: { row: { original: Row } }) => (
              <EditWwvpDialog
                memberId={row.original.memberId}
                current={{
                  status: row.original.wwvpStatus,
                  sightedAt: row.original.wwvpSightedAt,
                  expiresAt: row.original.wwvpExpiresAt,
                  notes: row.original.wwvpNotes,
                }}
              />
            ),
          },
        ] as ColumnDef<Row>[])
      : []),
  ];

  return (
    <div>
      <PageHeader
        title={`Coaches & Managers (${count})`}
        description="Volunteers in coaching or manager roles, with Working With Vulnerable People background-check status."
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
          getRowId={(r) => String(r.memberId)}
          searchPlaceholder="Search name, email, team"
          emptyState={
            <EmptyState
              icon={ShieldCheck}
              title="No coaches or managers yet"
              description="Set a member's role to Coach or Manager on their profile."
            />
          }
        />
      )}
    </div>
  );
}

function EditWwvpDialog({
  memberId,
  current,
}: {
  memberId: Id<"members">;
  current: {
    status: string;
    sightedAt?: string;
    expiresAt?: string;
    notes?: string;
  };
}) {
  const upsert = useMutation(api.soccer.upsertWwvp);
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState(current.status);
  const [sightedAt, setSightedAt] = React.useState(current.sightedAt ?? "");
  const [expiresAt, setExpiresAt] = React.useState(current.expiresAt ?? "");
  const [notes, setNotes] = React.useState(current.notes ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setStatus(current.status);
      setSightedAt(current.sightedAt ?? "");
      setExpiresAt(current.expiresAt ?? "");
      setNotes(current.notes ?? "");
      setError(null);
    }
  }, [open, current]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const next =
        status === "sighted" && !sightedAt
          ? new Date().toISOString().slice(0, 10)
          : sightedAt;
      await upsert({
        memberId,
        status,
        sightedAt: next || undefined,
        expiresAt: expiresAt || undefined,
        notes: notes.trim() || undefined,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Update WWVP
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update WWVP status</DialogTitle>
          <DialogDescription>
            Working With Vulnerable People check.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not_provided">Not provided</SelectItem>
                <SelectItem value="pending">Pending approval</SelectItem>
                <SelectItem value="sighted">Sighted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ww-sight">Sighted date</Label>
              <Input
                id="ww-sight"
                type="date"
                value={sightedAt}
                onChange={(e) => setSightedAt(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ww-exp">Expires</Label>
              <Input
                id="ww-exp"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ww-notes">Notes</Label>
            <Input
              id="ww-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
