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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";

export default function TeamsPage() {
  const { can } = useGatherHub();
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const teams = useQuery(api.teams.list, { includeInactive });

  return (
    <div>
      <PageHeader
        title="Teams"
        description="Squads, age groups and seasons."
        actions={can("committee") ? <NewTeamDialog /> : undefined}
      />

      <section className="rounded-md border border-hairline bg-surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-hairline">
          <label className="flex items-center gap-2 text-body text-ink-soft">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Show inactive
          </label>
          {teams && (
            <span className="ml-auto text-caption text-ink-quiet">
              <span data-numeric className="font-medium text-ink-soft">
                {teams.length}
              </span>{" "}
              {teams.length === 1 ? "team" : "teams"}
            </span>
          )}
        </div>

        {teams === undefined ? (
          <LoadingState />
        ) : teams.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="No teams yet"
            description="Create your first team to start organising members."
            action={can("committee") ? <NewTeamDialog /> : undefined}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Age group</TableHead>
                <TableHead>Season</TableHead>
                <TableHead numeric>Players</TableHead>
                <TableHead numeric>Staff</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((t) => (
                <TableRow key={t._id}>
                  <TableCell>
                    <Link
                      to={`/teams/${t._id}`}
                      className="font-semi text-ink-strong hover:text-primary"
                    >
                      {t.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-ink-soft">
                    {t.ageGroup ?? "—"}
                  </TableCell>
                  <TableCell className="text-ink-soft">
                    {t.season ?? "—"}
                  </TableCell>
                  <TableCell numeric>{t.playerCount}</TableCell>
                  <TableCell numeric>{t.staffCount}</TableCell>
                  <TableCell>
                    {t.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="muted">Inactive</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function NewTeamDialog() {
  const create = useMutation(api.teams.create);
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
        ageGroup: ageGroup.trim() || undefined,
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
              <Input
                id="team-age"
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                placeholder="e.g. U12"
              />
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
