import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { Shield, Plus } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { legacySoccerSurfacesEnabled } from "@/lib/verticals";

export default function TeamsPage() {
  const { hasCapability } = useGatherHub();
  const canEditTeams = hasCapability("teams.write");
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const teams = useQuery(api.teams.list, { includeInactive });

  return (
    <div>
      <PageHeader
        title={`Teams (${teams?.length ?? 0})`}
        description="Squads, age groups and seasons."
        actions={canEditTeams ? <NewTeamDialog /> : undefined}
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
              action={canEditTeams ? <NewTeamDialog /> : undefined}
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
  const { org } = useGatherHub();
  const soccerMode = legacySoccerSurfacesEnabled(org);
  const create = useMutation(api.teams.create);
  const ageGroups = useQuery(api.taxonomies.list, { kind: "team_age_group" });
  const competitions = useQuery(
    api.soccer.listCompetitions,
    soccerMode ? {} : "skip",
  );
  const divisions = useQuery(
    api.soccer.listDivisions,
    soccerMode ? {} : "skip",
  );
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [ageGroup, setAgeGroup] = React.useState("");
  const [season, setSeason] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [kitColour, setKitColour] = React.useState("");
  const [kitBagNumber, setKitBagNumber] = React.useState("");
  const [competitionId, setCompetitionId] = React.useState("");
  const [divisionId, setDivisionId] = React.useState("");
  const [coach, setCoach] = React.useState("");
  const [coachEmail, setCoachEmail] = React.useState("");
  const [coachPhone, setCoachPhone] = React.useState("");
  const [additionalCoach, setAdditionalCoach] = React.useState("");
  const [additionalCoachEmail, setAdditionalCoachEmail] = React.useState("");
  const [additionalCoachPhone, setAdditionalCoachPhone] = React.useState("");
  const [manager, setManager] = React.useState("");
  const [managerEmail, setManagerEmail] = React.useState("");
  const [managerPhone, setManagerPhone] = React.useState("");
  const [teamRegistered, setTeamRegistered] = React.useState(false);
  const [teamRegisteredDate, setTeamRegisteredDate] = React.useState("");
  const [teamRegistrationPaid, setTeamRegistrationPaid] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setName("");
    setAgeGroup("");
    setSeason("");
    setDescription("");
    setKitColour("");
    setKitBagNumber("");
    setCompetitionId("");
    setDivisionId("");
    setCoach("");
    setCoachEmail("");
    setCoachPhone("");
    setAdditionalCoach("");
    setAdditionalCoachEmail("");
    setAdditionalCoachPhone("");
    setManager("");
    setManagerEmail("");
    setManagerPhone("");
    setTeamRegistered(false);
    setTeamRegisteredDate("");
    setTeamRegistrationPaid(false);
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
        kitColour: kitColour.trim() || undefined,
        kitBagNumber: kitBagNumber.trim() || undefined,
        competitionId:
          soccerMode && competitionId
            ? (competitionId as Id<"soccerCompetitions">)
            : undefined,
        divisionId:
          soccerMode && divisionId
            ? (divisionId as Id<"soccerDivisions">)
            : undefined,
        coach: coach.trim() || undefined,
        coachEmail: coachEmail.trim() || undefined,
        coachPhone: coachPhone.trim() || undefined,
        additionalCoach: additionalCoach.trim() || undefined,
        additionalCoachEmail: additionalCoachEmail.trim() || undefined,
        additionalCoachPhone: additionalCoachPhone.trim() || undefined,
        manager: manager.trim() || undefined,
        managerEmail: managerEmail.trim() || undefined,
        managerPhone: managerPhone.trim() || undefined,
        teamRegistered: soccerMode ? teamRegistered : undefined,
        teamRegisteredDate: teamRegisteredDate || undefined,
        teamRegistrationPaid: soccerMode ? teamRegistrationPaid : undefined,
      });
      reset();
      setOpen(false);
      toastSuccess("Team created.");
    } catch (err) {
      setError(toastFailure(err, "Could not create team."));
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
          {soccerMode && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="team-comp">Competition</Label>
                  <Select
                    value={competitionId || "__none__"}
                    onValueChange={(v) =>
                      setCompetitionId(v === "__none__" ? "" : v)
                    }
                  >
                    <SelectTrigger id="team-comp">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {(competitions ?? []).map((c) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="team-div">Division</Label>
                  <Select
                    value={divisionId || "__none__"}
                    onValueChange={(v) =>
                      setDivisionId(v === "__none__" ? "" : v)
                    }
                  >
                    <SelectTrigger id="team-div">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {(divisions ?? []).map((d) => (
                        <SelectItem key={d._id} value={d._id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="team-kit-c">Kit colour</Label>
                  <Input
                    id="team-kit-c"
                    value={kitColour}
                    onChange={(e) => setKitColour(e.target.value)}
                    placeholder="e.g. #bf0000"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="team-kit-b">Kit bag number</Label>
                  <Input
                    id="team-kit-b"
                    value={kitBagNumber}
                    onChange={(e) => setKitBagNumber(e.target.value)}
                  />
                </div>
              </div>
              <fieldset className="grid gap-3 rounded-md border border-hairline p-3">
                <legend className="px-1 text-caption text-ink-quiet">
                  Coach
                </legend>
                <div className="grid grid-cols-3 gap-3">
                  <Input
                    placeholder="Name"
                    value={coach}
                    onChange={(e) => setCoach(e.target.value)}
                  />
                  <Input
                    placeholder="Email"
                    value={coachEmail}
                    onChange={(e) => setCoachEmail(e.target.value)}
                  />
                  <Input
                    placeholder="Phone"
                    value={coachPhone}
                    onChange={(e) => setCoachPhone(e.target.value)}
                  />
                </div>
              </fieldset>
              <fieldset className="grid gap-3 rounded-md border border-hairline p-3">
                <legend className="px-1 text-caption text-ink-quiet">
                  Additional coach
                </legend>
                <div className="grid grid-cols-3 gap-3">
                  <Input
                    placeholder="Name"
                    value={additionalCoach}
                    onChange={(e) => setAdditionalCoach(e.target.value)}
                  />
                  <Input
                    placeholder="Email"
                    value={additionalCoachEmail}
                    onChange={(e) => setAdditionalCoachEmail(e.target.value)}
                  />
                  <Input
                    placeholder="Phone"
                    value={additionalCoachPhone}
                    onChange={(e) => setAdditionalCoachPhone(e.target.value)}
                  />
                </div>
              </fieldset>
              <fieldset className="grid gap-3 rounded-md border border-hairline p-3">
                <legend className="px-1 text-caption text-ink-quiet">
                  Manager
                </legend>
                <div className="grid grid-cols-3 gap-3">
                  <Input
                    placeholder="Name"
                    value={manager}
                    onChange={(e) => setManager(e.target.value)}
                  />
                  <Input
                    placeholder="Email"
                    value={managerEmail}
                    onChange={(e) => setManagerEmail(e.target.value)}
                  />
                  <Input
                    placeholder="Phone"
                    value={managerPhone}
                    onChange={(e) => setManagerPhone(e.target.value)}
                  />
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-body text-ink-soft">
                  <input
                    type="checkbox"
                    checked={teamRegistered}
                    onChange={(e) => setTeamRegistered(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  Team registered
                </label>
                <label className="inline-flex items-center gap-2 text-body text-ink-soft">
                  <input
                    type="checkbox"
                    checked={teamRegistrationPaid}
                    onChange={(e) => setTeamRegistrationPaid(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  Registration paid
                </label>
                <div className="grid gap-1.5 flex-1 min-w-[180px]">
                  <Label htmlFor="team-reg-date">Registered date</Label>
                  <Input
                    id="team-reg-date"
                    type="date"
                    value={teamRegisteredDate}
                    onChange={(e) => setTeamRegisteredDate(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}
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
