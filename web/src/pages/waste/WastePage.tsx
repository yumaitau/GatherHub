import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Layers,
  Plus,
  Recycle,
  Truck,
  Users,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { downloadCsv, humanise, toCsv } from "@/lib/utils";
import { moduleEnabled } from "@/lib/verticals";
import { StatusBadge, DiscrepancyBadges } from "./shared";
import { WASTE_CLASSIFICATIONS, WASTE_UNITS, qtyLabel } from "./constants";

type Dashboard = NonNullable<
  ReturnType<typeof useQuery<typeof api.waste.dashboard>>
>;
type ReferenceData = NonNullable<
  ReturnType<typeof useQuery<typeof api.waste.referenceData>>
>;
type LoadRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.waste.listLoads>>
>[number];

export default function WastePage() {
  const { org, hasCapability } = useGatherHub();
  const wasteEnabled = moduleEnabled(org, "waste");
  const dashboard = useQuery(api.waste.dashboard, wasteEnabled ? {} : "skip");
  const references = useQuery(
    api.waste.referenceData,
    wasteEnabled ? {} : "skip",
  );
  const config = useQuery(api.waste.config, wasteEnabled ? {} : "skip");
  const loads = useQuery(api.waste.listLoads, wasteEnabled ? {} : "skip");
  const discrepancies = useQuery(
    api.waste.discrepancies,
    wasteEnabled ? {} : "skip",
  );
  const exportData = useQuery(
    api.waste.exportData,
    wasteEnabled && hasCapability("waste.export") ? {} : "skip",
  );

  const canManage = hasCapability("waste.manage");

  if (!wasteEnabled) {
    return (
      <EmptyState
        icon={Recycle}
        title="Waste is off"
        description="Enable Waste operations in Settings to track loads, chain of custody, manifests, discrepancies, streams, and parties."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  if (
    dashboard === undefined ||
    references === undefined ||
    config === undefined ||
    loads === undefined ||
    discrepancies === undefined
  ) {
    return <LoadingState />;
  }

  return (
    <div>
      <PageHeader
        title="Waste"
        description="Loads, chain of custody, manifests, discrepancies, waste streams, and parties."
        actions={canManage ? <LoadDialog references={references} /> : null}
      />

      <Tabs defaultValue="loads">
        <TabsList className="mb-5">
          <TabsTrigger value="loads">Loads</TabsTrigger>
          <TabsTrigger value="discrepancies">Discrepancies</TabsTrigger>
          <TabsTrigger value="manifests">Manifests</TabsTrigger>
          <TabsTrigger value="streams">Streams</TabsTrigger>
          <TabsTrigger value="parties">Parties</TabsTrigger>
          <TabsTrigger value="exports">Exports</TabsTrigger>
        </TabsList>

        <TabsContent value="loads">
          <Overview dashboard={dashboard} />
          <div className="mt-6">
            <LoadsTab
              loads={loads}
              references={references}
              canManage={canManage}
            />
          </div>
        </TabsContent>
        <TabsContent value="discrepancies">
          <DiscrepanciesTab rows={discrepancies} />
        </TabsContent>
        <TabsContent value="manifests">
          <ManifestsTab loads={loads} />
        </TabsContent>
        <TabsContent value="streams">
          <StreamsTab references={references} canManage={canManage} />
        </TabsContent>
        <TabsContent value="parties">
          <PartiesTab references={references} canManage={canManage} />
        </TabsContent>
        <TabsContent value="exports">
          <ExportsTab data={exportData} />
        </TabsContent>
      </Tabs>

      <p className="mt-6 text-caption text-ink-quiet">
        {config.complianceLabel}
      </p>
    </div>
  );
}

function Overview({ dashboard }: { dashboard: Dashboard }) {
  const stats = dashboard.counts;
  const statuses = Object.entries(dashboard.byStatus).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Metric label="Total loads" value={stats.total} icon={Truck} />
        <Metric
          label="Active"
          value={stats.active}
          icon={CheckCircle2}
          tone="success"
        />
        <Metric
          label="Open discrepancies"
          value={stats.openDiscrepancies}
          icon={AlertTriangle}
          tone={stats.openDiscrepancies > 0 ? "danger" : "neutral"}
        />
        <Metric label="Streams" value={stats.streams} icon={Layers} />
        <Metric label="Parties" value={stats.parties} icon={Users} />
      </div>
      <Panel title="Loads by status">
        {statuses.length === 0 ? (
          <p className="py-4 text-body text-ink-quiet">No loads yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {statuses.map(([status, count]) => (
              <div
                key={status}
                className="flex items-center gap-2 rounded-sm border border-hairline bg-surface px-3 py-1.5"
              >
                <StatusBadge value={status} />
                <span className="text-body-strong text-ink-strong">
                  {count}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function LoadsTab({
  loads,
  references,
  canManage,
}: {
  loads: LoadRow[];
  references: ReferenceData;
  canManage: boolean;
}) {
  const columns = React.useMemo<ColumnDef<LoadRow>[]>(
    () => [
      {
        accessorKey: "reference",
        header: "Reference",
        cell: ({ row }) => (
          <Link
            to={`/waste/${row.original.id}`}
            className="font-semi text-ink-strong hover:text-primary"
          >
            {row.original.reference}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
      },
      {
        id: "stream",
        header: "Stream",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            {row.original.streamName ?? "-"}
            {row.original.hazardous ? (
              <Badge variant="destructive">Hazardous</Badge>
            ) : null}
          </span>
        ),
      },
      {
        id: "route",
        header: "Consignor → Receiver",
        cell: ({ row }) =>
          `${row.original.consignor ?? "-"} → ${row.original.actualReceiver ?? row.original.plannedReceiver ?? "-"}`,
      },
      {
        id: "qty",
        header: "Quantity",
        cell: ({ row }) =>
          qtyLabel(
            row.original.arrivalAmount ?? row.original.pickupAmount,
            row.original.arrivalUnit ?? row.original.pickupUnit,
          ),
      },
      {
        id: "discrepancy",
        header: "Discrepancy",
        cell: ({ row }) =>
          row.original.hasDiscrepancy ? (
            <DiscrepancyBadges flags={row.original.discrepancyFlags} />
          ) : (
            <span className="text-caption text-ink-quiet">None</span>
          ),
      },
    ],
    [],
  );
  return (
    <DataTable
      data={loads}
      columns={columns}
      searchPlaceholder="Search loads"
      toolbar={
        canManage ? (
          <LoadDialog references={references} variant="outline" />
        ) : undefined
      }
    />
  );
}

function DiscrepanciesTab({ rows }: { rows: LoadRow[] }) {
  const columns = React.useMemo<ColumnDef<LoadRow>[]>(
    () => [
      {
        accessorKey: "reference",
        header: "Reference",
        cell: ({ row }) => (
          <Link
            to={`/waste/${row.original.id}`}
            className="font-semi text-ink-strong hover:text-primary"
          >
            {row.original.reference}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
      },
      {
        id: "stream",
        header: "Stream",
        cell: ({ row }) => row.original.streamName ?? "-",
      },
      {
        id: "flags",
        header: "Flags",
        cell: ({ row }) => (
          <DiscrepancyBadges flags={row.original.discrepancyFlags} />
        ),
      },
      {
        id: "reason",
        header: "Rejection reason",
        cell: ({ row }) => row.original.rejectionReason ?? "-",
      },
    ],
    [],
  );
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No open discrepancies"
        description="Loads with quantity mismatches, missing documents, late deliveries, rejected loads, or wrong-party events appear here."
      />
    );
  }
  return (
    <DataTable
      data={rows}
      columns={columns}
      searchPlaceholder="Search discrepancies"
    />
  );
}

function ManifestsTab({ loads }: { loads: LoadRow[] }) {
  const columns = React.useMemo<ColumnDef<LoadRow>[]>(
    () => [
      {
        accessorKey: "reference",
        header: "Reference",
        cell: ({ row }) => (
          <Link
            to={`/waste/${row.original.id}`}
            className="font-semi text-ink-strong hover:text-primary"
          >
            {row.original.reference}
          </Link>
        ),
      },
      {
        id: "manifest",
        header: "Manifest / certificate",
        cell: ({ row }) =>
          row.original.manifestNumber ? (
            <span className="text-body text-ink">
              {row.original.manifestNumber}
            </span>
          ) : (
            <Badge variant="warning">Missing</Badge>
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
      },
      {
        id: "consignor",
        header: "Consignor",
        cell: ({ row }) => row.original.consignor ?? "-",
      },
      {
        id: "receiver",
        header: "Receiver",
        cell: ({ row }) =>
          row.original.actualReceiver ?? row.original.plannedReceiver ?? "-",
      },
    ],
    [],
  );
  return (
    <DataTable
      data={loads}
      columns={columns}
      searchPlaceholder="Search manifests"
    />
  );
}

function StreamsTab({
  references,
  canManage,
}: {
  references: ReferenceData;
  canManage: boolean;
}) {
  const columns = React.useMemo<ColumnDef<ReferenceData["streams"][number]>[]>(
    () => [
      { accessorKey: "name", header: "Stream" },
      {
        id: "code",
        header: "Code",
        cell: ({ row }) => row.original.code ?? "-",
      },
      {
        accessorKey: "classification",
        header: "Classification",
        cell: ({ row }) => humanise(row.original.classification),
      },
      {
        id: "hazardous",
        header: "Hazardous",
        cell: ({ row }) =>
          row.original.hazardous ? (
            <Badge variant="destructive">Hazardous</Badge>
          ) : (
            <span className="text-caption text-ink-quiet">No</span>
          ),
      },
      {
        accessorKey: "defaultUnit",
        header: "Default unit",
        cell: ({ row }) => humanise(row.original.defaultUnit),
      },
    ],
    [],
  );
  return (
    <DataTable
      data={references.streams}
      columns={columns}
      searchPlaceholder="Search streams"
      toolbar={canManage ? <StreamDialog /> : undefined}
    />
  );
}

function PartiesTab({
  references,
  canManage,
}: {
  references: ReferenceData;
  canManage: boolean;
}) {
  const columns = React.useMemo<ColumnDef<ReferenceData["parties"][number]>[]>(
    () => [
      { accessorKey: "name", header: "Party" },
      {
        id: "roles",
        header: "Roles",
        cell: ({ row }) => {
          const roles = [
            row.original.consignor && "Consignor",
            row.original.transporter && "Transporter",
            row.original.receiver && "Receiver",
          ].filter(Boolean) as string[];
          return (
            <div className="flex flex-wrap gap-1.5">
              {roles.map((role) => (
                <Badge key={role} variant="muted">
                  {role}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        id: "licence",
        header: "Licence",
        cell: ({ row }) => row.original.licenceNumber ?? "-",
      },
    ],
    [],
  );
  return (
    <DataTable
      data={references.parties}
      columns={columns}
      searchPlaceholder="Search parties"
      toolbar={canManage ? <PartyDialog /> : undefined}
    />
  );
}

function ExportsTab({
  data,
}: {
  data: ReturnType<typeof useQuery<typeof api.waste.exportData>>;
}) {
  if (data === undefined) {
    return (
      <EmptyState
        icon={Download}
        title="Export access required"
        description="Waste exports require the export waste data permission."
      />
    );
  }
  const downloads = [
    ["waste-loads.csv", data.loads],
    ["waste-discrepancies.csv", data.discrepancies],
  ] as const;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {downloads.map(([filename, rows]) => (
        <button
          key={filename}
          type="button"
          onClick={() =>
            downloadCsv(
              filename,
              toCsv(
                rows as Record<string, unknown>[],
                Object.keys(rows[0] ?? { empty: "" }),
              ),
            )
          }
          className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface px-4 py-3 text-left hover:border-border"
        >
          <span className="text-body-strong text-ink-strong">{filename}</span>
          <Download className="h-4 w-4 text-ink-quiet" />
        </button>
      ))}
    </div>
  );
}

// --- Dialogs ----------------------------------------------------------------

function LoadDialog({
  references,
  variant = "default",
}: {
  references: ReferenceData;
  variant?: "default" | "outline";
}) {
  const createLoad = useMutation(api.waste.createLoad);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    reference: "",
    streamId: "",
    consignorPartyId: "",
    plannedReceiverPartyId: "",
    transporterPartyId: "",
    containerAssetId: "",
    vehicleAssetId: "",
    driverMemberId: "",
    scheduledFor: "",
    manifestNumber: "",
    notes: "",
  });
  const consignors = references.parties.filter((p) => p.consignor);
  const receivers = references.parties.filter((p) => p.receiver);
  const transporters = references.parties.filter((p) => p.transporter);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await createLoad({
        reference: form.reference,
        streamId: form.streamId as Id<"wasteStreams">,
        consignorPartyId: form.consignorPartyId as Id<"wasteParties">,
        plannedReceiverPartyId:
          form.plannedReceiverPartyId as Id<"wasteParties">,
        transporterPartyId:
          (form.transporterPartyId as Id<"wasteParties">) || undefined,
        containerAssetId: (form.containerAssetId as Id<"assets">) || undefined,
        vehicleAssetId: (form.vehicleAssetId as Id<"assets">) || undefined,
        driverMemberId: (form.driverMemberId as Id<"members">) || undefined,
        scheduledFor: form.scheduledFor || undefined,
        manifestNumber: form.manifestNumber || undefined,
        notes: form.notes || undefined,
      });
      toastSuccess("Load dispatched.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not dispatch load.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Plus className="h-4 w-4" />
          Dispatch load
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispatch load</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Reference">
            <Input
              required
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </Field>
          <Field label="Stream">
            <ReferenceSelect
              required
              value={form.streamId}
              rows={references.streams}
              label={(s) => s.name}
              onChange={(streamId) => setForm({ ...form, streamId })}
            />
          </Field>
          <Field label="Consignor">
            <ReferenceSelect
              required
              value={form.consignorPartyId}
              rows={consignors}
              label={(p) => p.name}
              onChange={(consignorPartyId) =>
                setForm({ ...form, consignorPartyId })
              }
            />
          </Field>
          <Field label="Planned receiver">
            <ReferenceSelect
              required
              value={form.plannedReceiverPartyId}
              rows={receivers}
              label={(p) => p.name}
              onChange={(plannedReceiverPartyId) =>
                setForm({ ...form, plannedReceiverPartyId })
              }
            />
          </Field>
          <Field label="Transporter">
            <ReferenceSelect
              value={form.transporterPartyId}
              rows={transporters}
              label={(p) => p.name}
              onChange={(transporterPartyId) =>
                setForm({ ...form, transporterPartyId })
              }
            />
          </Field>
          <Field label="Container">
            <ReferenceSelect
              value={form.containerAssetId}
              rows={references.containers}
              label={(c) => c.name}
              onChange={(containerAssetId) =>
                setForm({ ...form, containerAssetId })
              }
            />
          </Field>
          <Field label="Vehicle">
            <ReferenceSelect
              value={form.vehicleAssetId}
              rows={references.vehicles}
              label={(vehicle) => vehicle.name}
              onChange={(vehicleAssetId) =>
                setForm({ ...form, vehicleAssetId })
              }
            />
          </Field>
          <Field label="Driver">
            <ReferenceSelect
              value={form.driverMemberId}
              rows={references.drivers}
              label={(d) => d.name ?? "Unnamed"}
              onChange={(driverMemberId) =>
                setForm({ ...form, driverMemberId })
              }
            />
          </Field>
          <Field label="Scheduled for">
            <Input
              type="date"
              value={form.scheduledFor}
              onChange={(e) =>
                setForm({ ...form, scheduledFor: e.target.value })
              }
            />
          </Field>
          <Field label="Manifest number">
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
              {saving ? "Saving..." : "Dispatch load"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StreamDialog() {
  const upsert = useMutation(api.waste.upsertStream);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    code: "",
    classification: "general",
    hazardous: false,
    defaultUnit: "kg",
    notes: "",
  });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await upsert({
        name: form.name,
        code: form.code || undefined,
        classification:
          form.classification as (typeof WASTE_CLASSIFICATIONS)[number],
        hazardous: form.hazardous,
        defaultUnit: form.defaultUnit as (typeof WASTE_UNITS)[number],
        notes: form.notes || undefined,
      });
      toastSuccess("Stream saved.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not save stream.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4" />
          Stream
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add waste stream</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Code">
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </Field>
          <Field label="Classification">
            <EnumSelect
              value={form.classification}
              values={WASTE_CLASSIFICATIONS}
              onChange={(classification) =>
                setForm({ ...form, classification })
              }
            />
          </Field>
          <Field label="Default unit">
            <EnumSelect
              value={form.defaultUnit}
              values={WASTE_UNITS}
              onChange={(defaultUnit) => setForm({ ...form, defaultUnit })}
            />
          </Field>
          <label className="flex items-center gap-2 text-body text-ink-soft sm:col-span-2">
            <input
              type="checkbox"
              checked={form.hazardous}
              onChange={(e) =>
                setForm({ ...form, hazardous: e.target.checked })
              }
            />
            Hazardous
          </label>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save stream"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PartyDialog() {
  const upsert = useMutation(api.waste.upsertParty);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    consignor: false,
    transporter: false,
    receiver: false,
    licenceNumber: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });
  const hasRole = form.consignor || form.transporter || form.receiver;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!hasRole) {
      toastFailure(
        new Error("Select at least one role"),
        "Select at least one role.",
      );
      return;
    }
    setSaving(true);
    try {
      await upsert({
        name: form.name,
        consignor: form.consignor,
        transporter: form.transporter,
        receiver: form.receiver,
        licenceNumber: form.licenceNumber || undefined,
        contactName: form.contactName || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        notes: form.notes || undefined,
      });
      toastSuccess("Party saved.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not save party.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4" />
          Party
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add party</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-4 sm:col-span-2">
            <label className="flex items-center gap-2 text-body text-ink-soft">
              <input
                type="checkbox"
                checked={form.consignor}
                onChange={(e) =>
                  setForm({ ...form, consignor: e.target.checked })
                }
              />
              Consignor
            </label>
            <label className="flex items-center gap-2 text-body text-ink-soft">
              <input
                type="checkbox"
                checked={form.transporter}
                onChange={(e) =>
                  setForm({ ...form, transporter: e.target.checked })
                }
              />
              Transporter
            </label>
            <label className="flex items-center gap-2 text-body text-ink-soft">
              <input
                type="checkbox"
                checked={form.receiver}
                onChange={(e) =>
                  setForm({ ...form, receiver: e.target.checked })
                }
              />
              Receiver
            </label>
          </div>
          <Field label="Licence number">
            <Input
              value={form.licenceNumber}
              onChange={(e) =>
                setForm({ ...form, licenceNumber: e.target.value })
              }
            />
          </Field>
          <Field label="Contact name">
            <Input
              value={form.contactName}
              onChange={(e) =>
                setForm({ ...form, contactName: e.target.value })
              }
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={saving || !hasRole}>
              {saving ? "Saving..." : "Save party"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Small shared bits ------------------------------------------------------

function Metric({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "text-ink-quiet";
  return (
    <div className="rounded-md border border-hairline bg-surface px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-caption text-ink-quiet">
        <Icon className={`h-3.5 w-3.5 ${toneClass}`} />
        {label}
      </div>
      <p className={`mt-1 text-h3 font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-hairline bg-surface px-4 py-3">
      <h2 className="mb-3 text-title text-ink-strong">{title}</h2>
      {children}
    </section>
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

function EnumSelect<T extends readonly string[]>({
  value,
  values,
  onChange,
}: {
  value: string;
  values: T;
  onChange: (value: T[number]) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T[number])}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {values.map((item) => (
          <SelectItem key={item} value={item}>
            {humanise(item)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ReferenceSelect<T extends { id: string }>({
  value,
  rows,
  label,
  onChange,
  required,
}: {
  value: string;
  rows: T[];
  label: (row: T) => string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <Select
      value={value || "none"}
      onValueChange={(v) => onChange(v === "none" ? "" : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder={required ? "Select" : "None"} />
      </SelectTrigger>
      <SelectContent>
        {!required && <SelectItem value="none">None</SelectItem>}
        {rows.map((row) => (
          <SelectItem key={row.id} value={row.id}>
            {label(row)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
