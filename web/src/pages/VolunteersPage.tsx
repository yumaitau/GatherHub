import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { AlertTriangle, Download, HandHeart, Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatDate, toCsv, downloadCsv } from "@/lib/utils";

function isExpired(expiryDate: string | undefined): boolean {
  if (!expiryDate) return false;
  return expiryDate < new Date().toISOString().slice(0, 10);
}

export default function VolunteersPage() {
  const { can } = useGatherHub();
  const expiring = useQuery(api.volunteers.expiringCertifications, {});
  const volunteers = useQuery(api.volunteers.list, {});

  function exportCsv() {
    if (!volunteers) return;
    const rows = volunteers.map((v) => ({
      firstName: v.member.firstName,
      lastName: v.member.lastName,
      skills: (v.member.volunteerSkills ?? []).join("; "),
      certCount: v.certifications.length,
      email: v.member.email ?? "",
    }));
    const csv = toCsv(rows, [
      "firstName",
      "lastName",
      "skills",
      "certCount",
      "email",
    ]);
    downloadCsv("volunteers.csv", csv);
  }

  const hasExpiring = expiring && expiring.length > 0;

  return (
    <div>
      <PageHeader
        title="Volunteers"
        description="People who help run the club, and their certifications."
        actions={
          <>
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={!volunteers || volunteers.length === 0}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            {can("committee") && <AddCertificationDialog />}
          </>
        }
      />

      {hasExpiring && (
        <section
          className="mb-6 rounded-md border border-hairline bg-surface overflow-hidden"
          aria-label="Expiring and expired certifications"
        >
          <header className="flex items-center gap-2 px-4 py-2.5 border-b border-hairline bg-warning-wash/60">
            <AlertTriangle
              className="h-4 w-4 text-warning shrink-0"
              aria-hidden="true"
            />
            <h2 className="text-title text-ink-strong">
              Expiring &amp; expired certifications
            </h2>
            <span className="ml-auto text-caption text-ink-quiet">
              <span data-numeric className="font-medium text-ink-soft">
                {expiring.length}
              </span>{" "}
              flagged
            </span>
          </header>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Certification</TableHead>
                <TableHead>Expiry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expiring.map((c) => {
                const expired = isExpired(c.cert.expiryDate);
                return (
                  <TableRow key={c.cert._id}>
                    <TableCell className="font-semi text-ink">
                      {c.member ? (
                        `${c.member.firstName} ${c.member.lastName}`
                      ) : (
                        <span className="text-ink-quiet">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell className="text-ink-soft">
                      {c.cert.name}
                    </TableCell>
                    <TableCell>
                      {expired ? (
                        <Badge variant="destructive">
                          {formatDate(c.cert.expiryDate)} · expired
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          {formatDate(c.cert.expiryDate)}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}

      <section className="rounded-md border border-hairline bg-surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-hairline">
          <h2 className="text-title text-ink-strong">All volunteers</h2>
          {volunteers && (
            <span className="ml-auto text-caption text-ink-quiet">
              <span data-numeric className="font-medium text-ink-soft">
                {volunteers.length}
              </span>{" "}
              {volunteers.length === 1 ? "person" : "people"}
            </span>
          )}
        </div>
        {volunteers === undefined ? (
          <LoadingState />
        ) : volunteers.length === 0 ? (
          <EmptyState
            icon={HandHeart}
            title="No volunteers yet"
            description="Flag a member as a volunteer or record a certification to start tracking."
            action={can("committee") ? <AddCertificationDialog /> : undefined}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead numeric>Certifications</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {volunteers.map((v) => (
                <TableRow key={v.member._id}>
                  <TableCell className="font-semi text-ink-strong">
                    {v.member.firstName} {v.member.lastName}
                  </TableCell>
                  <TableCell>
                    {(v.member.volunteerSkills ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(v.member.volunteerSkills ?? []).map((s) => (
                          <Badge key={s} variant="muted">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-ink-quiet">—</span>
                    )}
                  </TableCell>
                  <TableCell numeric>{v.certifications.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function AddCertificationDialog() {
  const [open, setOpen] = React.useState(false);
  const add = useMutation(api.volunteers.addCertification);
  const members = useQuery(api.members.list, open ? {} : "skip");
  const [memberId, setMemberId] = React.useState<string>("");
  const [name, setName] = React.useState("");
  const [issuer, setIssuer] = React.useState("");
  const [issuedDate, setIssuedDate] = React.useState("");
  const [expiryDate, setExpiryDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setMemberId("");
    setName("");
    setIssuer("");
    setIssuedDate("");
    setExpiryDate("");
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
      await add({
        memberId: memberId as Id<"members">,
        name,
        issuer: issuer.trim() || undefined,
        issuedDate: issuedDate || undefined,
        expiryDate: expiryDate || undefined,
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
          Add certification
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add certification</DialogTitle>
          <DialogDescription>
            Record a certification for a volunteer.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Member</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a member" />
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
          <div className="grid gap-1.5">
            <Label htmlFor="cert-name">Name</Label>
            <Input
              id="cert-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Working With Children Check"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cert-issuer">Issuer</Label>
            <Input
              id="cert-issuer"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cert-issued">Issued</Label>
              <Input
                id="cert-issued"
                type="date"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cert-expiry">Expiry</Label>
              <Input
                id="cert-expiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
