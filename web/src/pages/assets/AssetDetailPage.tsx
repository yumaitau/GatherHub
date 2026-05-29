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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  PageHeader,
  LoadingState,
  AssetStatusBadge,
} from "@/components/shared";
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
          <ArrowLeft className="h-4 w-4" /> Back to KitTrace
        </Link>
      </Button>

      <PageHeader
        title={asset.name}
        description={`${humanise(asset.category)} · ${humanise(asset.condition)} condition`}
        actions={<AssetStatusBadge status={asset.status} />}
      />

      {canManage && asset.status !== "retired" && (
        <div className="mb-6 flex flex-wrap gap-2">
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
          <Card>
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
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
              />
              <Field label="Serial number" value={asset.serialNumber ?? "—"} />
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
                      className="text-primary hover:underline"
                    >
                      {sponsor.name}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Field label="Notes" value={asset.notes ?? "—"} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qr">
          <Card>
            <CardHeader>
              <CardTitle>QR code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {asset.qrTagId ? (
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                  <div className="rounded-lg border bg-white p-4">
                    <QrCode value={assetTagUrl(asset.qrTagId)} />
                  </div>
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="text-muted-foreground">Tag id:</span>{" "}
                      <code>{asset.qrTagId}</code>
                    </p>
                    <p className="break-all">
                      <span className="text-muted-foreground">Lookup URL:</span>{" "}
                      {assetTagUrl(asset.qrTagId)}
                    </p>
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
                <p className="text-sm text-muted-foreground">
                  No QR tag assigned.
                </p>
              )}

              <div className="border-t pt-4">
                <p className="mb-1 text-sm font-medium">NFC tag</p>
                {asset.nfcTagId ? (
                  <p className="text-sm">
                    Registered: <code>{asset.nfcTagId}</code>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No NFC tag registered.
                  </p>
                )}
                {canManage && <RegisterNfcDialog assetId={id} />}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Audit history</CardTitle>
            </CardHeader>
            <CardContent>
              {history === undefined ? (
                <LoadingState />
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history.</p>
              ) : (
                <ol className="relative border-l pl-6">
                  {history.map((h) => (
                    <li key={h._id} className="mb-5">
                      <div className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                      <p className="font-medium">{humanise(h.action)}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(h.performedAt)} · {h.performerName}
                      </p>
                      {(h.toStatus || h.toCustodianName || h.toLocation) && (
                        <p className="text-sm">
                          {h.fromStatus && h.toStatus
                            ? `${humanise(h.fromStatus)} → ${humanise(h.toStatus)}`
                            : null}
                          {h.toCustodianName
                            ? ` · to ${h.toCustodianName}`
                            : null}
                          {h.toLocation ? ` · @ ${h.toLocation}` : null}
                        </p>
                      )}
                      {h.notes && <p className="text-sm italic">“{h.notes}”</p>}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5">{value}</p>
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
        <div className="space-y-3">
          <div>
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
          <div>
            <Label htmlFor="co-loc">Location</Label>
            <Input
              id="co-loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="co-due">Due back</Label>
            <Input
              id="co-due"
              type="date"
              value={dueBack}
              onChange={(e) => setDueBack(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="co-notes">Notes</Label>
            <Textarea
              id="co-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
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
        <div className="space-y-3">
          <div>
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
          <div>
            <Label htmlFor="tr-notes">Notes</Label>
            <Textarea
              id="tr-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
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
        <div className="space-y-3">
          <div>
            <Label htmlFor="op-notes">Notes (optional)</Label>
            <Textarea
              id="op-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
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
        <Button variant="outline" size="sm" className="mt-2">
          <Nfc className="h-4 w-4" /> Register NFC tag
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register NFC tag</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Enter the NFC tag id (the iOS app writes the opaque tag id when
            scanning a blank tag). No private data is stored on the tag.
          </p>
          <Input
            value={nfc}
            placeholder="tag_…"
            onChange={(e) => setNfc(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
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
