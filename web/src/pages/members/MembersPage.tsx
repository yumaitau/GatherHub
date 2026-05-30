import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { Users, Plus, Download, Mail, X } from "lucide-react";
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
import { toCsv, downloadCsv, humanise, formatDateTime, cn } from "@/lib/utils";
import type { Role } from "@/lib/roles";

type StatusFilter = "all" | "active" | "inactive";

interface MemberRow {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  status: "active" | "inactive";
  isVolunteer: boolean;
  isLifetimeMember?: boolean;
  clubRole?: string;
}

export default function MembersPage() {
  const { can, org } = useGatherHub();
  const soccerMode = Boolean(org?.soccerMode);
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [lifetimeOnly, setLifetimeOnly] = React.useState(false);

  const members = useQuery(api.members.list, {
    status: status === "all" ? undefined : status,
    lifetimeOnly: lifetimeOnly || undefined,
  });

  const columns: ColumnDef<MemberRow>[] = React.useMemo(
    () => [
      {
        accessorFn: (m) => `${m.lastName}, ${m.firstName}`,
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <>
            <Link
              to={`/members/${row.original._id}`}
              className="font-semi text-ink-strong hover:text-primary"
            >
              {row.original.firstName} {row.original.lastName}
            </Link>
            {row.original.isLifetimeMember && (
              <Badge variant="accent" className="ml-2 align-middle">
                Lifetime
              </Badge>
            )}
          </>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            variant={row.original.status === "active" ? "success" : "muted"}
          >
            {row.original.status === "active" ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "role",
        accessorFn: (m) =>
          [m.clubRole, m.isVolunteer ? "volunteer" : ""]
            .filter(Boolean)
            .join(" "),
        header: "Role",
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            {row.original.clubRole && (
              <Badge variant="muted">{humanise(row.original.clubRole)}</Badge>
            )}
            {row.original.isVolunteer && (
              <Badge variant="accent">Volunteer</Badge>
            )}
            {!row.original.clubRole && !row.original.isVolunteer && (
              <span className="text-ink-quiet">—</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="text-ink-soft">{row.original.email ?? "—"}</span>
        ),
      },
    ],
    [],
  );

  function exportCsv() {
    if (!members) return;
    const rows = members.map((m) => ({
      firstName: m.firstName,
      lastName: m.lastName,
      status: m.status,
      volunteer: m.isVolunteer ? "yes" : "no",
      email: m.email ?? "",
      phone: m.phone ?? "",
    }));
    const csv = toCsv(rows, [
      "firstName",
      "lastName",
      "status",
      "volunteer",
      "email",
      "phone",
    ]);
    downloadCsv("members.csv", csv);
  }

  return (
    <div>
      <PageHeader
        title={`${soccerMode ? "Players" : "Members"} (${members?.length ?? 0})`}
        description="Everyone in your organisation."
        actions={
          <>
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={!members || members.length === 0}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            {can("admin") && <InviteUserDialog />}
            {can("coach") && <AddMemberDialog />}
          </>
        }
      />

      {can("admin") && <PendingInvitesPanel />}

      {members === undefined ? (
        <LoadingState />
      ) : (
        <DataTable<MemberRow>
          data={members as MemberRow[]}
          columns={columns}
          searchPlaceholder="Search by name, email, role"
          getRowId={(r) => r._id}
          emptyState={
            <EmptyState
              icon={Users}
              title="No members found"
              description={
                status !== "all"
                  ? "Try adjusting your filters."
                  : "Add your first member to get started."
              }
              action={can("coach") ? <AddMemberDialog /> : undefined}
            />
          }
          toolbar={
            <>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as StatusFilter)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <label className="inline-flex items-center gap-2 text-body text-ink-soft">
                <input
                  type="checkbox"
                  checked={lifetimeOnly}
                  onChange={(e) => setLifetimeOnly(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Lifetime only
              </label>
            </>
          }
        />
      )}
    </div>
  );
}

function AddMemberDialog() {
  const create = useMutation(api.members.create);
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [isVolunteer, setIsVolunteer] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setIsVolunteer(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await create({
        firstName,
        lastName,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        isVolunteer,
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
          Add member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>
            Create a new person record for your organisation.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-body text-ink-soft">
            <input
              type="checkbox"
              checked={isVolunteer}
              onChange={(e) => setIsVolunteer(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Volunteer
          </label>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? "Saving…" : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const INVITE_ROLES: Role[] = [
  "owner",
  "admin",
  "committee",
  "coach",
  "volunteer",
  "parent",
  "player",
];

function InviteUserDialog() {
  const send = useMutation(api.invitations.send);
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("player");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await send({ email: email.trim(), role });
      setEmail("");
      setRole("player");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Mail className="h-4 w-4" />
          Invite by email
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite someone by email</DialogTitle>
          <DialogDescription>
            They will receive a link to sign in or sign up and join this
            organisation with the chosen role.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              required
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {humanise(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={busy || !email.trim()}>
            {busy ? "Sending…" : "Send invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendingInvitesPanel() {
  const invites = useQuery(api.invitations.list);
  const revoke = useMutation(api.invitations.revoke);

  if (invites === undefined) return null;
  const pending = invites.filter((i) => i.status === "pending");
  if (pending.length === 0) return null;

  return (
    <section
      className={cn(
        "mb-5 rounded-md border border-hairline bg-surface overflow-hidden",
      )}
      aria-label="Pending invitations"
    >
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-hairline bg-surface-sunk/40">
        <h2 className="text-title text-ink-strong">Pending invitations</h2>
        <span className="text-caption text-ink-quiet">
          <span data-numeric>{pending.length}</span> open
        </span>
      </header>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pending.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="font-semi text-ink">{i.email}</TableCell>
              <TableCell>
                <Badge variant="muted">{humanise(i.role)}</Badge>
              </TableCell>
              <TableCell className="text-ink-quiet">
                <time>{formatDateTime(i.sentAt)}</time>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revoke({ invitationId: i.id })}
                >
                  <X className="h-4 w-4" />
                  Revoke
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
