import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Download,
  GraduationCap,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { DataTable } from "@/components/ui/data-table";
import { EmptyState, LoadingState, PageHeader } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { downloadCsv, formatDate, toCsv } from "@/lib/utils";
import { toastFailure, toastSuccess } from "@/lib/feedback";

type CertificationRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.certifications.list>>
>[number];

function fullName(member: CertificationRow["member"]): string {
  if (!member) return "Unknown";
  return `${member.firstName} ${member.lastName}`.trim();
}

function certificationStatus(expiryDate: string | undefined) {
  if (!expiryDate) return { label: "No expiry", variant: "muted" as const };
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 60 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (expiryDate < today) {
    return { label: "Expired", variant: "destructive" as const };
  }
  if (expiryDate <= horizon) {
    return { label: "Expiring", variant: "warning" as const };
  }
  return { label: "Current", variant: "success" as const };
}

export default function TrainingCertificationsPage() {
  const { can } = useGatherHub();
  const rows = useQuery(api.certifications.list, {});
  const expiring = useQuery(api.certifications.expiring, {});
  const remove = useMutation(api.certifications.remove);
  const canEdit = can("committee");
  const [error, setError] = React.useState<string | null>(null);

  const removeCertification = React.useCallback(
    async (row: CertificationRow) => {
      if (!confirm(`Remove ${row.cert.name} for ${fullName(row.member)}?`)) {
        return;
      }
      setError(null);
      try {
        await remove({ certId: row.cert._id });
        toastSuccess("Certification removed.");
      } catch (err) {
        setError(toastFailure(err, "Could not remove certification."));
      }
    },
    [remove],
  );

  function exportCsv() {
    if (!rows) return;
    const csv = toCsv(
      rows.map((row) => ({
        member: fullName(row.member),
        email: row.member?.email ?? "",
        certification: row.cert.name,
        issuer: row.cert.issuer ?? "",
        issuedDate: row.cert.issuedDate ?? "",
        expiryDate: row.cert.expiryDate ?? "",
        notes: row.cert.notes ?? "",
      })),
      [
        "member",
        "email",
        "certification",
        "issuer",
        "issuedDate",
        "expiryDate",
        "notes",
      ],
    );
    downloadCsv("training-certifications.csv", csv);
  }

  const columns = React.useMemo<ColumnDef<CertificationRow>[]>(
    () => [
      {
        id: "member",
        header: "Member",
        accessorFn: (row) => fullName(row.member),
        cell: ({ row }) => (
          <div>
            <p className="font-semi text-ink-strong">
              {fullName(row.original.member)}
            </p>
            {row.original.member?.email && (
              <p className="text-caption text-ink-quiet">
                {row.original.member.email}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "certification",
        header: "Certification",
        accessorFn: (row) => row.cert.name,
        cell: ({ row }) => (
          <div>
            <p className="font-semi text-ink">{row.original.cert.name}</p>
            {row.original.cert.issuer && (
              <p className="text-caption text-ink-quiet">
                {row.original.cert.issuer}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "issued",
        header: "Issued",
        accessorFn: (row) => row.cert.issuedDate ?? "",
        cell: ({ row }) => (
          <span className="text-ink-soft">
            {formatDate(row.original.cert.issuedDate)}
          </span>
        ),
      },
      {
        id: "expiry",
        header: "Expiry",
        accessorFn: (row) => row.cert.expiryDate ?? "",
        cell: ({ row }) => {
          const status = certificationStatus(row.original.cert.expiryDate);
          return (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-soft">
                {formatDate(row.original.cert.expiryDate)}
              </span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
          );
        },
      },
      ...(canEdit
        ? ([
            {
              id: "actions",
              header: "Actions",
              enableSorting: false,
              cell: ({ row }: { row: { original: CertificationRow } }) => (
                <div className="flex justify-end gap-1">
                  <CertificationDialog existing={row.original} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCertification(row.original)}
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              ),
              meta: { className: "text-right" },
            },
          ] as ColumnDef<CertificationRow>[])
        : []),
    ],
    [canEdit, removeCertification],
  );

  return (
    <div>
      <PageHeader
        title="Training & Certifications"
        description="Track checks, licences, qualifications, and training records across all members."
        actions={
          <>
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={!rows || rows.length === 0}
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            {canEdit && <CertificationDialog />}
          </>
        }
      />

      {error && <p className="mb-4 text-caption text-danger">{error}</p>}

      {expiring && expiring.length > 0 && (
        <section className="mb-6 rounded-md border border-hairline bg-surface overflow-hidden">
          <header className="flex items-center gap-2 px-4 py-2.5 border-b border-hairline bg-warning-wash/60">
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-warning"
              aria-hidden="true"
            />
            <h2 className="text-title text-ink-strong">Needs attention</h2>
            <span className="ml-auto text-caption text-ink-quiet">
              <span data-numeric>{expiring.length}</span> flagged
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
              {expiring.slice(0, 8).map((row) => {
                const status = certificationStatus(row.cert.expiryDate);
                return (
                  <TableRow key={row.cert._id}>
                    <TableCell className="font-semi text-ink-strong">
                      {fullName(row.member)}
                    </TableCell>
                    <TableCell>{row.cert.name}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>
                        {formatDate(row.cert.expiryDate)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}

      {rows === undefined ? (
        <LoadingState />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => String(row.cert._id)}
          searchPlaceholder="Search member, certification, issuer"
          emptyState={
            <EmptyState
              icon={GraduationCap}
              title="No training records"
              description="Add the first certification or training record for any member."
              action={canEdit ? <CertificationDialog /> : undefined}
            />
          }
        />
      )}
    </div>
  );
}

function CertificationDialog({ existing }: { existing?: CertificationRow }) {
  const create = useMutation(api.certifications.create);
  const update = useMutation(api.certifications.update);
  const members = useQuery(api.members.list, {});
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [memberId, setMemberId] = React.useState(
    existing ? String(existing.cert.memberId) : "",
  );
  const [name, setName] = React.useState(existing?.cert.name ?? "");
  const [issuer, setIssuer] = React.useState(existing?.cert.issuer ?? "");
  const [issuedDate, setIssuedDate] = React.useState(
    existing?.cert.issuedDate ?? "",
  );
  const [expiryDate, setExpiryDate] = React.useState(
    existing?.cert.expiryDate ?? "",
  );
  const [notes, setNotes] = React.useState(existing?.cert.notes ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setMemberId(existing ? String(existing.cert.memberId) : "");
    setName(existing?.cert.name ?? "");
    setIssuer(existing?.cert.issuer ?? "");
    setIssuedDate(existing?.cert.issuedDate ?? "");
    setExpiryDate(existing?.cert.expiryDate ?? "");
    setNotes(existing?.cert.notes ?? "");
    setError(null);
  }, [open, existing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId) {
      setError("Select a member.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (existing) {
        await update({
          certId: existing.cert._id,
          memberId: memberId as Id<"members">,
          name,
          issuer: issuer.trim() || null,
          issuedDate: issuedDate || null,
          expiryDate: expiryDate || null,
          notes: notes.trim() || null,
        });
      } else {
        await create({
          memberId: memberId as Id<"members">,
          name,
          issuer: issuer.trim() || undefined,
          issuedDate: issuedDate || undefined,
          expiryDate: expiryDate || undefined,
          notes: notes.trim() || undefined,
        });
      }
      setOpen(false);
      toastSuccess(
        existing ? "Certification updated." : "Certification added.",
      );
    } catch (err) {
      setError(toastFailure(err, "Could not save certification."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {existing ? (
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        ) : (
          <Button>
            <Plus className="h-4 w-4" /> New certification
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit certification" : "New certification"}
          </DialogTitle>
          <DialogDescription>
            Record training, licences, checks, or role qualifications.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Member</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a member" />
              </SelectTrigger>
              <SelectContent>
                {members === undefined ? (
                  <SelectItem value="loading" disabled>
                    Loading...
                  </SelectItem>
                ) : (
                  members.map((member) => (
                    <SelectItem key={member._id} value={member._id}>
                      {member.firstName} {member.lastName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tc-name">Name</Label>
            <Input
              id="tc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tc-issuer">Issuer</Label>
            <Input
              id="tc-issuer"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="tc-issued">Issued</Label>
              <Input
                id="tc-issued"
                type="date"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tc-expiry">Expiry</Label>
              <Input
                id="tc-expiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tc-notes">Notes</Label>
            <textarea
              id="tc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="min-h-20 rounded-sm border border-border bg-surface px-3 py-2 text-body text-ink outline-none transition-[border-color,box-shadow] duration-fast focus-visible:shadow-focus"
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : existing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
