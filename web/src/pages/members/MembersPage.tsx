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
import { toCsv, downloadCsv, humanise, formatDateTime } from "@/lib/utils";
import type { Role } from "@/lib/roles";

type StatusFilter = "all" | "active" | "inactive";

export default function MembersPage() {
  const { can } = useGatherHub();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");

  const members = useQuery(api.members.list, {
    search: search.trim() || undefined,
    status: status === "all" ? undefined : status,
  });

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
        title="Members"
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

      {can("admin") && <PendingInvitesCard />}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
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
      </div>

      {members === undefined ? (
        <LoadingState />
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members found"
          description={
            search || status !== "all"
              ? "Try adjusting your search or filters."
              : "Add your first member to get started."
          }
          action={can("coach") ? <AddMemberDialog /> : undefined}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Volunteer</TableHead>
                <TableHead>Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m._id}>
                  <TableCell className="font-medium">
                    <Link to={`/members/${m._id}`} className="hover:underline">
                      {m.firstName} {m.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={m.status === "active" ? "success" : "muted"}
                    >
                      {m.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {m.isVolunteer ? (
                      <Badge variant="secondary">Volunteer</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.email ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function AddMemberDialog() {
  const create = useMutation(api.members.create);
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
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>
              Create a new person record for your organisation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={isVolunteer}
                onChange={(e) => setIsVolunteer(e.target.checked)}
                className="h-4 w-4"
              />
              Volunteer
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Add member"}
            </Button>
          </DialogFooter>
        </form>
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
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Invite someone by email</DialogTitle>
            <DialogDescription>
              They&apos;ll receive a link to sign in (or sign up) and join this
              organisation with the chosen role.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
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
            <div className="grid gap-2">
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
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PendingInvitesCard() {
  const invites = useQuery(api.invitations.list);
  const revoke = useMutation(api.invitations.revoke);

  if (invites === undefined) return null;
  const pending = invites.filter((i) => i.status === "pending");
  if (pending.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border bg-background">
      <div className="border-b px-4 py-2 text-sm font-medium">
        Pending invitations
      </div>
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
              <TableCell>{i.email}</TableCell>
              <TableCell>
                <Badge variant="secondary">{humanise(i.role)}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(i.sentAt)}
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
    </div>
  );
}
