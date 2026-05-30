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
import { downloadCsv, formatDateTime, toCsv } from "@/lib/utils";

export default function RegistrationsPage() {
  const { org, can } = useGatherHub();
  const rows = useQuery(api.soccer.listRegistrations, {});
  const competitions = useQuery(api.soccer.listCompetitions, {});
  const teams = useQuery(api.teams.list, {});
  const members = useQuery(api.members.list, { status: "active" });
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
      name: r.memberName,
      email: r.memberEmail ?? "",
      registered: r.registered ? "yes" : "no",
      paid: r.paid ? "yes" : "no",
      paymentPlan: r.paymentPlan ? "yes" : "no",
      ffaNumber: r.ffaNumber ?? "",
      gender: r.gender ?? "",
      team: r.teamName ?? "",
      division: r.divisionName ?? "",
    }));
    downloadCsv(
      "registrations.csv",
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
                accessorKey: "memberName",
                header: "Member",
                cell: ({ row }) => (
                  <>
                    <Link
                      to={`/members/${row.original.memberId}`}
                      className="font-semi text-ink-strong hover:text-primary"
                    >
                      {row.original.memberName}
                    </Link>
                    {row.original.memberEmail && (
                      <p className="text-caption text-ink-quiet">
                        {row.original.memberEmail}
                      </p>
                    )}
                  </>
                ),
              },
              {
                accessorKey: "registered",
                header: "Registered",
                cell: ({ row }) => (
                  <>
                    {row.original.registered ? (
                      <Badge variant="success">Registered</Badge>
                    ) : (
                      <Badge variant="muted">Pending</Badge>
                    )}
                    {row.original.registered && row.original.registeredAt && (
                      <p className="text-caption text-ink-quiet">
                        {formatDateTime(row.original.registeredAt)}
                      </p>
                    )}
                  </>
                ),
              },
              {
                accessorKey: "paid",
                header: "Paid",
                cell: ({ row }) =>
                  row.original.paid ? (
                    <Badge variant="success">Paid</Badge>
                  ) : row.original.paymentPlan ? (
                    <Badge variant="warning">Plan</Badge>
                  ) : (
                    <Badge variant="destructive">Unpaid</Badge>
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
                cell: ({ row }) => (
                  <span className="text-ink-soft">
                    {row.original.divisionName ?? "—"}
                  </span>
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
                          existing={row.original}
                          members={members ?? []}
                          teams={teams ?? []}
                          competitions={competitions ?? []}
                        />
                      ),
                    },
                  ] as ColumnDef<(typeof rows)[number]>[])
                : []),
            ] as ColumnDef<(typeof rows)[number]>[]
          }
          getRowId={(r) => r._id}
          searchPlaceholder="Search member, email, team, division, FFA"
          emptyState={
            <EmptyState
              icon={ClipboardList}
              title="No registrations yet"
              description="Add a registration for a member to track their status."
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

interface ExistingReg {
  memberId: Id<"members">;
  competitionId?: Id<"soccerCompetitions">;
  teamId?: Id<"teams">;
  ffaNumber?: string;
  gender?: string;
  schoolName?: string;
  registered: boolean;
  paid: boolean;
  paymentPlan?: boolean;
  paymentPlanStart?: string;
  paymentPlanEnd?: string;
  comments?: string;
}

function RegistrationDialog({
  existing,
  members,
  teams,
  competitions,
}: {
  existing?: ExistingReg;
  members: MemberOpt[];
  teams: TeamOpt[];
  competitions: CompOpt[];
}) {
  const upsert = useMutation(api.soccer.upsertRegistration);
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [memberId, setMemberId] = React.useState<string>(
    existing?.memberId ?? "",
  );
  const [teamId, setTeamId] = React.useState<string>(existing?.teamId ?? "");
  const [compId, setCompId] = React.useState<string>(
    existing?.competitionId ?? "",
  );
  const [ffaNumber, setFfaNumber] = React.useState(existing?.ffaNumber ?? "");
  const [gender, setGender] = React.useState(existing?.gender ?? "");
  const [schoolName, setSchoolName] = React.useState(
    existing?.schoolName ?? "",
  );
  const [registered, setRegistered] = React.useState(
    existing?.registered ?? false,
  );
  const [paid, setPaid] = React.useState(existing?.paid ?? false);
  const [paymentPlan, setPaymentPlan] = React.useState(
    existing?.paymentPlan ?? false,
  );
  const [planStart, setPlanStart] = React.useState(
    existing?.paymentPlanStart ?? "",
  );
  const [planEnd, setPlanEnd] = React.useState(existing?.paymentPlanEnd ?? "");
  const [comments, setComments] = React.useState(existing?.comments ?? "");
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
        {existing ? (
          <Button variant="ghost" size="icon" title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>New registration</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit registration" : "New registration"}
          </DialogTitle>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-3">
          {!existing && (
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
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="unspecified">Unspecified</SelectItem>
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
            {saving ? "Saving…" : existing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
