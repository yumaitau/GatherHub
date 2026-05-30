import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { Shield, Plus } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { type ColumnDef } from "@tanstack/react-table";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";

export default function TeamsPage() {
  const { can } = useGatherHub();
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const teams = useQuery(api.teams.list, { includeInactive });

  return (
    <div>
      <PageHeader
        title={`Teams (${teams?.length ?? 0})`}
        description="Squads, age groups and seasons."
        actions={can("committee") ? <NewTeamDialog /> : undefined}
      />

      {teams === undefined ? (
        <LoadingState />
      ) : (
        <DataTable
          data={teams}
          columns={
            [
              {
                accessorKey: "name",
                header: "Name",
                cell: ({ row }) => (
                  <Link
                    to={`/teams/${row.original._id}`}
                    className="font-semi text-ink-strong hover:text-primary"
                  >
                    {row.original.name}
                  </Link>
                ),
              },
              {
                accessorKey: "ageGroup",
                header: "Age group",
                cell: ({ row }) => (
                  <span className="text-ink-soft">
                    {row.original.ageGroup ?? "—"}
                  </span>
                ),
              },
              {
                accessorKey: "season",
                header: "Season",
                cell: ({ row }) => (
                  <span className="text-ink-soft">
                    {row.original.season ?? "—"}
                  </span>
                ),
              },
              {
                accessorKey: "playerCount",
                header: "Players",
                meta: { numeric: true },
              },
              {
                accessorKey: "staffCount",
                header: "Staff",
                meta: { numeric: true },
              },
              {
                accessorKey: "isActive",
                header: "Status",
                cell: ({ row }) =>
                  row.original.isActive ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="muted">Inactive</Badge>
                  ),
              },
            ] as ColumnDef<(typeof teams)[number]>[]
          }
          getRowId={(r) => r._id}
          searchPlaceholder="Search name, age group, season"
          emptyState={
            <EmptyState
              icon={Shield}
              title="No teams yet"
              description="Create your first team to start organising members."
              action={can("committee") ? <NewTeamDialog /> : undefined}
            />
          }
          toolbar={
            <label className="flex items-center gap-2 text-body text-ink-soft">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Show inactive
            </label>
          }
        />
      )}
    </div>
  );
}

function NewTeamDialog() {
  const create = useMutation(api.teams.create);
  const ageGroups = useQuery(api.taxonomies.list, { kind: "team_age_group" });
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [ageGroup, setAgeGroup] = React.useState("");
  const [season, setSeason] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setName("");
    setAgeGroup("");
    setSeason("");
    setDescription("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await create({
        name,
        ageGroup: ageGroup || undefined,
        season: season.trim() || undefined,
        description: description.trim() || undefined,
      });
      reset();
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New team</DialogTitle>
          <DialogDescription>Create a new team or squad.</DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="team-age">Age group</Label>
              <Select
                value={ageGroup || "__none__"}
                onValueChange={(v) => setAgeGroup(v === "__none__" ? "" : v)}
              >
                <SelectTrigger id="team-age">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {(ageGroups ?? []).map((a) => (
                    <SelectItem key={a.key} value={a.key}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="team-season">Season</Label>
              <Input
                id="team-season"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="e.g. 2026"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="team-desc">Description</Label>
            <Input
              id="team-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? "Saving…" : "Create team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
