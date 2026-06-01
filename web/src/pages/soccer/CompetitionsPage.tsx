import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { EyeOff, Plus, RotateCcw, Trophy, Pencil } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import {
  legacySoccerSurfacesEnabled,
  sportSectionLabel,
  term,
  titleCase,
} from "@/lib/verticals";

type Row = NonNullable<
  ReturnType<typeof useQuery<typeof api.soccer.listCompetitions>>
>[number];

export default function CompetitionsPage() {
  const { org, hasCapability } = useGatherHub();
  const rows = useQuery(api.soccer.listCompetitions, {});
  const upsert = useMutation(api.soccer.upsertCompetition);
  const canEdit = hasCapability("soccer.manage");
  const count = rows?.length ?? 0;
  const competitionPlural = titleCase(term(org, "competitionPlural"));
  const sportName = sportSectionLabel(org);

  async function toggleCompetition(row: Row) {
    try {
      await upsert({
        id: row._id,
        name: row.name,
        season: row.season ?? undefined,
        active: !row.active,
      });
      toastSuccess(
        row.active ? "Competition hidden." : "Competition restored.",
      );
    } catch (err) {
      toastFailure(err, "Could not update competition.");
    }
  }

  if (!legacySoccerSurfacesEnabled(org)) {
    return (
      <EmptyState
        icon={Trophy}
        title={`${sportName} pack is off`}
        description="Enable the sport pack in Settings to manage competitions."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-semi text-ink-strong">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "season",
      header: "Season",
      cell: ({ row }) => (
        <span className="text-ink-soft">{row.original.season ?? "—"}</span>
      ),
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) =>
        row.original.active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="muted">Hidden</Badge>
        ),
    },
    ...(canEdit
      ? ([
          {
            id: "actions",
            header: "Actions",
            enableSorting: false,
            cell: ({ row }: { row: { original: Row } }) => (
              <div className="flex justify-end gap-1">
                <CompetitionDialog existing={row.original} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleCompetition(row.original)}
                >
                  {row.original.active ? (
                    <>
                      <EyeOff className="h-4 w-4" /> Hide
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" /> Restore
                    </>
                  )}
                </Button>
              </div>
            ),
            meta: { className: "text-right" },
          },
        ] as ColumnDef<Row>[])
      : []),
  ];

  return (
    <div>
      <PageHeader
        title={`${competitionPlural} (${count})`}
        description="Leagues, cups, or season groupings used when registering players."
        actions={canEdit && <CompetitionDialog />}
      />
      {rows === undefined ? (
        <LoadingState />
      ) : (
        <DataTable<Row>
          data={rows}
          columns={columns}
          getRowId={(r) => String(r._id)}
          searchPlaceholder="Search competition or season"
          emptyState={
            <EmptyState
              icon={Trophy}
              title="No competitions yet"
              description="Add a competition so registrations can link to it."
              action={canEdit && <CompetitionDialog />}
            />
          }
        />
      )}
    </div>
  );
}

function CompetitionDialog({ existing }: { existing?: Row }) {
  const upsert = useMutation(api.soccer.upsertCompetition);
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(existing?.name ?? "");
  const [season, setSeason] = React.useState(existing?.season ?? "");
  const [active, setActive] = React.useState(existing?.active ?? true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && existing) {
      setName(existing.name);
      setSeason(existing.season ?? "");
      setActive(existing.active);
    }
  }, [open, existing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await upsert({
        id: existing?._id as Id<"soccerCompetitions"> | undefined,
        name: name.trim(),
        season: season.trim() || undefined,
        active,
      });
      setOpen(false);
      if (!existing) {
        setName("");
        setSeason("");
      }
      toastSuccess(existing ? "Competition updated." : "Competition added.");
    } catch (err) {
      setError(toastFailure(err, "Could not save competition."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {existing ? (
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        ) : (
          <Button>
            <Plus className="h-4 w-4" /> New competition
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit competition" : "New competition"}
          </DialogTitle>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cp-name">Name</Label>
            <Input
              id="cp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp-season">Season</Label>
            <Input
              id="cp-season"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="e.g. 2026"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-body text-ink-soft">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Active
          </label>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : existing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
