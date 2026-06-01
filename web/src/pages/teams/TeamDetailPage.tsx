import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, UserMinus } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, LoadingState, RoleBadge } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";

type TeamRole = "player" | "coach" | "manager";

export default function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { hasCapability } = useGatherHub();
  const canEditTeams = hasCapability("teams.write");
  const canDeleteTeams = hasCapability("teams.delete");
  const navigate = useNavigate();
  const data = useQuery(
    api.teams.get,
    teamId ? { teamId: teamId as Id<"teams"> } : "skip",
  );
  const update = useMutation(api.teams.update);
  const remove = useMutation(api.teams.remove);
  const unassign = useMutation(api.teams.unassignMember);
  const [error, setError] = React.useState<string | null>(null);

  if (data === undefined) return <LoadingState />;

  const { team, players, staff } = data;

  async function toggleActive() {
    setError(null);
    try {
      await update({ teamId: team._id, isActive: !team.isActive });
      toastSuccess(team.isActive ? "Team deactivated." : "Team reactivated.");
    } catch (err) {
      setError(toastFailure(err, "Could not update team."));
    }
  }

  async function deleteTeam() {
    if (!window.confirm(`Delete ${team.name}? This cannot be undone.`)) return;
    setError(null);
    try {
      await remove({ teamId: team._id });
      toastSuccess("Team deleted.");
      navigate("/teams");
    } catch (err) {
      setError(toastFailure(err, "Could not delete team."));
    }
  }

  async function doUnassign(linkId: Id<"teamMembers">) {
    setError(null);
    try {
      await unassign({ linkId });
      toastSuccess("Member removed from team.");
    } catch (err) {
      setError(toastFailure(err, "Could not remove member from team."));
    }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2" asChild>
        <Link to="/teams">
          <ArrowLeft className="h-4 w-4" />
          Teams
        </Link>
      </Button>
      <PageHeader
        title={team.name}
        description={
          [team.ageGroup, team.season].filter(Boolean).join(" · ") || undefined
        }
        actions={
          <>
            {canEditTeams && (
              <>
                <EditTeamDialog team={team} />
                <Button variant="outline" onClick={toggleActive}>
                  {team.isActive ? "Deactivate" : "Reactivate"}
                </Button>
              </>
            )}
            {canEditTeams && <AssignMemberDialog teamId={team._id} />}
            {canDeleteTeams && (
              <Button variant="destructive" onClick={deleteTeam}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </>
        }
      />

      {!team.isActive && (
        <div className="mb-4">
          <Badge variant="muted">Inactive</Badge>
        </div>
      )}
      {team.description && (
        <p className="mb-6 text-sm text-muted-foreground">{team.description}</p>
      )}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <RosterTable
          title="Players"
          rows={players}
          canManage={canEditTeams}
          onUnassign={doUnassign}
        />
        <RosterTable
          title="Staff"
          rows={staff}
          canManage={canEditTeams}
          onUnassign={doUnassign}
        />
      </div>
    </div>
  );
}

function RosterTable({
  title,
  rows,
  canManage,
  onUnassign,
}: {
  title: string;
  rows: {
    link: { _id: Id<"teamMembers">; role: string };
    member: { _id: Id<"members">; firstName: string; lastName: string } | null;
  }[];
  canManage: boolean;
  onUnassign: (linkId: Id<"teamMembers">) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one assigned yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                {canManage && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.link._id}>
                  <TableCell className="font-medium">
                    {r.member ? (
                      <Link
                        to={`/members/${r.member._id}`}
                        className="hover:underline"
                      >
                        {r.member.firstName} {r.member.lastName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Unknown</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={r.link.role} />
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Remove from team"
                        onClick={() => onUnassign(r.link._id)}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EditTeamDialog({
  team,
}: {
  team: {
    _id: Id<"teams">;
    name: string;
    ageGroup?: string;
    season?: string;
    description?: string;
  };
}) {
  const update = useMutation(api.teams.update);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(team.name);
  const [ageGroup, setAgeGroup] = React.useState(team.ageGroup ?? "");
  const [season, setSeason] = React.useState(team.season ?? "");
  const [description, setDescription] = React.useState(team.description ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await update({
        teamId: team._id,
        name,
        ageGroup: ageGroup.trim() || undefined,
        season: season.trim() || undefined,
        description: description.trim() || undefined,
      });
      setOpen(false);
      toastSuccess("Team updated.");
    } catch (err) {
      setError(toastFailure(err, "Could not update team."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Edit team</DialogTitle>
            <DialogDescription>Update team details.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-team-name">Name</Label>
              <Input
                id="edit-team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-team-age">Age group</Label>
                <Input
                  id="edit-team-age"
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-team-season">Season</Label>
                <Input
                  id="edit-team-season"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-team-desc">Description</Label>
              <Input
                id="edit-team-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignMemberDialog({ teamId }: { teamId: Id<"teams"> }) {
  const [open, setOpen] = React.useState(false);
  const assign = useMutation(api.teams.assignMember);
  const members = useQuery(api.members.list, open ? {} : "skip");
  const [memberId, setMemberId] = React.useState<string>("");
  const [role, setRole] = React.useState<TeamRole>("player");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setMemberId("");
    setRole("player");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId) {
      setError("Select a member.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await assign({ teamId, memberId: memberId as Id<"members">, role });
      reset();
      setOpen(false);
      toastSuccess("Member assigned to team.");
    } catch (err) {
      setError(toastFailure(err, "Could not assign member."));
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
          Assign member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Assign member</DialogTitle>
            <DialogDescription>
              Add a member to this team and choose their role.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Member</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a member…" />
                </SelectTrigger>
                <SelectContent>
                  {members === undefined ? (
                    <SelectItem value="loading" disabled>
                      Loading…
                    </SelectItem>
                  ) : (
                    members.map((m) => (
                      <SelectItem key={m._id} value={m._id}>
                        {m.firstName} {m.lastName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as TeamRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="player">Player</SelectItem>
                  <SelectItem value="coach">Coach</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
