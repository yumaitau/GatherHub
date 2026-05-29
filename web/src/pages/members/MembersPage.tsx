import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { Users, Plus, Download } from "lucide-react";
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
import { toCsv, downloadCsv } from "@/lib/utils";

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
        description="Everyone in your club."
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
            {can("coach") && <AddMemberDialog />}
          </>
        }
      />

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
              Create a new person record for your club.
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
