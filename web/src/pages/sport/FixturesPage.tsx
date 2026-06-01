import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Download,
  GripVertical,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id, TableNames } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
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
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
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
type SeasonRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.fixtures.listSeasons>>
>[number];
type CompetitionRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.fixtures.listCompetitions>>
>[number];
type DivisionRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.fixtures.listDivisions>>
>[number];
type VenueRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.fixtures.listVenues>>
>[number];
type TeamRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.teams.list>>
>[number];

const ALL = "__all__";
const NONE = "__none__";
const STATUSES = [
  "scheduled",
  "postponed",
  "cancelled",
  "completed",
  "forfeit",
] as const;
type FixtureStatus = (typeof STATUSES)[number];

function maybeId<Table extends TableNames>(
  value: string,
): Id<Table> | undefined {
  return value === ALL || value === NONE || !value
    ? undefined
    : (value as Id<Table>);
}

function formatDateTime(ms: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

function formatDate(ms: number) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

function toLocalInput(ms: number | undefined) {
  if (!ms) return "";
  const date = new Date(ms);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
  return value ? new Date(value).getTime() : undefined;
}

function teamLabel(row: FixtureRow["teams"][number]) {
  return row.teamName ?? row.displayName ?? "TBC";
}

function escapeCsv(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    const next = input[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

export default function FixturesPage() {
  const { org, hasCapability } = useGatherHub();
  const canEdit = hasCapability("events.write");
  const canDelete = hasCapability("events.delete");
  const sportEnabled =
    moduleEnabled(org, "sport") || legacySoccerSurfacesEnabled(org);
  const sportName = sportSectionLabel(org);
  const [seasonId, setSeasonId] = React.useState(ALL);
  const [competitionId, setCompetitionId] = React.useState(ALL);
  const [divisionId, setDivisionId] = React.useState(ALL);
  const [teamId, setTeamId] = React.useState(ALL);
  const [venueId, setVenueId] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);

  const fixtureArgs = React.useMemo(
    () => ({
      ...(maybeId<"seasons">(seasonId)
        ? { seasonId: maybeId<"seasons">(seasonId) }
        : {}),
      ...(maybeId<"sportCompetitions">(competitionId)
        ? { competitionId: maybeId<"sportCompetitions">(competitionId) }
        : {}),
      ...(maybeId<"sportDivisions">(divisionId)
        ? { divisionId: maybeId<"sportDivisions">(divisionId) }
        : {}),
      ...(maybeId<"teams">(teamId) ? { teamId: maybeId<"teams">(teamId) } : {}),
      ...(maybeId<"venues">(venueId)
        ? { venueId: maybeId<"venues">(venueId) }
        : {}),
      ...(STATUSES.includes(status as FixtureStatus)
        ? { status: status as FixtureStatus }
        : {}),
    }),
    [competitionId, divisionId, seasonId, status, teamId, venueId],
  );

  const fixtures = useQuery(
    api.fixtures.listFixtures,
    sportEnabled ? fixtureArgs : "skip",
  );
  const seasons = useQuery(
    api.fixtures.listSeasons,
    sportEnabled ? {} : "skip",
  );
  const competitions = useQuery(
    api.fixtures.listCompetitions,
    sportEnabled ? {} : "skip",
  );
  const divisions = useQuery(
    api.fixtures.listDivisions,
    sportEnabled ? {} : "skip",
  );
  const venues = useQuery(api.fixtures.listVenues, sportEnabled ? {} : "skip");
  const teams = useQuery(
    api.teams.list,
    sportEnabled ? { includeInactive: true } : "skip",
  );

  if (!sportEnabled) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={`${sportName} pack is off`}
        description="Enable the sport module in Settings to manage fixtures."
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
    seasons === undefined ||
    competitions === undefined ||
    divisions === undefined ||
    venues === undefined ||
    teams === undefined;

  return (
    <div>
      <PageHeader
        title="Fixtures"
        description={`Manage ${sportName.toLowerCase()} seasons, competitions, venues, and match-day fixtures.`}
        actions={
          canEdit && (
            <div className="flex flex-wrap gap-2">
              <SetupDialog
                seasons={seasons ?? []}
                competitions={competitions ?? []}
                divisions={divisions ?? []}
                venues={venues ?? []}
              />
              <CsvToolsDialog
                fixtures={fixtures ?? []}
                seasons={seasons ?? []}
                competitions={competitions ?? []}
                divisions={divisions ?? []}
                venues={venues ?? []}
                teams={teams ?? []}
              />
              <FixtureDialog
                seasons={seasons ?? []}
                competitions={competitions ?? []}
                divisions={divisions ?? []}
                venues={venues ?? []}
                teams={teams ?? []}
              />
            </div>
          )
        }
      />

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <FixtureFilters
            seasons={seasons}
            competitions={competitions}
            divisions={divisions}
            venues={venues}
            teams={teams}
            values={{
              seasonId,
              competitionId,
              divisionId,
              venueId,
              teamId,
              status,
            }}
            setters={{
              setSeasonId,
              setCompetitionId,
              setDivisionId,
              setVenueId,
              setTeamId,
              setStatus,
            }}
          />
          <ScheduleBoard fixtures={fixtures} canEdit={canEdit} />
          {fixtures.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No fixtures found"
              description="Create fixtures manually or seed defaults from the setup menu."
              action={
                canEdit && (
                  <FixtureDialog
                    seasons={seasons}
                    competitions={competitions}
                    divisions={divisions}
                    venues={venues}
                    teams={teams}
                  />
                )
              }
            />
          ) : (
            <FixturesTable
              fixtures={fixtures}
              seasons={seasons}
              competitions={competitions}
              divisions={divisions}
              venues={venues}
              teams={teams}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          )}
        </>
      )}
    </div>
  );
}

function FixtureFilters({
  seasons,
  competitions,
  divisions,
  venues,
  teams,
  values,
  setters,
}: {
  seasons: SeasonRow[];
  competitions: CompetitionRow[];
  divisions: DivisionRow[];
  venues: VenueRow[];
  teams: TeamRow[];
  values: Record<
    | "seasonId"
    | "competitionId"
    | "divisionId"
    | "venueId"
    | "teamId"
    | "status",
    string
  >;
  setters: {
    setSeasonId: (value: string) => void;
    setCompetitionId: (value: string) => void;
    setDivisionId: (value: string) => void;
    setVenueId: (value: string) => void;
    setTeamId: (value: string) => void;
    setStatus: (value: string) => void;
  };
}) {
  return (
    <section className="mb-4 grid gap-2 rounded-md border border-hairline bg-surface p-3 md:grid-cols-3 xl:grid-cols-6">
      <FilterSelect
        label="Season"
        value={values.seasonId}
        onValueChange={setters.setSeasonId}
      >
        {seasons.map((row) => (
          <SelectItem key={row._id} value={row._id}>
            {row.name}
          </SelectItem>
        ))}
      </FilterSelect>
      <FilterSelect
        label="Competition"
        value={values.competitionId}
        onValueChange={setters.setCompetitionId}
      >
        {competitions.map((row) => (
          <SelectItem key={row._id} value={row._id}>
            {row.name}
          </SelectItem>
        ))}
      </FilterSelect>
      <FilterSelect
        label="Division"
        value={values.divisionId}
        onValueChange={setters.setDivisionId}
      >
        {divisions.map((row) => (
          <SelectItem key={row._id} value={row._id}>
            {row.name}
          </SelectItem>
        ))}
      </FilterSelect>
      <FilterSelect
        label="Team"
        value={values.teamId}
        onValueChange={setters.setTeamId}
      >
        {teams.map((row) => (
          <SelectItem key={row._id} value={row._id}>
            {row.name}
          </SelectItem>
        ))}
      </FilterSelect>
      <FilterSelect
        label="Venue"
        value={values.venueId}
        onValueChange={setters.setVenueId}
      >
        {venues.map((row) => (
          <SelectItem key={row._id} value={row._id}>
            {row.name}
          </SelectItem>
        ))}
      </FilterSelect>
      <FilterSelect
        label="Status"
        value={values.status}
        onValueChange={setters.setStatus}
      >
        {STATUSES.map((value) => (
          <SelectItem key={value} value={value}>
            {value.replace(/_/g, " ")}
          </SelectItem>
        ))}
      </FilterSelect>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  children,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {children}
        </SelectContent>
      </Select>
    </div>
  );
}

function ScheduleBoard({
  fixtures,
  canEdit,
}: {
  fixtures: FixtureRow[];
  canEdit: boolean;
}) {
  const upsert = useMutation(api.fixtures.upsertFixture);
  const sorted = React.useMemo(
    () => [...fixtures].sort((a, b) => a.startTime - b.startTime),
    [fixtures],
  );
  const anchor = React.useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const upcoming = sorted.find(
      (row) => row.startTime >= startOfToday.getTime(),
    );
    return upcoming?.startTime ?? sorted[0]?.startTime ?? Date.now();
  }, [sorted]);
  const days = React.useMemo(() => {
    const first = new Date(anchor);
    first.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, offset) => {
      const day = new Date(first);
      day.setDate(first.getDate() + offset);
      return day.getTime();
    });
  }, [anchor]);

  async function moveFixture(fixtureId: string, dayStart: number) {
    const fixture = fixtures.find((row) => row._id === fixtureId);
    if (!fixture) return;
    const source = new Date(fixture.startTime);
    const target = new Date(dayStart);
    target.setHours(source.getHours(), source.getMinutes(), 0, 0);
    try {
      await upsert({
        id: fixture._id,
        title: fixture.title,
        startTime: target.getTime(),
      });
      toastSuccess("Fixture rescheduled.");
    } catch (err) {
      toastFailure(err, "Could not reschedule fixture.");
    }
  }

  return (
    <section className="mb-4 rounded-md border border-hairline bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div>
          <h2 className="text-title text-ink-strong">Week schedule</h2>
          <p className="text-caption text-ink-quiet">
            Seven-day fixture plan for the selected filters.
          </p>
        </div>
        <Badge variant="muted">{sorted.length} fixtures</Badge>
      </header>
      <div className="grid gap-px overflow-x-auto bg-hairline md:grid-cols-7">
        {days.map((dayStart) => {
          const dayEnd = dayStart + 86_400_000;
          const dayFixtures = sorted.filter(
            (fixture) =>
              fixture.startTime >= dayStart && fixture.startTime < dayEnd,
          );
          return (
            <div
              key={dayStart}
              className="min-h-[128px] min-w-[220px] bg-surface p-3"
              onDragOver={(event) => {
                if (canEdit) event.preventDefault();
              }}
              onDrop={(event) => {
                if (!canEdit) return;
                event.preventDefault();
                const fixtureId = event.dataTransfer.getData("text/plain");
                if (fixtureId) void moveFixture(fixtureId, dayStart);
              }}
            >
              <div className="mb-2 text-label text-ink-quiet">
                {formatDate(dayStart)}
              </div>
              <div className="grid gap-2">
                {dayFixtures.map((fixture) => (
                  <button
                    key={fixture._id}
                    type="button"
                    draggable={canEdit}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", fixture._id);
                    }}
                    className="w-full rounded-sm border border-hairline bg-paper p-2 text-left text-body shadow-none transition-colors hover:bg-surface-sunk focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    <span className="flex items-start gap-2">
                      {canEdit && (
                        <GripVertical
                          className="mt-0.5 h-4 w-4 shrink-0 text-ink-quiet"
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semi text-ink-strong">
                          {fixture.title}
                        </span>
                        <span className="block text-caption text-ink-quiet">
                          {new Intl.DateTimeFormat(undefined, {
                            timeStyle: "short",
                          }).format(new Date(fixture.startTime))}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
                {dayFixtures.length === 0 && (
                  <p className="rounded-sm border border-dashed border-hairline px-3 py-4 text-center text-caption text-ink-quiet">
                    No fixtures
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FixturesTable({
  fixtures,
  seasons,
  competitions,
  divisions,
  venues,
  teams,
  canEdit,
  canDelete,
}: {
  fixtures: FixtureRow[];
  seasons: SeasonRow[];
  competitions: CompetitionRow[];
  divisions: DivisionRow[];
  venues: VenueRow[];
  teams: TeamRow[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const remove = useMutation(api.fixtures.removeFixture);

  async function removeFixture(row: FixtureRow) {
    try {
      await remove({ fixtureId: row._id });
      toastSuccess("Fixture deleted.");
    } catch (err) {
      toastFailure(err, "Could not delete fixture.");
    }
  }

  return (
    <section className="rounded-md border border-hairline bg-surface overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fixture</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Competition</TableHead>
            <TableHead>Venue</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {fixtures.map((fixture) => {
            const home = fixture.teams.find((team) => team.side === "home");
            const away = fixture.teams.find((team) => team.side === "away");
            return (
              <TableRow key={fixture._id}>
                <TableCell>
                  <p className="font-semi text-ink-strong">{fixture.title}</p>
                  <p className="text-caption text-ink-quiet">
                    {[home && teamLabel(home), away && teamLabel(away)]
                      .filter(Boolean)
                      .join(" vs ") || "Teams TBC"}
                  </p>
                </TableCell>
                <TableCell>{formatDateTime(fixture.startTime)}</TableCell>
                <TableCell>
                  <p>{fixture.competitionName ?? "—"}</p>
                  <p className="text-caption text-ink-quiet">
                    {fixture.divisionName ?? fixture.seasonName ?? ""}
                  </p>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-ink-quiet" />
                    {fixture.venueName ?? fixture.fieldName ?? "TBC"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      fixture.status === "completed" ? "success" : "secondary"
                    }
                  >
                    {fixture.status.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell>
                  {(canEdit || canDelete) && (
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <FixtureDialog
                          fixture={fixture}
                          seasons={seasons}
                          competitions={competitions}
                          divisions={divisions}
                          venues={venues}
                          teams={teams}
                        />
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete fixture"
                          onClick={() => removeFixture(fixture)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

function FixtureDialog({
  fixture,
  seasons,
  competitions,
  divisions,
  venues,
  teams,
}: {
  fixture?: FixtureRow;
  seasons: SeasonRow[];
  competitions: CompetitionRow[];
  divisions: DivisionRow[];
  venues: VenueRow[];
  teams: TeamRow[];
}) {
  const upsert = useMutation(api.fixtures.upsertFixture);
  const upsertTeam = useMutation(api.fixtures.upsertFixtureTeam);
  const removeTeam = useMutation(api.fixtures.removeFixtureTeam);
  const formId = React.useId();
  const homeFixtureTeam = React.useMemo(
    () => fixture?.teams.find((team) => team.side === "home"),
    [fixture],
  );
  const awayFixtureTeam = React.useMemo(
    () => fixture?.teams.find((team) => team.side === "away"),
    [fixture],
  );
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(fixture?.title ?? "");
  const [startTime, setStartTime] = React.useState(
    toLocalInput(fixture?.startTime),
  );
  const [endTime, setEndTime] = React.useState(toLocalInput(fixture?.endTime));
  const [seasonId, setSeasonId] = React.useState(fixture?.seasonId ?? NONE);
  const [competitionId, setCompetitionId] = React.useState(
    fixture?.competitionId ?? NONE,
  );
  const [divisionId, setDivisionId] = React.useState(
    fixture?.divisionId ?? NONE,
  );
  const [venueId, setVenueId] = React.useState(fixture?.venueId ?? NONE);
  const [roundName, setRoundName] = React.useState(fixture?.roundName ?? "");
  const [fieldName, setFieldName] = React.useState(fixture?.fieldName ?? "");
  const [status, setStatus] = React.useState<FixtureStatus>(
    fixture?.status ?? "scheduled",
  );
  const [homeTeamId, setHomeTeamId] = React.useState(
    homeFixtureTeam?.teamId ?? NONE,
  );
  const [awayTeamId, setAwayTeamId] = React.useState(
    awayFixtureTeam?.teamId ?? NONE,
  );
  const [homeName, setHomeName] = React.useState(
    homeFixtureTeam?.displayName ?? "",
  );
  const [awayName, setAwayName] = React.useState(
    awayFixtureTeam?.displayName ?? "",
  );
  const [notes, setNotes] = React.useState(fixture?.notes ?? "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(fixture?.title ?? "");
    setStartTime(toLocalInput(fixture?.startTime ?? Date.now()));
    setEndTime(toLocalInput(fixture?.endTime));
    setSeasonId(fixture?.seasonId ?? NONE);
    setCompetitionId(fixture?.competitionId ?? NONE);
    setDivisionId(fixture?.divisionId ?? NONE);
    setVenueId(fixture?.venueId ?? NONE);
    setRoundName(fixture?.roundName ?? "");
    setFieldName(fixture?.fieldName ?? "");
    setStatus(fixture?.status ?? "scheduled");
    setHomeTeamId(homeFixtureTeam?.teamId ?? NONE);
    setAwayTeamId(awayFixtureTeam?.teamId ?? NONE);
    setHomeName(homeFixtureTeam?.displayName ?? "");
    setAwayName(awayFixtureTeam?.displayName ?? "");
    setNotes(fixture?.notes ?? "");
  }, [awayFixtureTeam, fixture, homeFixtureTeam, open]);

  async function syncTeamSide(args: {
    existing?: FixtureRow["teams"][number];
    fixtureId: Id<"fixtures">;
    side: "home" | "away";
    teamId: string;
    displayName: string;
    order: number;
  }) {
    const displayName = args.displayName.trim();
    const teamId = maybeId<"teams">(args.teamId);
    if (!teamId && !displayName) {
      if (args.existing) await removeTeam({ id: args.existing._id });
      return;
    }
    await upsertTeam({
      id: args.existing?._id,
      fixtureId: args.fixtureId,
      side: args.side,
      teamId: teamId ?? null,
      displayName: displayName || null,
      order: args.order,
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const start = fromLocalInput(startTime);
    if (!start) return;
    setSaving(true);
    try {
      const fixtureId = await upsert({
        id: fixture?._id,
        title,
        seasonId: seasonId === NONE ? null : (seasonId as Id<"seasons">),
        competitionId:
          competitionId === NONE
            ? null
            : (competitionId as Id<"sportCompetitions">),
        divisionId:
          divisionId === NONE ? null : (divisionId as Id<"sportDivisions">),
        venueId: venueId === NONE ? null : (venueId as Id<"venues">),
        roundName: roundName.trim() || null,
        fieldName: fieldName.trim() || null,
        startTime: start,
        endTime: fromLocalInput(endTime) ?? null,
        status,
        notes: notes.trim() || null,
      });
      await syncTeamSide({
        existing: homeFixtureTeam,
        fixtureId,
        side: "home",
        teamId: homeTeamId,
        displayName: homeName,
        order: 1,
      });
      await syncTeamSide({
        existing: awayFixtureTeam,
        fixtureId,
        side: "away",
        teamId: awayTeamId,
        displayName: awayName,
        order: 2,
      });
      toastSuccess(fixture ? "Fixture updated." : "Fixture created.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not save fixture.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={fixture ? "ghost" : "default"}
          size={fixture ? "icon" : "default"}
        >
          {fixture ? (
            <Pencil className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {!fixture && "New fixture"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{fixture ? "Edit fixture" : "New fixture"}</DialogTitle>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-4 px-6 pb-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Start</Label>
              <Input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label>End</Label>
              <Input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <Picker
              label="Season"
              value={seasonId}
              onValueChange={setSeasonId}
              rows={seasons}
            />
            <Picker
              label="Competition"
              value={competitionId}
              onValueChange={setCompetitionId}
              rows={competitions}
            />
            <Picker
              label="Division"
              value={divisionId}
              onValueChange={setDivisionId}
              rows={divisions}
            />
            <Picker
              label="Venue"
              value={venueId}
              onValueChange={setVenueId}
              rows={venues}
            />
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as FixtureStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Round</Label>
              <Input
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
              />
            </div>
            <TeamPicker
              label="Home"
              teamId={homeTeamId}
              setTeamId={setHomeTeamId}
              customName={homeName}
              setCustomName={setHomeName}
              teams={teams}
            />
            <TeamPicker
              label="Away"
              teamId={awayTeamId}
              setTeamId={setAwayTeamId}
              customName={awayName}
              setCustomName={setAwayName}
              teams={teams}
            />
            <div className="grid gap-1.5">
              <Label>Field/court/pitch</Label>
              <Input
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form={formId}
            disabled={saving || !title.trim()}
          >
            {saving ? "Saving…" : "Save fixture"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Picker<T extends { _id: string; name: string }>({
  label,
  value,
  onValueChange,
  rows,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  rows: T[];
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {rows.map((row) => (
            <SelectItem key={row._id} value={row._id}>
              {row.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TeamPicker({
  label,
  teamId,
  setTeamId,
  customName,
  setCustomName,
  teams,
}: {
  label: string;
  teamId: string;
  setTeamId: (value: string) => void;
  customName: string;
  setCustomName: (value: string) => void;
  teams: TeamRow[];
}) {
  return (
    <div className="grid gap-2 rounded-sm border border-hairline p-3">
      <Picker
        label={`${label} team`}
        value={teamId}
        onValueChange={setTeamId}
        rows={teams}
      />
      <div className="grid gap-1.5">
        <Label>{label} display name</Label>
        <Input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="External opponent or TBC"
        />
      </div>
    </div>
  );
}

function CsvToolsDialog({
  fixtures,
  seasons,
  competitions,
  divisions,
  venues,
  teams,
}: {
  fixtures: FixtureRow[];
  seasons: SeasonRow[];
  competitions: CompetitionRow[];
  divisions: DivisionRow[];
  venues: VenueRow[];
  teams: TeamRow[];
}) {
  const upsert = useMutation(api.fixtures.upsertFixture);
  const upsertTeam = useMutation(api.fixtures.upsertFixtureTeam);
  const [open, setOpen] = React.useState(false);
  const [csv, setCsv] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  function findByName<T extends { _id: string; name: string }>(
    rows: T[],
    value: string | undefined,
  ) {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    return rows.find(
      (row) =>
        row._id === trimmed ||
        row.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
  }

  function exportCsv() {
    const rows = [
      [
        "id",
        "title",
        "startTime",
        "endTime",
        "status",
        "season",
        "competition",
        "division",
        "venue",
        "fieldName",
        "round",
        "homeTeam",
        "awayTeam",
        "notes",
      ],
      ...fixtures.map((fixture) => {
        const home = fixture.teams.find((row) => row.side === "home");
        const away = fixture.teams.find((row) => row.side === "away");
        return [
          fixture._id,
          fixture.title,
          new Date(fixture.startTime).toISOString(),
          fixture.endTime ? new Date(fixture.endTime).toISOString() : "",
          fixture.status,
          fixture.seasonName ?? "",
          fixture.competitionName ?? "",
          fixture.divisionName ?? "",
          fixture.venueName ?? "",
          fixture.fieldName ?? "",
          fixture.roundName ?? "",
          home ? teamLabel(home) : "",
          away ? teamLabel(away) : "",
          fixture.notes ?? "",
        ];
      }),
    ];
    const text = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fixtures.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(e: React.FormEvent) {
    e.preventDefault();
    const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim()));
    if (rows.length < 2) return;
    const [headerRow, ...dataRows] = rows;
    if (!headerRow) return;
    const header = headerRow.map((cell) =>
      cell
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, ""),
    );
    const value = (row: string[], name: string) => {
      const index = header.indexOf(name.toLowerCase().replace(/[\s_-]+/g, ""));
      return index >= 0 ? row[index]?.trim() : undefined;
    };
    let imported = 0;
    setImporting(true);
    try {
      for (const row of dataRows) {
        const title = value(row, "title");
        const startValue = value(row, "startTime");
        if (!title || !startValue) continue;
        const parsedStart = Number(startValue);
        const startTime = Number.isFinite(parsedStart)
          ? parsedStart
          : new Date(startValue).getTime();
        if (!Number.isFinite(startTime)) continue;
        const endValue = value(row, "endTime");
        const parsedEnd = endValue ? Number(endValue) : undefined;
        const endTime = endValue
          ? Number.isFinite(parsedEnd)
            ? parsedEnd
            : new Date(endValue).getTime()
          : undefined;
        const statusValue = value(row, "status") as FixtureStatus | undefined;
        const existingId = maybeId<"fixtures">(value(row, "id") ?? "");
        const existingFixture = fixtures.find(
          (fixture) => fixture._id === existingId,
        );
        const fixtureId = await upsert({
          id: existingId,
          title,
          startTime,
          endTime: endTime && Number.isFinite(endTime) ? endTime : null,
          status: STATUSES.includes(statusValue as FixtureStatus)
            ? (statusValue as FixtureStatus)
            : "scheduled",
          seasonId: findByName(seasons, value(row, "season"))?._id ?? null,
          competitionId:
            findByName(competitions, value(row, "competition"))?._id ?? null,
          divisionId:
            findByName(divisions, value(row, "division"))?._id ?? null,
          venueId: findByName(venues, value(row, "venue"))?._id ?? null,
          fieldName: value(row, "fieldName") || null,
          roundName: value(row, "round") || null,
          notes: value(row, "notes") || null,
        });
        for (const side of ["home", "away"] as const) {
          const name = value(row, `${side}Team`);
          if (!name) continue;
          const team = findByName(teams, name);
          const existingTeam = existingFixture?.teams.find(
            (fixtureTeam) => fixtureTeam.side === side,
          );
          await upsertTeam({
            id: existingTeam?._id,
            fixtureId,
            side,
            teamId: team?._id ?? null,
            displayName: team ? null : name,
            order: side === "home" ? 1 : 2,
          });
        }
        imported++;
      }
      toastSuccess(`${imported} fixtures imported.`);
      setCsv("");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not import fixtures.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4" />
          CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fixture CSV</DialogTitle>
          <DialogDescription>
            Import or export fixtures for the selected season plan.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={importCsv} className="grid gap-3 px-6 pb-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
          <div className="grid gap-1.5">
            <Label>CSV data</Label>
            <Textarea
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              rows={8}
              placeholder="id,title,startTime,endTime,status,season,competition,division,venue,fieldName,round,homeTeam,awayTeam,notes"
            />
          </div>
          <DialogFooter className="-mx-6 -mb-4">
            <Button type="submit" disabled={importing || !csv.trim()}>
              {importing ? "Importing…" : "Import fixtures"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SetupDialog({
  seasons,
  competitions,
  divisions,
  venues,
}: {
  seasons: SeasonRow[];
  competitions: CompetitionRow[];
  divisions: DivisionRow[];
  venues: VenueRow[];
}) {
  const seed = useMutation(api.fixtures.seedDefaults);
  const [open, setOpen] = React.useState(false);
  async function onSeed() {
    try {
      await seed({});
      toastSuccess("Sport defaults checked.");
    } catch (err) {
      toastFailure(err, "Could not seed defaults.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <RefreshCw className="h-4 w-4" />
          Setup
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Competition setup</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 px-6 pb-4 lg:grid-cols-2">
          <SetupList title="Seasons" rows={seasons} kind="season" />
          <SetupList
            title="Competitions"
            rows={competitions}
            kind="competition"
          />
          <SetupList
            title="Divisions / grades"
            rows={divisions}
            kind="division"
          />
          <SetupList title="Venues" rows={venues} kind="venue" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onSeed}>
            Check defaults
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SetupList({
  title,
  rows,
  kind,
}: {
  title: string;
  rows: Array<{ _id: string; name: string; active: boolean }>;
  kind: "season" | "competition" | "division" | "venue";
}) {
  const upsertSeason = useMutation(api.fixtures.upsertSeason);
  const upsertCompetition = useMutation(api.fixtures.upsertCompetition);
  const upsertDivision = useMutation(api.fixtures.upsertDivision);
  const upsertVenue = useMutation(api.fixtures.upsertVenue);
  const [name, setName] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      if (kind === "season") await upsertSeason({ name: trimmed });
      if (kind === "competition") await upsertCompetition({ name: trimmed });
      if (kind === "division") await upsertDivision({ name: trimmed });
      if (kind === "venue") await upsertVenue({ name: trimmed });
      setName("");
      toastSuccess(`${kind} added.`);
    } catch (err) {
      toastFailure(err, `Could not add ${kind}.`);
    }
  }

  function startEdit(row: { _id: string; name: string }) {
    setEditingId(row._id);
    setEditName(row.name);
  }

  async function saveEdit(row: { _id: string; name: string; active: boolean }) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    try {
      if (kind === "season") {
        await upsertSeason({ id: row._id as Id<"seasons">, name: trimmed });
      }
      if (kind === "competition") {
        await upsertCompetition({
          id: row._id as Id<"sportCompetitions">,
          name: trimmed,
        });
      }
      if (kind === "division") {
        await upsertDivision({
          id: row._id as Id<"sportDivisions">,
          name: trimmed,
        });
      }
      if (kind === "venue") {
        await upsertVenue({ id: row._id as Id<"venues">, name: trimmed });
      }
      setEditingId(null);
      setEditName("");
      toastSuccess(`${kind} updated.`);
    } catch (err) {
      toastFailure(err, `Could not update ${kind}.`);
    }
  }

  async function toggle(row: { _id: string; name: string; active: boolean }) {
    try {
      if (kind === "season") {
        await upsertSeason({
          id: row._id as Id<"seasons">,
          name: row.name,
          active: !row.active,
        });
      }
      if (kind === "competition") {
        await upsertCompetition({
          id: row._id as Id<"sportCompetitions">,
          name: row.name,
          active: !row.active,
        });
      }
      if (kind === "division") {
        await upsertDivision({
          id: row._id as Id<"sportDivisions">,
          name: row.name,
          active: !row.active,
        });
      }
      if (kind === "venue") {
        await upsertVenue({
          id: row._id as Id<"venues">,
          name: row.name,
          active: !row.active,
        });
      }
    } catch (err) {
      toastFailure(err, `Could not update ${kind}.`);
    }
  }

  return (
    <section className="rounded-md border border-hairline bg-surface overflow-hidden">
      <header className="border-b border-hairline px-4 py-2">
        <h3 className="text-body-strong text-ink-strong">{title}</h3>
      </header>
      <div className="divide-y divide-hairline">
        {rows.map((row) => (
          <div
            key={row._id}
            className="flex items-center justify-between gap-2 px-4 py-2"
          >
            {editingId === row._id ? (
              <form
                className="flex min-w-0 flex-1 gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEdit(row);
                }}
              >
                <Input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  autoFocus
                />
                <Button type="submit" size="sm" disabled={!editName.trim()}>
                  Save
                </Button>
              </form>
            ) : (
              <span className="min-w-0 flex-1 truncate text-body">
                {row.name}
              </span>
            )}
            <div className="flex shrink-0 gap-1">
              {editingId !== row._id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit(row)}
                >
                  Edit
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => toggle(row)}>
                {row.active ? "Hide" : "Restore"}
              </Button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-4 py-3 text-caption text-ink-quiet">No rows.</p>
        )}
      </div>
      <form onSubmit={add} className="flex gap-2 border-t border-hairline p-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`New ${kind}`}
        />
        <Button type="submit" disabled={!name.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </section>
  );
}
