import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { ClipboardList, Download, Pencil } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { downloadCsv, toCsv } from "@/lib/utils";

export default function RegistrationsPage() {
  const { org, can } = useGatherHub();
  const rows = useQuery(api.soccer.playerListing, {});
  const competitions = useQuery(api.soccer.listCompetitions, {});
  const teams = useQuery(api.teams.list, {});
  const members = useQuery(api.members.list, { status: "active" });
  const ageGroups = useQuery(api.taxonomies.list, { kind: "team_age_group" });
  const canEdit = can("committee");

  if (!org?.soccerMode) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Soccer mode is off"
        description="Enable Soccer club mode in Settings to use registrations."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  function exportCsv() {
    if (!rows) return;
    const out = rows.map((r) => ({
      name: r.name,
      email: r.email ?? "",
      registered: r.registered ? "yes" : "no",
      paid: r.paid ? "yes" : "no",
      paymentPlan: r.paymentPlan ? "yes" : "no",
      ffaNumber: r.ffaNumber ?? "",
      gender: r.gender ?? "",
      team: r.teamName ?? "",
      division: r.divisionName ?? "",
      grade: r.grade != null ? r.grade.toFixed(1) : "",
      scored: `${r.scoredCount}/${r.totalSkills}`,
    }));
    downloadCsv(
      "player-registrations.csv",
      toCsv(out, [
        "name",
        "email",
        "registered",
        "paid",
        "paymentPlan",
        "ffaNumber",
        "gender",
        "team",
        "division",
        "grade",
        "scored",
      ]),
    );
  }

  return (
    <div>
      <PageHeader
        title={`Player Registrations (${rows?.length ?? 0})`}
        description="Track who's registered, paid, and assigned to a team or competition."
        actions={
          <>
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={!rows || rows.length === 0}
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            {canEdit && (
              <RegistrationDialog
                members={members ?? []}
                teams={teams ?? []}
                competitions={competitions ?? []}
                ageGroups={ageGroups ?? []}
              />
            )}
          </>
        }
      />

      {rows === undefined ? (
        <LoadingState />
      ) : (
        <DataTable
          data={rows}
          columns={
            [
              {
                accessorKey: "name",
                header: "Player",
                cell: ({ row }) => (
                  <>
                    <Link
                      to={`/members/${row.original.memberId}`}
                      className="font-semi text-ink-strong hover:text-primary"
                    >
                      {row.original.name}
                    </Link>
                    {row.original.email && (
                      <p className="text-caption text-ink-quiet truncate max-w-[24ch]">
                        {row.original.email}
                      </p>
                    )}
                  </>
                ),
              },
              {
                id: "status",
                accessorFn: (r) =>
                  !r.hasRegistration
                    ? "norego"
                    : r.registered && r.paid
                      ? "active"
                      : r.registered
                        ? r.paymentPlan
                          ? "plan"
                          : "unpaid"
                        : "pending",
                header: "Status",
                cell: ({ row }) =>
                  !row.original.hasRegistration ? (
                    <Badge variant="outline">No rego</Badge>
                  ) : row.original.registered && row.original.paid ? (
                    <Badge variant="success">Active</Badge>
                  ) : row.original.registered ? (
                    row.original.paymentPlan ? (
                      <Badge variant="warning">Plan</Badge>
                    ) : (
                      <Badge variant="destructive">Unpaid</Badge>
                    )
                  ) : (
                    <Badge variant="muted">Pending</Badge>
                  ),
              },
              {
                accessorKey: "ffaNumber",
                header: "FFA #",
                cell: ({ row }) => (
                  <span className="text-mono text-ink-soft">
                    {row.original.ffaNumber ?? "—"}
                  </span>
                ),
              },
              {
                accessorKey: "teamName",
                header: "Team",
                cell: ({ row }) => (
                  <span className="text-ink-soft">
                    {row.original.teamName ?? "—"}
                  </span>
                ),
              },
              {
                accessorKey: "divisionName",
                header: "Division",
                cell: ({ row }) =>
                  row.original.divisionName ? (
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block h-3 w-3 rounded-xs"
                        style={{
                          background:
                            row.original.divisionColor ?? "transparent",
                        }}
                      />
                      {row.original.divisionName}
                    </span>
                  ) : (
                    <span className="text-ink-quiet">—</span>
                  ),
              },
              {
                accessorFn: (r) => r.grade ?? -1,
                id: "grade",
                header: "Grade",
                meta: { numeric: true },
                cell: ({ row }) =>
                  row.original.grade != null
                    ? row.original.grade.toFixed(1)
                    : "—",
              },
              {
                accessorFn: (r) => r.scoredCount,
                id: "progress",
                header: "Skills",
                cell: ({ row }) => (
                  <Link
                    to={`/soccer/grading/${row.original.memberId}`}
                    className="text-ink-soft hover:text-primary"
                  >
                    <span data-numeric>{row.original.scoredCount}</span>
                    {" / "}
                    <span data-numeric>{row.original.totalSkills}</span>
                  </Link>
                ),
              },
              ...(canEdit
                ? ([
                    {
                      id: "actions",
                      header: "",
                      enableSorting: false,
                      cell: ({
                        row,
                      }: {
                        row: { original: (typeof rows)[number] };
                      }) => (
                        <RegistrationDialog
                          row={row.original}
                          members={members ?? []}
                          teams={teams ?? []}
                          competitions={competitions ?? []}
                          ageGroups={ageGroups ?? []}
                        />
                      ),
                    },
                  ] as ColumnDef<(typeof rows)[number]>[])
                : []),
            ] as ColumnDef<(typeof rows)[number]>[]
          }
          getRowId={(r) => String(r.memberId)}
          searchPlaceholder="Search player, email, team, division, FFA"
          emptyState={
            <EmptyState
              icon={ClipboardList}
              title="No players yet"
              description="Add members to your club to start tracking registrations."
            />
          }
        />
      )}
    </div>
  );
}

type MemberOpt = { _id: Id<"members">; firstName: string; lastName: string };
type TeamOpt = { _id: Id<"teams">; name: string };
type CompOpt = { _id: Id<"soccerCompetitions">; name: string };
type AgeGroupOpt = { key: string; label: string };

interface RegistrationDialogRow {
  memberId: Id<"members">;
  name: string;
  hasRegistration: boolean;
  competitionId: Id<"soccerCompetitions"> | null;
  teamId: Id<"teams"> | null;
  ffaNumber: string | null;
  gender: string | null;
  schoolName: string | null;
  registered: boolean;
  paid: boolean;
  paymentPlan: boolean;
  paymentPlanStart: string | null;
  paymentPlanEnd: string | null;
  comments: string | null;
  ageGroupKey: string | null;
}

function RegistrationDialog({
  row,
  members,
  teams,
  competitions,
  ageGroups,
}: {
  row?: RegistrationDialogRow;
  members: MemberOpt[];
  teams: TeamOpt[];
  competitions: CompOpt[];
  ageGroups: AgeGroupOpt[];
}) {
  const upsert = useMutation(api.soccer.upsertRegistration);
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const lockedMember = Boolean(row);
  const [memberId, setMemberId] = React.useState<string>(
    row ? String(row.memberId) : "",
  );
  const [teamId, setTeamId] = React.useState<string>(
    row?.teamId ? String(row.teamId) : "",
  );
  const [compId, setCompId] = React.useState<string>(
    row?.competitionId ? String(row.competitionId) : "",
  );
  const [ageGroupKey, setAgeGroupKey] = React.useState<string>(
    row?.ageGroupKey ?? "",
  );
  const [ffaNumber, setFfaNumber] = React.useState(row?.ffaNumber ?? "");
  const [gender, setGender] = React.useState(row?.gender ?? "");
  const [schoolName, setSchoolName] = React.useState(row?.schoolName ?? "");
  const [registered, setRegistered] = React.useState(row?.registered ?? false);
  const [paid, setPaid] = React.useState(row?.paid ?? false);
  const [paymentPlan, setPaymentPlan] = React.useState(
    row?.paymentPlan ?? false,
  );
  const [planStart, setPlanStart] = React.useState(row?.paymentPlanStart ?? "");
  const [planEnd, setPlanEnd] = React.useState(row?.paymentPlanEnd ?? "");
  const [comments, setComments] = React.useState(row?.comments ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId) {
      setError("Pick a member.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await upsert({
        memberId: memberId as Id<"members">,
        competitionId: compId
          ? (compId as Id<"soccerCompetitions">)
          : undefined,
        ageGroupKey: ageGroupKey || undefined,
        teamId: teamId ? (teamId as Id<"teams">) : undefined,
        ffaNumber: ffaNumber || undefined,
        gender: gender || undefined,
        schoolName: schoolName || undefined,
        registered,
        paid,
        paymentPlan,
        paymentPlanStart: planStart || undefined,
        paymentPlanEnd: planEnd || undefined,
        comments: comments || undefined,
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
        {row ? (
          <Button
            variant={row.hasRegistration ? "ghost" : "outline"}
            size="sm"
            title={row.hasRegistration ? "Edit registration" : "Register"}
          >
            <Pencil className="h-4 w-4" />
            {row.hasRegistration ? "Edit" : "Register"}
          </Button>
        ) : (
          <Button>New registration</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {row?.hasRegistration
              ? `Edit registration · ${row.name}`
              : row
                ? `Register ${row.name}`
                : "New registration"}
          </DialogTitle>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-3">
          {!lockedMember && (
            <div className="grid gap-1.5">
              <Label>Member</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m._id} value={m._id}>
                      {m.firstName} {m.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Competition</Label>
              <Select
                value={compId || "__none__"}
                onValueChange={(v) => setCompId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {competitions.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Team</Label>
              <Select
                value={teamId || "__none__"}
                onValueChange={(v) => setTeamId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Age group</Label>
            <Select
              value={ageGroupKey || "__none__"}
              onValueChange={(v) => setAgeGroupKey(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {ageGroups.map((a) => (
                  <SelectItem key={a.key} value={a.key}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rg-ffa">FFA number</Label>
              <Input
                id="rg-ffa"
                value={ffaNumber}
                onChange={(e) => setFfaNumber(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Gender</Label>
              <Select
                value={gender || "__none__"}
                onValueChange={(v) => setGender(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Does not wish to specify">
                    Does not wish to specify
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rg-school">School</Label>
            <Input
              id="rg-school"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-4 py-1">
            <label className="inline-flex items-center gap-2 text-body text-ink-soft">
              <input
                type="checkbox"
                checked={registered}
                onChange={(e) => setRegistered(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Registered
            </label>
            <label className="inline-flex items-center gap-2 text-body text-ink-soft">
              <input
                type="checkbox"
                checked={paid}
                onChange={(e) => setPaid(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Paid in full
            </label>
            <label className="inline-flex items-center gap-2 text-body text-ink-soft">
              <input
                type="checkbox"
                checked={paymentPlan}
                onChange={(e) => setPaymentPlan(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Payment plan
            </label>
          </div>
          {paymentPlan && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="rg-pls">Plan start</Label>
                <Input
                  id="rg-pls"
                  type="date"
                  value={planStart}
                  onChange={(e) => setPlanStart(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rg-ple">Plan end</Label>
                <Input
                  id="rg-ple"
                  type="date"
                  value={planEnd}
                  onChange={(e) => setPlanEnd(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="rg-cmt">Comments</Label>
            <Input
              id="rg-cmt"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? "Saving…" : row?.hasRegistration ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
