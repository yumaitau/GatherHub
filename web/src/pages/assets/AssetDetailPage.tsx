import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  ArrowLeft,
  LogOut,
  LogIn,
  ArrowRightLeft,
  AlertTriangle,
  Wrench,
  Archive,
  Printer,
  Nfc,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { AuditRow } from "@/components/ui/audit-row";
import { EmptyState as PrimitiveEmpty } from "@/components/ui/empty-state";
import { PageHeader, LoadingState, AssetStatusBadge } from "@/components/shared";
import { QrCode, assetTagUrl } from "@/components/QrCode";
import { useGatherHub } from "@/lib/gatherhub";
import { canManageAssets } from "@/lib/roles";
import {
  humanise,
  formatCurrency,
  formatDateTime,
  formatDate,
} from "@/lib/utils";

export default function AssetDetailPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const id = assetId as Id<"assets">;
  const { role } = useGatherHub();
  const data = useQuery(api.assets.get, { assetId: id });
  const history = useQuery(api.assets.history, { assetId: id });
  const canManage = role ? canManageAssets(role) : false;

  if (data === undefined) return <LoadingState />;
  const { asset, custodian, sponsor } = data;

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link to="/assets">
          <ArrowLeft className="h-4 w-4" /> KitTrace
        </Link>
      </Button>

      <PageHeader
        title={asset.name}
        description={`${humanise(asset.category)} · ${humanise(asset.condition)} condition`}
        actions={<AssetStatusBadge status={asset.status} />}
      />

      {canManage && asset.status !== "retired" && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {(asset.status === "available" || asset.status === "maintenance") && (
            <CheckOutDialog assetId={id} />
          )}
          {(asset.status === "checked_out" || asset.status === "in_use") && (
            <>
              <SimpleOpButton
                assetId={id}
                op="checkIn"
                label="Check in"
                icon={LogIn}
              />
              <TransferDialog assetId={id} />
            </>
          )}
          <SimpleOpButton
            assetId={id}
            op="reportLost"
            label="Report lost"
            icon={AlertTriangle}
            variant="outline"
            withNotes
          />
          <SimpleOpButton
            assetId={id}
            op="setMaintenance"
            label="Maintenance"
            icon={Wrench}
            variant="outline"
            withNotes
          />
          <SimpleOpButton
            assetId={id}
            op="retire"
            label="Retire"
            icon={Archive}
            variant="outline"
            withNotes
          />
        </div>
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="qr">QR / NFC</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <section className="rounded-md border border-hairline bg-surface">
            <dl className="grid gap-x-8 gap-y-5 px-5 py-5 sm:grid-cols-2">
              <Field label="Status" value={humanise(asset.status)} />
              <Field label="Category" value={humanise(asset.category)} />
              <Field
                label="Custodian"
                value={
                  custodian
                    ? `${custodian.firstName} ${custodian.lastName}`
                    : "—"
                }
              />
              <Field label="Location" value={asset.location ?? "—"} />
              <Field
                label="Replacement value"
                value={formatCurrency(asset.replacementValue)}
                numeric
              />
              <Field
                label="Serial number"
                value={asset.serialNumber ?? "—"}
                mono
              />
              <Field
                label="Purchase date"
                value={
                  asset.purchaseDate ? formatDate(asset.purchaseDate) : "—"
                }
              />
              <Field
                label="Due back"
                value={asset.dueBack ? formatDateTime(asset.dueBack) : "—"}
              />
              <Field
                label="Sponsor"
                value={
                  sponsor ? (
                    <Link
                      to={`/sponsors/${sponsor._id}`}
                      className="text-ink hover:text-primary font-semi"
                    >
                      {sponsor.name}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Field
                label="Notes"
                value={asset.notes ?? "—"}
                wide
              />
            </dl>
          </section>
        </TabsContent>

        <TabsContent value="qr">
          <section className="rounded-md border border-hairline bg-surface">
            <header className="px-5 py-3 border-b border-hairline">
              <h2 className="text-title text-ink-strong">QR code</h2>
            </header>
            <div className="px-5 py-5 space-y-5">
              {asset.qrTagId ? (
                <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
                  <div className="rounded-md border border-hairline bg-paper p-4">
                    <QrCode value={assetTagUrl(asset.qrTagId)} />
                  </div>
                  <div className="space-y-2 text-body min-w-0">
                    <div>
                      <span className="text-ink-quiet text-caption">
                        Tag id
                      </span>
                      <code className="block text-mono text-ink">
                        {asset.qrTagId}
                      </code>
                    </div>
                    <div>
                      <span className="text-ink-quiet text-caption">
                        Lookup URL
                      </span>
                      <p className="text-mono text-ink break-all">
                        {assetTagUrl(asset.qrTagId)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.print()}
                    >
                      <Printer className="h-4 w-4" /> Print
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-body text-ink-quiet">
                  No QR tag assigned.
                </p>
              )}

              <div className="pt-5 border-t border-hairline">
                <p className="text-label text-ink-quiet mb-2">NFC tag</p>
                {asset.nfcTagId ? (
                  <p className="text-body text-ink">
                    Registered:{" "}
                    <code className="text-mono">{asset.nfcTagId}</code>
                  </p>
                ) : (
                  <p className="text-body text-ink-quiet">
                    No NFC tag registered.
                  </p>
                )}
                {canManage && (
                  <div className="mt-3">
                    <RegisterNfcDialog assetId={id} />
                  </div>
                )}
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="history">
          <section className="rounded-md border border-hairline bg-surface">
            <header className="px-5 py-3 border-b border-hairline">
              <h2 className="text-title text-ink-strong">Audit history</h2>
            </header>
            {history === undefined ? (
              <LoadingState />
            ) : history.length === 0 ? (
              <PrimitiveEmpty
                title="No history yet."
                description="Every issue, return, transfer, and status change will appear here."
              />
            ) : (
              <div role="list" aria-label="Audit history">
                {history.map((h) => (
                  <AuditRow
                    key={h._id}
                    timestamp={formatDateTime(h.performedAt)}
                    actor={
                      <span className="font-semi text-ink">
                        {h.performerName}
                      </span>
                    }
                    action={
                      <span>
                        <span className="font-semi text-ink">
                          {humanise(h.action)}
                        </span>
                        {h.fromStatus && h.toStatus && (
                          <span className="text-ink-quiet">
                            {" "}
                            · {humanise(h.fromStatus)} → {humanise(h.toStatus)}
                          </span>
                        )}
                        {h.toCustodianName && (
                          <span className="text-ink-quiet">
                            {" "}
                            · to {h.toCustodianName}
                          </span>
                        )}
                        {h.toLocation && (
                          <span className="text-ink-quiet">
                            {" "}
                            · @ {h.toLocation}
                          </span>
                        )}
                      </span>
                    }
                    expandable={Boolean(h.notes)}
                  >
                    {h.notes && (
                      <span className="text-body text-ink-soft italic">
                        {h.notes}
                      </span>
                    )}
                  </AuditRow>
                ))}
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  value,
  numeric,
  mono,
  wide,
}: {
  label: string;
  value: React.ReactNode;
  numeric?: boolean;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-label text-ink-quiet mb-1">{label}</dt>
      <dd
        className={[
          "text-body text-ink",
          numeric ? "tabular-nums font-medium" : "",
          mono ? "text-mono text-ink" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function useMembers() {
  return useQuery(api.members.list, { status: "active" });
}

function CheckOutDialog({ assetId }: { assetId: Id<"assets"> }) {
  const checkOut = useMutation(api.assetOps.checkOut);
  const members = useMembers();
  const [open, setOpen] = React.useState(false);
  const [memberId, setMemberId] = React.useState<string>("");
  const [location, setLocation] = React.useState("");
  const [dueBack, setDueBack] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await checkOut({
        assetId,
        custodianMemberId: memberId as Id<"members">,
        location: location || undefined,
        dueBack: dueBack ? Date.parse(dueBack) : undefined,
        notes: notes || undefined,
      });
      setOpen(false);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <LogOut className="h-4 w-4" /> Check out
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check out asset</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Custodian</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Select member" />
              </SelectTrigger>
              <SelectContent>
                {(members ?? []).map((m) => (
                  <SelectItem key={m._id} value={m._id}>
                    {m.firstName} {m.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-loc">Location</Label>
            <Input
              id="co-loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-due">Due back</Label>
            <Input
              id="co-due"
              type="date"
              value={dueBack}
              onChange={(e) => setDueBack(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-notes">Notes</Label>
            <Textarea
              id="co-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={!memberId}>
            Check out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ assetId }: { assetId: Id<"assets"> }) {
  const transfer = useMutation(api.assetOps.transfer);
  const members = useMembers();
  const [open, setOpen] = React.useState(false);
  const [memberId, setMemberId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await transfer({
        assetId,
        toCustodianMemberId: memberId as Id<"members">,
        notes: notes || undefined,
      });
      setOpen(false);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ArrowRightLeft className="h-4 w-4" /> Transfer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer asset</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>New custodian</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Select member" />
              </SelectTrigger>
              <SelectContent>
                {(members ?? []).map((m) => (
                  <SelectItem key={m._id} value={m._id}>
                    {m.firstName} {m.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tr-notes">Notes</Label>
            <Textarea
              id="tr-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={!memberId}>
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type OpName = "checkIn" | "reportLost" | "setMaintenance" | "retire";

function SimpleOpButton({
  assetId,
  op,
  label,
  icon: Icon,
  variant = "default",
  withNotes = false,
}: {
  assetId: Id<"assets">;
  op: OpName;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "outline";
  withNotes?: boolean;
}) {
  const checkIn = useMutation(api.assetOps.checkIn);
  const reportLost = useMutation(api.assetOps.reportLost);
  const setMaintenance = useMutation(api.assetOps.setMaintenance);
  const retire = useMutation(api.assetOps.retire);
  const [open, setOpen] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const run = async () => {
    setError(null);
    try {
      const args = { assetId, notes: notes || undefined };
      if (op === "checkIn") await checkIn(args);
      else if (op === "reportLost") await reportLost(args);
      else if (op === "setMaintenance") await setMaintenance(args);
      else await retire(args);
      setOpen(false);
    } catch (e) {
      setError(String(e));
    }
  };

  if (!withNotes) {
    return (
      <Button variant={variant} onClick={run}>
        <Icon className="h-4 w-4" /> {label}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Icon className="h-4 w-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="op-notes">Notes (optional)</Label>
            <Textarea
              id="op-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={run}>{label}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegisterNfcDialog({ assetId }: { assetId: Id<"assets"> }) {
  const register = useMutation(api.assets.registerNfc);
  const [open, setOpen] = React.useState(false);
  const [nfc, setNfc] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await register({ assetId, nfcTagId: nfc });
      setOpen(false);
      setNfc("");
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Nfc className="h-4 w-4" /> Register NFC tag
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register NFC tag</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-body text-ink-soft">
            Enter the NFC tag id (the iOS app writes the opaque tag id when
            scanning a blank tag). No private data is stored on the tag.
          </p>
          <Input
            value={nfc}
            placeholder="tag_…"
            onChange={(e) => setNfc(e.target.value)}
            className="font-mono"
          />
          {error && <p className="text-caption text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={!nfc}>
            Register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
