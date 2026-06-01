import * as React from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { Building2, Plus } from "lucide-react";
import { api } from "../../../convex/_generated/api";
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
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { formatCurrency } from "@/lib/utils";
import { IMAGE_UPLOAD_ACCEPT, uploadImageFile } from "@/lib/uploads";

export default function SponsorsPage() {
  const { hasCapability } = useGatherHub();
  const canManageSponsors = hasCapability("sponsors.manage");
  const sponsors = useQuery(api.sponsors.list, {});
  const totalValue = useQuery(api.sponsors.totalValue, {});

  return (
    <div>
      <PageHeader
        title="Sponsors"
        description={
          totalValue !== undefined
            ? `Sponsors and partners. Total value ${formatCurrency(totalValue)}.`
            : "Sponsors and partners."
        }
        actions={canManageSponsors ? <NewSponsorDialog /> : undefined}
      />

      {sponsors === undefined ? (
        <LoadingState />
      ) : sponsors.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No sponsors yet"
          description="Add your first sponsor to track partnerships and value."
          action={canManageSponsors ? <NewSponsorDialog /> : undefined}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sponsors.map((s) => (
            <li key={s._id}>
              <Link
                to={`/sponsors/${s._id}`}
                className="group/sponsor block rounded-md border border-hairline bg-surface transition-colors duration-fast ease-out hover:bg-surface-sunk/50 focus-visible:outline-none focus-visible:shadow-focus"
              >
                <div className="flex items-center gap-3 px-4 py-3.5">
                  {s.logoUrl ? (
                    <img
                      src={s.logoUrl}
                      alt=""
                      className="h-10 w-10 rounded-xs object-contain bg-paper border border-hairline"
                    />
                  ) : (
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xs bg-surface-sunk border border-hairline"
                      aria-hidden="true"
                    >
                      <Building2 className="h-4 w-4 text-ink-quiet" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-body-strong text-ink-strong truncate group-hover/sponsor:text-primary">
                      {s.name}
                    </p>
                    <p className="text-caption text-ink-quiet" data-numeric>
                      {formatCurrency(s.sponsorshipValue)}
                    </p>
                  </div>
                  {s.visibleOnPublicSite && (
                    <Badge variant="success">Public</Badge>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewSponsorDialog() {
  const create = useMutation(api.sponsors.create);
  const update = useMutation(api.sponsors.update);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const completeUpload = useAction(api.files.completeUpload);
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [sponsorshipValue, setSponsorshipValue] = React.useState("");
  const [visibleOnPublicSite, setVisibleOnPublicSite] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setName("");
    setContactName("");
    setContactEmail("");
    setWebsite("");
    setSponsorshipValue("");
    setVisibleOnPublicSite(false);
    setNotes("");
    setLogoFile(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const valueNum = sponsorshipValue.trim()
        ? Number(sponsorshipValue)
        : undefined;
      const sponsorId = await create({
        name,
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        website: website.trim() || undefined,
        sponsorshipValue:
          valueNum !== undefined && !Number.isNaN(valueNum)
            ? valueNum
            : undefined,
        visibleOnPublicSite,
        notes: notes.trim() || undefined,
      });
      if (logoFile) {
        const logoUpload = await uploadImageFile(
          generateUploadUrl,
          completeUpload,
          logoFile,
          {
            ownerType: "sponsors",
            ownerId: sponsorId,
            purpose: "logo",
          },
        );
        await update({
          sponsorId,
          logoStorageId: logoUpload.storageId,
          logoFileName: logoUpload.fileName,
        });
      }
      reset();
      setOpen(false);
      toastSuccess("Sponsor created.");
    } catch (err) {
      setError(toastFailure(err, "Could not create sponsor."));
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
          New sponsor
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New sponsor</DialogTitle>
          <DialogDescription>
            Add a sponsor or partner organisation.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="sp-name">Name</Label>
            <Input
              id="sp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sp-contact">Contact name</Label>
              <Input
                id="sp-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sp-email">Contact email</Label>
              <Input
                id="sp-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sp-website">Website</Label>
            <Input
              id="sp-website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sp-value">Sponsorship value (AUD)</Label>
            <Input
              id="sp-value"
              type="number"
              min="0"
              value={sponsorshipValue}
              onChange={(e) => setSponsorshipValue(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sp-logo">Logo</Label>
            <Input
              id="sp-logo"
              type="file"
              accept={IMAGE_UPLOAD_ACCEPT}
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sp-notes">Notes</Label>
            <Textarea
              id="sp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-body text-ink-soft">
            <input
              type="checkbox"
              checked={visibleOnPublicSite}
              onChange={(e) => setVisibleOnPublicSite(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Show on public site
          </label>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? "Saving…" : "Create sponsor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
