import * as React from "react";
import { useQuery, useMutation } from "convex/react";
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
import { formatCurrency, formatDate } from "@/lib/utils";

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
  const { can } = useGatherHub();
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
    } catch (err) {
      setError(String(err));
    }
  }

  async function deleteSponsor() {
    if (!window.confirm(`Delete ${sponsor.name}?`)) return;
    setError(null);
    try {
      await remove({ sponsorId: sponsor._id });
      navigate("/sponsors");
    } catch (err) {
      setError(String(err));
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
            {can("committee") && (
              <>
                <EditSponsorDialog sponsor={sponsor} />
                <Button variant="outline" onClick={toggleVisible}>
                  {sponsor.visibleOnPublicSite
                    ? "Hide from public site"
                    : "Show on public site"}
                </Button>
              </>
            )}
            {can("admin") && (
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
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${sponsor.name} logo`}
                  className="h-16 w-16 rounded object-contain"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded bg-muted">
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              {sponsor.visibleOnPublicSite && (
                <Badge variant="success">Public</Badge>
              )}
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

function EditSponsorDialog({ sponsor }: { sponsor: Sponsor }) {
  const update = useMutation(api.sponsors.update);
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
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
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
      });
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
