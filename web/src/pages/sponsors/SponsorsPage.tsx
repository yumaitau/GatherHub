import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { Building2, Plus } from "lucide-react";
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
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { formatCurrency } from "@/lib/utils";

export default function SponsorsPage() {
  const { can } = useGatherHub();
  const sponsors = useQuery(api.sponsors.list, {});
  const totalValue = useQuery(api.sponsors.totalValue, {});

  return (
    <div>
      <PageHeader
        title="Sponsors"
        description={
          totalValue !== undefined
            ? `Total sponsorship value: ${formatCurrency(totalValue)}`
            : "Your organisation's sponsors and partners."
        }
        actions={can("committee") ? <NewSponsorDialog /> : undefined}
      />

      {sponsors === undefined ? (
        <LoadingState />
      ) : sponsors.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No sponsors yet"
          description="Add your first sponsor to track partnerships and value."
          action={can("committee") ? <NewSponsorDialog /> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sponsors.map((s) => (
            <Link key={s._id} to={`/sponsors/${s._id}`}>
              <Card className="h-full transition-colors hover:bg-accent/40">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    {s.logoUrl ? (
                      <img
                        src={s.logoUrl}
                        alt={`${s.name} logo`}
                        className="h-12 w-12 rounded object-contain"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
                        <Building2 className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <CardTitle>{s.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {formatCurrency(s.sponsorshipValue)}
                  </span>
                  {s.visibleOnPublicSite && (
                    <Badge variant="success">Public</Badge>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewSponsorDialog() {
  const create = useMutation(api.sponsors.create);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
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
      let logoStorageId: Id<"_storage"> | undefined;
      if (logoFile) {
        const url = await generateUploadUrl();
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": logoFile.type },
          body: logoFile,
        });
        if (!res.ok) throw new Error("Logo upload failed.");
        const json = (await res.json()) as { storageId: Id<"_storage"> };
        logoStorageId = json.storageId;
      }
      const valueNum = sponsorshipValue.trim()
        ? Number(sponsorshipValue)
        : undefined;
      await create({
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
        logoStorageId,
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
          New sponsor
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New sponsor</DialogTitle>
            <DialogDescription>
              Add a sponsor or partner organisation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="sp-name">Name</Label>
              <Input
                id="sp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sp-contact">Contact name</Label>
                <Input
                  id="sp-contact"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sp-email">Contact email</Label>
                <Input
                  id="sp-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sp-website">Website</Label>
              <Input
                id="sp-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sp-value">Sponsorship value (AUD)</Label>
              <Input
                id="sp-value"
                type="number"
                min="0"
                value={sponsorshipValue}
                onChange={(e) => setSponsorshipValue(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sp-logo">Logo</Label>
              <Input
                id="sp-logo"
                type="file"
                accept="image/*"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sp-notes">Notes</Label>
              <Textarea
                id="sp-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={visibleOnPublicSite}
                onChange={(e) => setVisibleOnPublicSite(e.target.checked)}
                className="h-4 w-4"
              />
              Show on public site
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create sponsor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
