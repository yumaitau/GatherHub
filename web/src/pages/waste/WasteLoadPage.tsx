import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  MapPin,
  PenLine,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, LoadingState, PageHeader } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { formatDate, formatDateTime, humanise } from "@/lib/utils";
import { moduleEnabled } from "@/lib/verticals";
import { StatusBadge, DiscrepancyBadges } from "./shared";
import { WASTE_UNITS, qtyLabel } from "./constants";

type LoadDetail = NonNullable<
  ReturnType<typeof useQuery<typeof api.waste.getLoad>>
>;
type WasteEvent = LoadDetail["events"][number];
type ReferenceData = NonNullable<
  ReturnType<typeof useQuery<typeof api.waste.referenceData>>
>;

export default function WasteLoadPage() {
  const { loadId } = useParams<{ loadId: string }>();
  const { org, hasCapability } = useGatherHub();
  const wasteEnabled = moduleEnabled(org, "waste");
  const detail = useQuery(
    api.waste.getLoad,
    wasteEnabled && loadId ? { loadId: loadId as Id<"wasteLoads"> } : "skip",
  );
  const references = useQuery(
    api.waste.referenceData,
    wasteEnabled ? {} : "skip",
  );
  const config = useQuery(api.waste.config, wasteEnabled ? {} : "skip");

  if (!wasteEnabled) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Waste is off"
        description="Enable Waste operations in Settings to view loads."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  if (detail === undefined || references === undefined) {
    return <LoadingState />;
  }
  if (!detail) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Load not found"
        description="This load does not exist or you cannot access it."
        action={
          <Button asChild>
            <Link to="/waste">Back to waste</Link>
          </Button>
        }
      />
    );
  }

  const { load, events } = detail;
  const canOperate = hasCapability("waste.operate");
  const canManage = hasCapability("waste.manage");

  return (
    <div>
      <Link
        to="/waste"
        className="mb-3 inline-flex items-center gap-1 text-caption text-ink-quiet hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Waste
      </Link>
      <PageHeader
        title={load.reference}
        description={`${load.streamName ?? "Unassigned stream"}${
          load.classification ? ` · ${humanise(load.classification)}` : ""
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={load.status} />
            {load.hazardous ? (
              <Badge variant="destructive">Hazardous</Badge>
            ) : null}
            {load.hasDiscrepancy ? (
              <DiscrepancyBadges flags={load.discrepancyFlags} />
            ) : null}
          </div>
        }
      />

      <ActionBar
        load={load}
        references={references}
        canOperate={canOperate}
        canManage={canManage}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Summary load={load} />
        <Timeline events={events} />
      </div>

      {config ? (
        <p className="mt-6 text-caption text-ink-quiet">
          {config.complianceLabel}
        </p>
      ) : null}
    </div>
  );
}

function Summary({ load }: { load: LoadDetail["load"] }) {
  const rows: [string, React.ReactNode][] = [
    ["Stream", load.streamName ?? "-"],
    [
      "Classification",
      load.classification ? humanise(load.classification) : "-",
    ],
    ["Hazardous", load.hazardous ? "Yes" : "No"],
    ["Consignor", load.consignor ?? "-"],
    ["Transporter", load.transporter ?? "-"],
    ["Planned receiver", load.plannedReceiver ?? "-"],
    ["Actual receiver", load.actualReceiver ?? "-"],
    ["Redirected to", load.redirectedTo ?? "-"],
    ["Container", load.container ?? "-"],
    ["Vehicle", load.vehicle ?? "-"],
    ["Driver", load.driver ?? "-"],
    ["Scheduled for", load.scheduledFor ? formatDate(load.scheduledFor) : "-"],
    ["Manifest number", load.manifestNumber ?? "-"],
    ["Pickup quantity", qtyLabel(load.pickupAmount, load.pickupUnit)],
    ["Arrival quantity", qtyLabel(load.arrivalAmount, load.arrivalUnit)],
  ];
  if (load.rejectionReason) {
    rows.push(["Rejection reason", load.rejectionReason]);
  }
  return (
    <section className="grid gap-3 rounded-md border border-hairline bg-surface p-4 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <p className="text-caption text-ink-quiet">{label}</p>
          <div className="mt-1 text-body text-ink">{value}</div>
        </div>
      ))}
      {load.notes ? (
        <div className="sm:col-span-2">
          <p className="text-caption text-ink-quiet">Notes</p>
          <p className="mt-1 text-body text-ink-soft">{load.notes}</p>
        </div>
      ) : null}
    </section>
  );
}

function Timeline({ events }: { events: WasteEvent[] }) {
  return (
    <section className="rounded-md border border-hairline bg-surface p-4">
      <h2 className="mb-3 text-title text-ink-strong">Chain of custody</h2>
      {events.length === 0 ? (
        <p className="py-4 text-body text-ink-quiet">No custody events yet.</p>
      ) : (
        <ol className="relative ml-1 border-l border-hairline">
          {events.map((event) => (
            <li key={event.id} className="ml-4 pb-5 last:pb-0">
              <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={event.type} />
                {event.from || event.to ? (
                  <span className="text-caption text-ink-soft">
                    {event.from ?? "-"} → {event.to ?? "-"}
                  </span>
                ) : null}
                <span className="ml-auto text-caption text-ink-quiet">
                  {formatDateTime(event.occurredAt)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-soft">
                {event.amount != null ? (
                  <span>{qtyLabel(event.amount, event.unit)}</span>
                ) : null}
                {event.manifestNumber ? (
                  <span>Manifest {event.manifestNumber}</span>
                ) : null}
                {event.performedBy ? <span>by {event.performedBy}</span> : null}
                {event.hasSignature ? (
                  <span className="inline-flex items-center gap-1">
                    <PenLine className="h-3 w-3" />
                    Signed
                  </span>
                ) : null}
                {event.photoCount > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Camera className="h-3 w-3" />
                    {event.photoCount}
                  </span>
                ) : null}
                {event.geo ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {event.geo.lat.toFixed(4)}, {event.geo.lng.toFixed(4)}
                  </span>
                ) : null}
              </div>
              {event.discrepancyFlags && event.discrepancyFlags.length > 0 ? (
                <div className="mt-1.5">
                  <DiscrepancyBadges flags={event.discrepancyFlags} />
                </div>
              ) : null}
              {event.notes ? (
                <p className="mt-1.5 text-caption text-ink-soft">
                  {event.notes}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ActionBar({
  load,
  references,
  canOperate,
  canManage,
}: {
  load: LoadDetail["load"];
  references: ReferenceData;
  canOperate: boolean;
  canManage: boolean;
}) {
  const status = load.status;
  const buttons: React.ReactNode[] = [];

  if (canOperate && status === "scheduled") {
    buttons.push(<PickupDialog key="pickup" loadId={load._id} />);
  }
  if (canOperate && (status === "picked_up" || status === "in_transit")) {
    buttons.push(
      <ArrivalDialog key="arrival" loadId={load._id} references={references} />,
    );
  }
  if (canManage && status === "arrived") {
    buttons.push(
      <AcceptButton key="accept" loadId={load._id} />,
      <RejectDialog key="reject" loadId={load._id} />,
    );
  }
  if (canManage && status === "accepted") {
    buttons.push(<ProcessButton key="process" loadId={load._id} />);
  }
  if (canManage && status === "rejected") {
    buttons.push(
      <RedirectDialog
        key="redirect"
        loadId={load._id}
        references={references}
      />,
    );
  }
  if (
    canManage &&
    status !== "processed" &&
    status !== "redirected" &&
    status !== "cancelled"
  ) {
    buttons.push(<CancelDialog key="cancel" loadId={load._id} />);
  }
  if (canManage && load.hasDiscrepancy) {
    buttons.push(<ResolveDialog key="resolve" loadId={load._id} />);
  }

  if (buttons.length === 0) {
    return (
      <p className="text-caption text-ink-quiet">
        No actions available for this load at its current stage.
      </p>
    );
  }
  return <div className="flex flex-wrap gap-2">{buttons}</div>;
}

// --- Action dialogs / buttons ----------------------------------------------

function PickupDialog({ loadId }: { loadId: Id<"wasteLoads"> }) {
  const recordPickup = useMutation(api.waste.recordPickup);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    amount: "",
    unit: "kg",
    manifestNumber: "",
    notes: "",
  });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await recordPickup({
        loadId,
        pickupAmount: numberOrUndefined(form.amount),
        pickupUnit: form.unit as (typeof WASTE_UNITS)[number],
        manifestNumber: form.manifestNumber || undefined,
        notes: form.notes || undefined,
      });
      toastSuccess("Pickup recorded.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not record pickup.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <QuantityDialog
      title="Record pickup"
      trigger="Record pickup"
      open={open}
      setOpen={setOpen}
      saving={saving}
      submit={submit}
      form={form}
      setForm={setForm}
    />
  );
}

function ArrivalDialog({
  loadId,
  references,
}: {
  loadId: Id<"wasteLoads">;
  references: ReferenceData;
}) {
  const recordArrival = useMutation(api.waste.recordArrival);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    amount: "",
    unit: "kg",
    manifestNumber: "",
    notes: "",
  });
  const [actualReceiverPartyId, setActualReceiverPartyId] = React.useState("");
  const receivers = references.parties.filter((p) => p.receiver);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await recordArrival({
        loadId,
        arrivalAmount: numberOrUndefined(form.amount),
        arrivalUnit: form.unit as (typeof WASTE_UNITS)[number],
        actualReceiverPartyId:
          (actualReceiverPartyId as Id<"wasteParties">) || undefined,
        manifestNumber: form.manifestNumber || undefined,
        notes: form.notes || undefined,
      });
      toastSuccess("Arrival recorded.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not record arrival.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <QuantityDialog
      title="Record arrival"
      trigger="Record arrival"
      open={open}
      setOpen={setOpen}
      saving={saving}
      submit={submit}
      form={form}
      setForm={setForm}
      extra={
        <Field label="Actual receiver">
          <Select
            value={actualReceiverPartyId || "none"}
            onValueChange={(v) =>
              setActualReceiverPartyId(v === "none" ? "" : v)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Planned receiver" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Planned receiver</SelectItem>
              {receivers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      }
    />
  );
}

type QtyForm = {
  amount: string;
  unit: string;
  manifestNumber: string;
  notes: string;
};

function QuantityDialog({
  title,
  trigger,
  open,
  setOpen,
  saving,
  submit,
  form,
  setForm,
  extra,
}: {
  title: string;
  trigger: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  saving: boolean;
  submit: (event: React.FormEvent) => void;
  form: QtyForm;
  setForm: React.Dispatch<React.SetStateAction<QtyForm>>;
  extra?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{trigger}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount">
            <Input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field label="Unit">
            <Select
              value={form.unit}
              onValueChange={(unit) => setForm({ ...form, unit })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WASTE_UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {humanise(unit)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {extra}
          <Field label="Manifest number" className="sm:col-span-2">
            <Input
              value={form.manifestNumber}
              onChange={(e) =>
                setForm({ ...form, manifestNumber: e.target.value })
              }
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AcceptButton({ loadId }: { loadId: Id<"wasteLoads"> }) {
  const acceptLoad = useMutation(api.waste.acceptLoad);
  return (
    <Button
      onClick={() =>
        acceptLoad({ loadId })
          .then(() => toastSuccess("Load accepted."))
          .catch((err) => toastFailure(err, "Could not accept load."))
      }
    >
      Accept
    </Button>
  );
}

function ProcessButton({ loadId }: { loadId: Id<"wasteLoads"> }) {
  const processLoad = useMutation(api.waste.processLoad);
  return (
    <Button
      onClick={() =>
        processLoad({ loadId })
          .then(() => toastSuccess("Load processed."))
          .catch((err) => toastFailure(err, "Could not process load."))
      }
    >
      Process
    </Button>
  );
}

function RejectDialog({ loadId }: { loadId: Id<"wasteLoads"> }) {
  const rejectLoad = useMutation(api.waste.rejectLoad);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await rejectLoad({ loadId, reason, notes: notes || undefined });
      toastSuccess("Load rejected.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not reject load.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Reject</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject load</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Reason">
            <Input
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Reject load"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RedirectDialog({
  loadId,
  references,
}: {
  loadId: Id<"wasteLoads">;
  references: ReferenceData;
}) {
  const redirectLoad = useMutation(api.waste.redirectLoad);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [partyId, setPartyId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const receivers = references.parties.filter((p) => p.receiver);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await redirectLoad({
        loadId,
        redirectedToPartyId: partyId as Id<"wasteParties">,
        notes: notes || undefined,
      });
      toastSuccess("Load redirected.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not redirect load.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Redirect</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redirect load</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Redirect to receiver">
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {receivers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={saving || !partyId}>
              {saving ? "Saving..." : "Redirect load"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ loadId }: { loadId: Id<"wasteLoads"> }) {
  const cancelLoad = useMutation(api.waste.cancelLoad);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [reason, setReason] = React.useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await cancelLoad({ loadId, reason: reason || undefined });
      toastSuccess("Load cancelled.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not cancel load.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Cancel</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel load</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={saving}>
              {saving ? "Saving..." : "Cancel load"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({ loadId }: { loadId: Id<"wasteLoads"> }) {
  const resolve = useMutation(api.waste.resolveDiscrepancy);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [resolutionNotes, setResolutionNotes] = React.useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await resolve({ loadId, resolutionNotes });
      toastSuccess("Discrepancy resolved.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not resolve discrepancy.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Resolve discrepancy</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve discrepancy</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Resolution notes">
            <Textarea
              required
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Resolve"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
