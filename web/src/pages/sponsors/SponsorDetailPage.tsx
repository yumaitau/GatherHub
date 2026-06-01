import * as React from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Package, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
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
  PageHeader,
  LoadingState,
  AssetStatusBadge,
} from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { formatCurrency, formatDate } from "@/lib/utils";
import { UploadedImageViewer } from "@/components/uploaded-image-viewer";
import {
  IMAGE_UPLOAD_ACCEPT,
  uploadImageFile,
  type UploadedImage,
} from "@/lib/uploads";

type Sponsor = {
  _id: Id<"sponsors">;
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  sponsorshipValue?: number;
  startDate?: string;
  endDate?: string;
  visibleOnPublicSite: boolean;
  notes?: string;
};

export default function SponsorDetailPage() {
  const { sponsorId } = useParams<{ sponsorId: string }>();
  const { hasCapability } = useGatherHub();
  const canManageSponsors = hasCapability("sponsors.manage");
  const navigate = useNavigate();

  const data = useQuery(
    api.sponsors.get,
    sponsorId ? { sponsorId: sponsorId as Id<"sponsors"> } : "skip",
  );
  const update = useMutation(api.sponsors.update);
  const remove = useMutation(api.sponsors.remove);
  const [error, setError] = React.useState<string | null>(null);

  if (data === undefined) return <LoadingState />;

  const { sponsor, logoUrl, sponsoredAssets } = data;

  async function toggleVisible() {
    setError(null);
    try {
      await update({
        sponsorId: sponsor._id,
        visibleOnPublicSite: !sponsor.visibleOnPublicSite,
      });
      toastSuccess(
        sponsor.visibleOnPublicSite
          ? "Sponsor hidden from public site."
          : "Sponsor shown on public site.",
      );
    } catch (err) {
      setError(toastFailure(err, "Could not update sponsor visibility."));
    }
  }

  async function deleteSponsor() {
    if (!window.confirm(`Delete ${sponsor.name}?`)) return;
    setError(null);
    try {
      await remove({ sponsorId: sponsor._id });
      toastSuccess("Sponsor deleted.");
      navigate("/sponsors");
    } catch (err) {
      setError(toastFailure(err, "Could not delete sponsor."));
    }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2" asChild>
        <Link to="/sponsors">
          <ArrowLeft className="h-4 w-4" />
          Sponsors
        </Link>
      </Button>
      <PageHeader
        title={sponsor.name}
        description={formatCurrency(sponsor.sponsorshipValue)}
        actions={
          <>
            {canManageSponsors && (
              <>
                <EditSponsorDialog sponsor={sponsor} logoUrl={logoUrl} />
                <Button variant="outline" onClick={toggleVisible}>
                  {sponsor.visibleOnPublicSite
                    ? "Hide from public site"
                    : "Show on public site"}
                </Button>
              </>
            )}
            {canManageSponsors && (
              <Button variant="destructive" onClick={deleteSponsor}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </>
        }
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="grid gap-3">
              {logoUrl ? (
                <UploadedImageViewer
                  src={logoUrl}
                  alt={`${sponsor.name} logo`}
                  title={`${sponsor.name} logo`}
                  className="h-36 w-full"
                />
              ) : (
                <div className="flex h-36 w-full items-center justify-center rounded-sm border border-hairline bg-surface-sunk">
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div>
                {sponsor.visibleOnPublicSite && (
                  <Badge variant="success">Public</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Contact" value={sponsor.contactName} />
            <DetailRow label="Email" value={sponsor.contactEmail} />
            <DetailRow label="Phone" value={sponsor.contactPhone} />
            <DetailRow label="Website" value={sponsor.website} />
            <DetailRow
              label="Value"
              value={formatCurrency(sponsor.sponsorshipValue)}
            />
            <DetailRow label="Start" value={formatDate(sponsor.startDate)} />
            <DetailRow label="End" value={formatDate(sponsor.endDate)} />
            {sponsor.notes && (
              <div className="pt-2">
                <p className="font-medium">Notes</p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {sponsor.notes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sponsored assets ({sponsoredAssets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {sponsoredAssets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No assets are linked to this sponsor.
              </p>
            ) : (
              <ul className="divide-y">
                {sponsoredAssets.map((a) => (
                  <li
                    key={a._id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <Link
                      to={`/assets/${a._id}`}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      <Package className="h-4 w-4 text-muted-foreground" />
                      {a.name}
                    </Link>
                    <AssetStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value || "—"}</span>
    </div>
  );
}

function EditSponsorDialog({
  sponsor,
  logoUrl,
}: {
  sponsor: Sponsor;
  logoUrl: string | null;
}) {
  const update = useMutation(api.sponsors.update);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const completeUpload = useAction(api.files.completeUpload);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(sponsor.name);
  const [contactName, setContactName] = React.useState(
    sponsor.contactName ?? "",
  );
  const [contactEmail, setContactEmail] = React.useState(
    sponsor.contactEmail ?? "",
  );
  const [contactPhone, setContactPhone] = React.useState(
    sponsor.contactPhone ?? "",
  );
  const [website, setWebsite] = React.useState(sponsor.website ?? "");
  const [sponsorshipValue, setSponsorshipValue] = React.useState(
    sponsor.sponsorshipValue !== undefined
      ? String(sponsor.sponsorshipValue)
      : "",
  );
  const [notes, setNotes] = React.useState(sponsor.notes ?? "");
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function resetLogoState() {
    setLogoFile(null);
    setRemoveLogo(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      let logoUpload: UploadedImage | undefined;
      if (logoFile) {
        logoUpload = await uploadImageFile(
          generateUploadUrl,
          completeUpload,
          logoFile,
          {
            ownerType: "sponsors",
            ownerId: sponsor._id,
            purpose: "logo",
          },
        );
      }
      const valueNum = sponsorshipValue.trim()
        ? Number(sponsorshipValue)
        : undefined;
      await update({
        sponsorId: sponsor._id,
        name,
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        website: website.trim() || undefined,
        sponsorshipValue:
          valueNum !== undefined && !Number.isNaN(valueNum)
            ? valueNum
            : undefined,
        notes: notes.trim() || undefined,
        ...(logoUpload
          ? {
              logoStorageId: logoUpload.storageId,
              logoFileName: logoUpload.fileName,
            }
          : removeLogo
            ? { logoStorageId: null }
            : {}),
      });
      setOpen(false);
      resetLogoState();
      toastSuccess("Sponsor updated.");
    } catch (err) {
      setError(toastFailure(err, "Could not update sponsor."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetLogoState();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Edit sponsor</DialogTitle>
            <DialogDescription>Update sponsor details.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="esp-name">Name</Label>
              <Input
                id="esp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="esp-contact">Contact name</Label>
                <Input
                  id="esp-contact"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="esp-email">Contact email</Label>
                <Input
                  id="esp-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="esp-phone">Contact phone</Label>
              <Input
                id="esp-phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="esp-website">Website</Label>
              <Input
                id="esp-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="esp-value">Sponsorship value (AUD)</Label>
              <Input
                id="esp-value"
                type="number"
                min="0"
                value={sponsorshipValue}
                onChange={(e) => setSponsorshipValue(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="esp-notes">Notes</Label>
              <Textarea
                id="esp-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="esp-logo">Logo</Label>
              {logoUrl && !logoFile && (
                <UploadedImageViewer
                  src={logoUrl}
                  alt={`${sponsor.name} logo`}
                  title={`${sponsor.name} logo`}
                  className="h-20 w-32"
                />
              )}
              <Input
                id="esp-logo"
                type="file"
                accept={IMAGE_UPLOAD_ACCEPT}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setLogoFile(file);
                  if (file) setRemoveLogo(false);
                }}
              />
              {logoUrl && !logoFile && (
                <label className="flex items-center gap-2 text-body text-ink-soft">
                  <input
                    type="checkbox"
                    checked={removeLogo}
                    onChange={(e) => setRemoveLogo(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  Remove current logo
                </label>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
