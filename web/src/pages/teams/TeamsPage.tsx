import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { Shield, Plus, Users, UserCog } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
        actions={
          <>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="h-4 w-4"
              />
              Show inactive
            </label>
            {can("committee") && <NewTeamDialog />}
          </>
        }
      />

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Link key={t._id} to={`/teams/${t._id}`}>
              <Card className="h-full transition-colors hover:bg-accent/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {t.name}
                    {!t.isActive && (
                      <span className="text-xs font-normal text-muted-foreground">
                        (inactive)
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {[t.ageGroup, t.season].filter(Boolean).join(" · ") ||
                      "No age group or season set"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-6 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    {t.playerCount} players
                  </span>
                  <span className="flex items-center gap-1.5">
                    <UserCog className="h-4 w-4" />
                    {t.staffCount} staff
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewTeamDialog() {
  const create = useMutation(api.teams.create);
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
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New team</DialogTitle>
            <DialogDescription>Create a new team or squad.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="team-name">Name</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="team-age">Age group</Label>
                <Input
                  id="team-age"
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
                  placeholder="e.g. U12"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="team-season">Season</Label>
                <Input
                  id="team-season"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  placeholder="e.g. 2026"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="team-desc">Description</Label>
              <Input
                id="team-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
