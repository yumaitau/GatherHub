import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarCheck,
  Crown,
  RefreshCw,
  Trash2,
  UserPlus,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { EmptyState, LoadingState, PageHeader } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import {
  legacySoccerSurfacesEnabled,
  moduleEnabled,
  sportSectionLabel,
} from "@/lib/verticals";

type FixtureRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.fixtures.listFixtures>>
>[number];
type TeamRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.teams.list>>
>[number];
type TeamDetail = NonNullable<
  ReturnType<typeof useQuery<typeof api.teams.get>>
>;
type SquadRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.matchRosters.listForFixture>>
>[number];
type SquadMemberRow = SquadRow["members"][number];
type RosterTemplate = SquadRow["template"];

const NONE = "__none__";
const PARTICIPATION_STATUSES = [
  "selected",
  "arrived",
  "active",
  "bench",
  "substituted",
  "interchanged",
  "unavailable",
] as const;
type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number];

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function formatDateTime(ms: number | null | undefined) {
  if (!ms) return "Unscheduled";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

function memberLabel(member: SquadMemberRow) {
  return (
    member.memberName ||
    `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim()
  );
}

function statusVariant(status: ParticipationStatus) {
  switch (status) {
    case "arrived":
    case "active":
      return "success";
    case "bench":
    case "selected":
      return "info";
    case "substituted":
    case "interchanged":
      return "warning";
    case "unavailable":
      return "destructive";
    default:
      return "default";
  }
}

export default function MatchDayPage() {
  const { org, hasCapability } = useGatherHub();
  const canReadSport =
    moduleEnabled(org, "sport") || legacySoccerSurfacesEnabled(org);
  const canEdit = hasCapability("events.write");
  const sportName = sportSectionLabel(org);
  const [fixtureId, setFixtureId] = React.useState<string>(NONE);
  const [teamId, setTeamId] = React.useState<string>(NONE);

  const fixtures = useQuery(
    api.fixtures.listFixtures,
    canReadSport ? {} : "skip",
  );
  const teams = useQuery(
    api.teams.list,
    canReadSport ? { includeInactive: true } : "skip",
  );
  const squads = useQuery(
    api.matchRosters.listForFixture,
    fixtureId !== NONE ? { fixtureId: fixtureId as Id<"fixtures"> } : "skip",
  );
  const fallbackTemplate = useQuery(
    api.matchRosters.template,
    canReadSport ? {} : "skip",
  );
  const teamDetail = useQuery(
    api.teams.get,
    teamId !== NONE ? { teamId: teamId as Id<"teams"> } : "skip",
  );

  React.useEffect(() => {
    if (!fixtures?.length || fixtureId !== NONE) return;
    const sorted = [...fixtures].sort((a, b) => a.startTime - b.startTime);
    setFixtureId(sorted[0]!._id);
  }, [fixtureId, fixtures]);

  const selectedFixture = React.useMemo(
    () => fixtures?.find((fixture) => fixture._id === fixtureId),
    [fixtureId, fixtures],
  );

  React.useEffect(() => {
    if (!selectedFixture || teamId !== NONE) return;
    const linkedTeamId = selectedFixture.teams.find(
      (row) => row.teamId,
    )?.teamId;
    if (linkedTeamId) setTeamId(linkedTeamId);
  }, [selectedFixture, teamId]);

  const selectedSquad = React.useMemo(
    () => squads?.find((squad) => squad.teamId === teamId),
    [squads, teamId],
  );
  const template = selectedSquad?.template ?? fallbackTemplate;

  if (!canReadSport) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title={`${sportName} pack is off`}
        description="Enable the sport module in Settings to manage match-day team sheets."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  const loading =
    fixtures === undefined ||
    teams === undefined ||
    fallbackTemplate === undefined ||
    (fixtureId !== NONE && squads === undefined) ||
    (teamId !== NONE && teamDetail === undefined);

  return (
    <div>
      <PageHeader
        title="Match day"
        description={`Build ${sportName.toLowerCase()} rosters, positions, arrivals, and interchange logs from fixture team sheets.`}
      />

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <MatchDaySelectors
            fixtures={fixtures ?? []}
            teams={teams ?? []}
            selectedFixture={selectedFixture}
            fixtureId={fixtureId}
            teamId={teamId}
            onFixtureChange={(value) => {
              setFixtureId(value);
              setTeamId(NONE);
            }}
            onTeamChange={setTeamId}
          />

          {fixtureId === NONE || teamId === NONE || !template ? (
            <EmptyState
              icon={CalendarCheck}
              title="Select fixture and team"
              description="Choose a fixture and a team to manage the match-day sheet."
            />
          ) : selectedSquad ? (
            <RosterWorkspace
              fixture={selectedFixture}
              team={teams?.find((team) => team._id === teamId)}
              teamDetail={teamDetail}
              squad={selectedSquad}
              template={template}
              canEdit={canEdit}
            />
          ) : (
            <SeedRosterPanel
              fixtureId={fixtureId as Id<"fixtures">}
              teamId={teamId as Id<"teams">}
              teamName={teams?.find((team) => team._id === teamId)?.name}
              canEdit={canEdit}
            />
          )}
        </>
      )}
    </div>
  );
}

function MatchDaySelectors({
  fixtures,
  teams,
  selectedFixture,
  fixtureId,
  teamId,
  onFixtureChange,
  onTeamChange,
}: {
  fixtures: FixtureRow[];
  teams: TeamRow[];
  selectedFixture: FixtureRow | undefined;
  fixtureId: string;
  teamId: string;
  onFixtureChange: (value: string) => void;
  onTeamChange: (value: string) => void;
}) {
  const fixtureTeams = selectedFixture?.teams
    .filter((row) => row.teamId)
    .map((row) => ({
      id: row.teamId!,
      name: row.teamName ?? row.displayName ?? "Team",
    }));
  const teamOptions = fixtureTeams?.length
    ? fixtureTeams
    : teams.map((team) => ({ id: team._id, name: team.name }));

  return (
    <section className="mb-4 grid gap-3 rounded-md border border-hairline bg-surface p-3 md:grid-cols-[2fr_1fr]">
      <div className="grid gap-1.5">
        <Label>Fixture</Label>
        <Select value={fixtureId} onValueChange={onFixtureChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No fixture selected</SelectItem>
            {fixtures
              .slice()
              .sort((a, b) => a.startTime - b.startTime)
              .map((fixture) => (
                <SelectItem key={fixture._id} value={fixture._id}>
                  {fixture.title} · {formatDateTime(fixture.startTime)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label>Team</Label>
        <Select value={teamId} onValueChange={onTeamChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No team selected</SelectItem>
            {teamOptions.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}

function SeedRosterPanel({
  fixtureId,
  teamId,
  teamName,
  canEdit,
}: {
  fixtureId: Id<"fixtures">;
  teamId: Id<"teams">;
  teamName: string | undefined;
  canEdit: boolean;
}) {
  const seedFromTeam = useMutation(api.matchRosters.seedFromTeam);
  const [saving, setSaving] = React.useState(false);

  async function buildRoster() {
    setSaving(true);
    try {
      await seedFromTeam({ fixtureId, teamId });
      toastSuccess("Match roster created.");
    } catch (err) {
      toastFailure(err, "Could not create match roster.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-md border border-hairline bg-surface p-6">
      <div className="max-w-xl">
        <h2 className="text-title text-ink-strong">No team sheet yet</h2>
        <p className="mt-1 text-body text-ink-soft">
          Build a match roster from {teamName ?? "this team"}.
        </p>
        {canEdit && (
          <Button className="mt-4" onClick={buildRoster} disabled={saving}>
            <RefreshCw />
            {saving ? "Building..." : "Build roster"}
          </Button>
        )}
      </div>
    </section>
  );
}

function RosterWorkspace({
  fixture,
  team,
  teamDetail,
  squad,
  template,
  canEdit,
}: {
  fixture: FixtureRow | undefined;
  team: TeamRow | undefined;
  teamDetail: TeamDetail | undefined;
  squad: SquadRow;
  template: RosterTemplate;
  canEdit: boolean;
}) {
  const seedFromTeam = useMutation(api.matchRosters.seedFromTeam);
  const upsertMember = useMutation(api.matchRosters.upsertSquadMember);
  const updateParticipation = useMutation(api.matchRosters.updateParticipation);
  const removeMember = useMutation(api.matchRosters.removeSquadMember);
  const [memberToAdd, setMemberToAdd] = React.useState(NONE);
  const [saving, setSaving] = React.useState(false);

  const rosterMemberIds = new Set(squad.members.map((row) => row.memberId));
  const availablePlayers =
    teamDetail?.players.filter(
      (row) => row.member && !rosterMemberIds.has(row.member._id),
    ) ?? [];

  const warnings = rosterWarnings(squad, template);

  async function refreshFromTeam() {
    setSaving(true);
    try {
      await seedFromTeam({ fixtureId: squad.fixtureId, teamId: squad.teamId });
      toastSuccess("Roster refreshed from team.");
    } catch (err) {
      toastFailure(err, "Could not refresh roster.");
    } finally {
      setSaving(false);
    }
  }

  async function addPlayer() {
    if (memberToAdd === NONE) return;
    setSaving(true);
    try {
      await upsertMember({
        squadId: squad._id,
        memberId: memberToAdd as Id<"members">,
      });
      setMemberToAdd(NONE);
      toastSuccess("Player added.");
    } catch (err) {
      toastFailure(err, "Could not add player.");
    } finally {
      setSaving(false);
    }
  }

  async function setPosition(
    member: SquadMemberRow,
    positionKey: string | null,
  ) {
    if (!canEdit) return;
    try {
      await updateParticipation({
        squadMemberId: member._id,
        positionKey,
      });
      toastSuccess("Position updated.");
    } catch (err) {
      toastFailure(err, "Could not update position.");
    }
  }

  async function remove(member: SquadMemberRow) {
    if (!confirm(`Remove ${memberLabel(member)} from this team sheet?`)) return;
    try {
      await removeMember({ squadMemberId: member._id });
      toastSuccess("Player removed.");
    } catch (err) {
      toastFailure(err, "Could not remove player.");
    }
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-md border border-hairline bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <div>
            <h2 className="text-title text-ink-strong">
              {team?.name ?? squad.teamName}
            </h2>
            <p className="text-caption text-ink-quiet">
              {fixture?.title ?? squad.fixtureTitle} ·{" "}
              {formatDateTime(squad.fixtureStartTime)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{template.label}</Badge>
            {template.onFieldPlayers > 0 && (
              <Badge variant="muted">{template.onFieldPlayers} on field</Badge>
            )}
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={refreshFromTeam}
                disabled={saving}
              >
                <RefreshCw />
                Refresh
              </Button>
            )}
          </div>
        </header>

        {warnings.length > 0 && (
          <div className="grid gap-2 border-b border-hairline bg-warning-wash/40 px-4 py-3">
            {warnings.map((warning) => (
              <div
                key={warning}
                className="flex items-center gap-2 text-caption text-warning"
              >
                <AlertTriangle className="size-4" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}

        {canEdit && availablePlayers.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 border-b border-hairline px-4 py-3">
            <div className="grid min-w-[240px] gap-1.5">
              <Label>Add player</Label>
              <Select value={memberToAdd} onValueChange={setMemberToAdd}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Choose player</SelectItem>
                  {availablePlayers.map((row) => (
                    <SelectItem key={row.member!._id} value={row.member!._id}>
                      {row.member!.firstName} {row.member!.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={addPlayer}
              disabled={memberToAdd === NONE || saving}
            >
              <UserPlus />
              Add
            </Button>
          </div>
        )}

        <PositionBoard
          members={squad.members}
          template={template}
          canEdit={canEdit}
          onDropMember={setPosition}
        />
      </section>

      <RosterTable
        members={squad.members}
        template={template}
        canEdit={canEdit}
        onRemove={remove}
      />
    </div>
  );
}

function PositionBoard({
  members,
  template,
  canEdit,
  onDropMember,
}: {
  members: SquadMemberRow[];
  template: RosterTemplate;
  canEdit: boolean;
  onDropMember: (member: SquadMemberRow, positionKey: string | null) => void;
}) {
  const byId = React.useMemo(
    () => new Map(members.map((member) => [member._id, member])),
    [members],
  );

  function handleDrop(
    event: React.DragEvent<HTMLDivElement>,
    positionKey: string | null,
  ) {
    event.preventDefault();
    const member = byId.get(
      event.dataTransfer.getData("text/plain") as Id<"matchSquadMembers">,
    );
    if (member) void onDropMember(member, positionKey);
  }

  return (
    <div className="grid gap-px overflow-x-auto bg-hairline md:grid-cols-3 xl:grid-cols-4">
      {template.positions.map((position) => {
        const assigned = members.filter(
          (member) => member.positionKey === position.key,
        );
        return (
          <div
            key={position.key}
            className="min-h-[156px] min-w-[220px] bg-surface p-3"
            onDragOver={(event) => {
              if (canEdit) event.preventDefault();
            }}
            onDrop={(event) => handleDrop(event, position.key)}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-label text-ink-strong">
                  {position.label}
                </div>
                <div className="text-caption text-ink-quiet">
                  {position.group}
                </div>
              </div>
              <Badge variant="muted">{assigned.length}</Badge>
            </div>
            <div className="grid gap-2">
              {assigned.map((member) => (
                <RosterChip
                  key={member._id}
                  member={member}
                  draggable={canEdit}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div
        className="min-h-[156px] min-w-[220px] bg-surface p-3"
        onDragOver={(event) => {
          if (canEdit) event.preventDefault();
        }}
        onDrop={(event) => handleDrop(event, null)}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-label text-ink-strong">Bench / unassigned</div>
            <div className="text-caption text-ink-quiet">
              {labelize(template.substitutionMode)}
            </div>
          </div>
          <Badge variant="muted">
            {members.filter((member) => !member.positionKey).length}
          </Badge>
        </div>
        <div className="grid gap-2">
          {members
            .filter((member) => !member.positionKey)
            .map((member) => (
              <RosterChip
                key={member._id}
                member={member}
                draggable={canEdit}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function RosterChip({
  member,
  draggable,
}: {
  member: SquadMemberRow;
  draggable: boolean;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", member._id);
      }}
      className="rounded-sm border border-border bg-paper px-2.5 py-2 shadow-subtle"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-caption font-semi text-ink-strong">
          {memberLabel(member)}
        </span>
        {member.isCaptain && <Crown className="size-3.5 text-warning" />}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <Badge variant={statusVariant(member.participationStatus)}>
          {labelize(member.participationStatus)}
        </Badge>
        {(member.jerseyNumber || member.bibNumber) && (
          <Badge variant="outline">
            {member.jerseyNumber ?? member.bibNumber}
          </Badge>
        )}
      </div>
    </div>
  );
}

function RosterTable({
  members,
  template,
  canEdit,
  onRemove,
}: {
  members: SquadMemberRow[];
  template: RosterTemplate;
  canEdit: boolean;
  onRemove: (member: SquadMemberRow) => void;
}) {
  const updateParticipation = useMutation(api.matchRosters.updateParticipation);

  async function update(
    member: SquadMemberRow,
    patch: {
      participationStatus?: ParticipationStatus;
      positionKey?: string | null;
      jerseyNumber?: string | null;
      bibNumber?: string | null;
      isCaptain?: boolean;
      isViceCaptain?: boolean;
    },
  ) {
    try {
      await updateParticipation({
        squadMemberId: member._id,
        ...patch,
      });
      toastSuccess("Team sheet updated.");
    } catch (err) {
      toastFailure(err, "Could not update team sheet.");
    }
  }

  return (
    <section className="rounded-md border border-hairline bg-surface">
      <header className="border-b border-hairline px-4 py-3">
        <h2 className="text-title text-ink-strong">Roster</h2>
      </header>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Player</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>{template.jerseyLabel}</TableHead>
            <TableHead>Leadership</TableHead>
            {canEdit && <TableHead className="w-[56px]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member._id}>
              <TableCell>
                <div className="font-semi text-ink-strong">
                  {memberLabel(member)}
                </div>
                {member.email && (
                  <div className="text-caption text-ink-quiet">
                    {member.email}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Select
                  value={member.participationStatus}
                  disabled={!canEdit}
                  onValueChange={(value) =>
                    void update(member, {
                      participationStatus: value as ParticipationStatus,
                    })
                  }
                >
                  <SelectTrigger className="min-w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTICIPATION_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {labelize(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Select
                  value={member.positionKey ?? NONE}
                  disabled={!canEdit}
                  onValueChange={(value) =>
                    void update(member, {
                      positionKey: value === NONE ? null : value,
                    })
                  }
                >
                  <SelectTrigger className="min-w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unassigned</SelectItem>
                    {template.positions.map((position) => (
                      <SelectItem key={position.key} value={position.key}>
                        {position.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  defaultValue={member.jerseyNumber ?? member.bibNumber ?? ""}
                  disabled={!canEdit}
                  className="w-[88px]"
                  onBlur={(event) => {
                    const value = event.currentTarget.value.trim() || null;
                    void update(
                      member,
                      template.jerseyLabel === "bib"
                        ? { bibNumber: value }
                        : { jerseyNumber: value },
                    );
                  }}
                />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-1.5 text-caption text-ink-soft">
                    <input
                      type="checkbox"
                      checked={Boolean(member.isCaptain)}
                      disabled={!canEdit}
                      onChange={(event) =>
                        void update(member, { isCaptain: event.target.checked })
                      }
                    />
                    Captain
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-caption text-ink-soft">
                    <input
                      type="checkbox"
                      checked={Boolean(member.isViceCaptain)}
                      disabled={!canEdit}
                      onChange={(event) =>
                        void update(member, {
                          isViceCaptain: event.target.checked,
                        })
                      }
                    />
                    Vice
                  </label>
                </div>
              </TableCell>
              {canEdit && (
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${memberLabel(member)}`}
                    onClick={() => onRemove(member)}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function rosterWarnings(squad: SquadRow, template: RosterTemplate) {
  const warnings: string[] = [];
  if (squad.members.length > template.squadMax) {
    warnings.push(
      `Squad has ${squad.members.length}/${template.squadMax} players.`,
    );
  }
  if (squad.members.length < template.squadMin) {
    warnings.push(
      `Squad has ${squad.members.length}/${template.squadMin} players.`,
    );
  }
  const unavailable = new Set(["unavailable"]);
  const onField = squad.members.filter(
    (member) =>
      member.positionKey &&
      member.planned &&
      !unavailable.has(member.participationStatus),
  );
  if (template.onFieldPlayers > 0 && onField.length > template.onFieldPlayers) {
    warnings.push(
      `On-field count is ${onField.length}/${template.onFieldPlayers}.`,
    );
  }
  for (const position of template.positions) {
    if (!position.maxSelected) continue;
    const count = onField.filter(
      (member) => member.positionKey === position.key,
    ).length;
    if (count > position.maxSelected) {
      warnings.push(`${position.label} has ${count}/${position.maxSelected}.`);
    }
  }
  return warnings;
}
