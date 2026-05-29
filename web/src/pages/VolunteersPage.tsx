import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { AlertTriangle, Download, HandHeart, Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
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

  return (
    <div>
      <PageHeader
        title="Volunteers"
        description="People who help your club run, and their certifications."
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

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Expiring &amp; expired certifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {expiring === undefined ? (
            <LoadingState />
          ) : expiring.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No certifications are expiring soon.
            </p>
          ) : (
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
                      <TableCell className="font-medium">
                        {c.member ? (
                          `${c.member.firstName} ${c.member.lastName}`
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>{c.cert.name}</TableCell>
                      <TableCell>
                        <span
                          className={
                            expired ? "font-medium text-destructive" : undefined
                          }
                        >
                          {formatDate(c.cert.expiryDate)}
                          {expired ? " (expired)" : ""}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {volunteers === undefined ? (
        <LoadingState />
      ) : volunteers.length === 0 ? (
        <EmptyState
          icon={HandHeart}
          title="No volunteers yet"
          description="Flag members as volunteers or add a certification to get started."
          action={can("committee") ? <AddCertificationDialog /> : undefined}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead>Certifications</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {volunteers.map((v) => (
                <TableRow key={v.member._id}>
                  <TableCell className="font-medium">
                    {v.member.firstName} {v.member.lastName}
                  </TableCell>
                  <TableCell>
                    {(v.member.volunteerSkills ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(v.member.volunteerSkills ?? []).map((s) => (
                          <Badge key={s} variant="secondary">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {v.certifications.length}
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
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add certification</DialogTitle>
            <DialogDescription>
              Record a certification for a volunteer.
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
              <Label htmlFor="cert-name">Name</Label>
              <Input
                id="cert-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Working With Children Check"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cert-issuer">Issuer</Label>
              <Input
                id="cert-issuer"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cert-issued">Issued</Label>
                <Input
                  id="cert-issued"
                  type="date"
                  value={issuedDate}
                  onChange={(e) => setIssuedDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cert-expiry">Expiry</Label>
                <Input
                  id="cert-expiry"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
