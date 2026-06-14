import * as React from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  FileUp,
  Fuel,
  History,
  Pencil,
  Route,
  Wrench,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, LoadingState, PageHeader } from "@/components/shared";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { DOCUMENT_UPLOAD_ACCEPT, uploadDocumentFile } from "@/lib/uploads";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  humanise,
} from "@/lib/utils";

type VehicleDetail = NonNullable<
  ReturnType<typeof useQuery<typeof api.fleet.getVehicle>>
>;

const VEHICLE_STATUSES = [
  "active",
  "booked",
  "in_maintenance",
  "unavailable",
  "retired",
  "sold",
  "written_off",
] as const;

export default function FleetVehiclePage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const detail = useQuery(
    api.fleet.getVehicle,
    vehicleId ? { vehicleId: vehicleId as Id<"vehicles"> } : "skip",
  );

  if (detail === undefined) return <LoadingState />;
  if (!detail) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Vehicle not found"
        description="This vehicle does not exist or you cannot access it."
        action={
          <Button asChild>
            <Link to="/fleet">Back to fleet</Link>
          </Button>
        }
      />
    );
  }

  const { vehicle } = detail;
  return (
    <div>
      <Link
        to="/fleet"
        className="mb-3 inline-flex items-center gap-1 text-caption text-ink-quiet hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Fleet
      </Link>
      <PageHeader
        title={vehicle.name}
        description={`${vehicle.registrationNumber} · ${vehicle.vehicleType}`}
        actions={
          <>
            <StatusBadge value={vehicle.status} />
            <EditVehicleDialog vehicle={vehicle} />
          </>
        }
      />

      {vehicle.compliance.warnings.length > 0 && (
        <div className="mb-5 rounded-md border border-warning/40 bg-warning-wash px-4 py-3">
          <p className="text-body-strong text-ink-strong">Attention</p>
          <p className="mt-1 text-caption text-ink-soft">
            {vehicle.compliance.warnings.join(" · ")}
          </p>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="mb-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="defects">Defects</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="fuel">Fuel</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Overview detail={detail} />
        </TabsContent>
        <TabsContent value="jobs">
          <Rows
            rows={detail.jobs}
            empty="No jobs for this vehicle."
            render={(job) => (
              <Row
                key={job._id}
                icon={Route}
                title={job.title}
                meta={`${humanise(job.status)} · ${formatDateTime(job.startDateTime)}`}
              />
            )}
          />
        </TabsContent>
        <TabsContent value="maintenance">
          <Rows
            rows={detail.maintenance}
            empty="No maintenance records."
            render={(record) => (
              <Row
                key={record._id}
                icon={Wrench}
                title={record.description}
                meta={`${humanise(record.status)} · ${formatDate(record.scheduledDate ?? record.dateReported)} · ${formatCurrency(record.totalCost)}`}
              />
            )}
          />
        </TabsContent>
        <TabsContent value="defects">
          <Rows
            rows={detail.defects}
            empty="No defects reported."
            render={(defect) => (
              <Row
                key={defect._id}
                icon={AlertTriangle}
                title={defect.category}
                meta={`${humanise(defect.severity)} · ${humanise(defect.status)} · ${defect.safeToOperate ? "Safe" : "Unsafe"}`}
              />
            )}
          />
        </TabsContent>
        <TabsContent value="costs">
          <Rows
            rows={detail.costs}
            empty="No costs recorded."
            render={(cost) => (
              <Row
                key={cost._id}
                icon={CalendarClock}
                title={humanise(cost.category)}
                meta={`${formatCurrency(cost.amount)} · ${humanise(cost.approvalStatus)} · ${formatDate(cost.date)}`}
              />
            )}
          />
        </TabsContent>
        <TabsContent value="fuel">
          <Rows
            rows={detail.fuelLogs}
            empty="No fuel logs."
            render={(log) => (
              <Row
                key={log._id}
                icon={Fuel}
                title={`${log.litres} L`}
                meta={`${formatCurrency(log.cost)} · ${log.odometer.toLocaleString()} km · ${formatDate(log.date)}`}
              />
            )}
          />
        </TabsContent>
        <TabsContent value="documents">
          <Documents vehicleId={vehicle._id} detail={detail} />
        </TabsContent>
        <TabsContent value="reminders">
          <Rows
            rows={detail.reminders}
            empty="No reminders for this vehicle."
            render={(reminder) => (
              <Row
                key={reminder._id}
                icon={CalendarClock}
                title={reminder.title}
                meta={`${humanise(reminder.status)} · ${formatDate(reminder.dueAt)}`}
              />
            )}
          />
        </TabsContent>
        <TabsContent value="audit">
          <Rows
            rows={detail.auditLog}
            empty="No audit history."
            render={(entry) => (
              <Row
                key={entry._id}
                icon={History}
                title={humanise(entry.action)}
                meta={formatDateTime(entry.timestamp)}
              />
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Overview({ detail }: { detail: VehicleDetail }) {
  const { vehicle } = detail;
  const service = vehicle.compliance.service;
  const totalCost = detail.costs.reduce((sum, cost) => sum + cost.amount, 0);
  const totalFuel = detail.fuelLogs.reduce((sum, log) => sum + log.cost, 0);
  const rows: [string, React.ReactNode][] = [
    ["Status", <StatusBadge value={vehicle.status} />],
    ["Primary driver", vehicle.driverName ?? "-"],
    ["Odometer", `${vehicle.odometer.toLocaleString()} km`],
    ["Fuel", vehicle.fuelType ?? "-"],
    [
      "Registration expiry",
      statusLine(vehicle.regoExpiry, vehicle.compliance.rego),
    ],
    [
      "Insurance expiry",
      statusLine(vehicle.insuranceExpiry, vehicle.compliance.insurance),
    ],
    [
      "Inspection expiry",
      statusLine(vehicle.inspectionExpiry, vehicle.compliance.inspection),
    ],
    [
      "Roadworthy expiry",
      statusLine(vehicle.roadworthyExpiry, vehicle.compliance.roadworthy),
    ],
    ["Next service date", service.nextServiceDueDate ?? "-"],
    [
      "Next service odometer",
      service.nextServiceDueOdometer
        ? `${service.nextServiceDueOdometer.toLocaleString()} km`
        : "-",
    ],
    ["Days until service", service.daysUntilNextService ?? "-"],
    [
      "Distance until service",
      service.distanceUntilNextService !== undefined
        ? `${service.distanceUntilNextService.toLocaleString()} km`
        : "-",
    ],
    ["Open defects", vehicle.compliance.openDefectCount],
    ["Critical defects", vehicle.compliance.criticalDefectCount],
    ["Total cost", formatCurrency(totalCost)],
    ["Fuel spend", formatCurrency(totalFuel)],
  ];
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-md border border-hairline bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <p className="text-caption text-ink-quiet">{label}</p>
            <div className="mt-1 text-body text-ink">{value}</div>
          </div>
        ))}
      </section>
      {vehicle.notes && (
        <section className="rounded-md border border-hairline bg-surface p-4">
          <p className="text-caption text-ink-quiet">Notes</p>
          <p className="mt-1 text-body text-ink-soft">{vehicle.notes}</p>
        </section>
      )}
    </div>
  );
}

function Documents({
  vehicleId,
  detail,
}: {
  vehicleId: Id<"vehicles">;
  detail: VehicleDetail;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex justify-end">
        <DocumentDialog vehicleId={vehicleId} />
      </div>
      <Rows
        rows={detail.documents}
        empty="No documents uploaded."
        render={(doc) => (
          <Row
            key={doc._id}
            icon={FileUp}
            title={doc.documentType}
            meta={`${humanise(doc.renewalStatus)} · ${formatDate(doc.expiryDate)} · ${doc.fileName ?? "metadata only"}`}
          />
        )}
      />
    </section>
  );
}

function DocumentDialog({ vehicleId }: { vehicleId: Id<"vehicles"> }) {
  const addDocument = useMutation(api.fleet.addVehicleDocument);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const completeUpload = useAction(api.files.completeUpload);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [documentType, setDocumentType] = React.useState("Registration");
  const [expiryDate, setExpiryDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      let uploaded: { storageId: string; fileName: string } | undefined =
        undefined;
      if (file) {
        uploaded = await uploadDocumentFile(
          generateUploadUrl,
          completeUpload,
          file,
          {
            ownerType: "fleetVehicles",
            ownerId: String(vehicleId),
            purpose: "document",
          },
        );
      }
      await addDocument({
        vehicleId,
        documentType,
        storageId: uploaded?.storageId,
        fileName: uploaded?.fileName,
        expiryDate: expiryDate || undefined,
        notes: notes || undefined,
      });
      toastSuccess("Document saved.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not save document.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <FileUp className="h-4 w-4" />
          Document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add document</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Type">
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "Registration",
                  "Insurance",
                  "Inspection",
                  "Roadworthy",
                  "Lease",
                  "Other",
                ].map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Expiry date">
            <Input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </Field>
          <Field label="Upload">
            <Input
              type="file"
              accept={DOCUMENT_UPLOAD_ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
              {saving ? "Saving..." : "Save document"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditVehicleDialog({ vehicle }: { vehicle: VehicleDetail["vehicle"] }) {
  const update = useMutation(api.fleet.updateVehicle);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: vehicle.name,
    status: vehicle.status,
    odometer: String(vehicle.odometer),
    regoExpiry: vehicle.regoExpiry ?? "",
    insuranceExpiry: vehicle.insuranceExpiry ?? "",
    inspectionExpiry: vehicle.inspectionExpiry ?? "",
    notes: vehicle.notes ?? "",
  });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await update({
        vehicleId: vehicle._id,
        name: form.name,
        status: form.status as
          | "active"
          | "booked"
          | "in_maintenance"
          | "unavailable"
          | "retired"
          | "sold"
          | "written_off",
        odometer: Number(form.odometer),
        regoExpiry: form.regoExpiry || undefined,
        insuranceExpiry: form.insuranceExpiry || undefined,
        inspectionExpiry: form.inspectionExpiry || undefined,
        notes: form.notes,
      });
      toastSuccess("Vehicle updated.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not update vehicle.");
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit vehicle</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onValueChange={(status) =>
                setForm({
                  ...form,
                  status: status as (typeof VEHICLE_STATUSES)[number],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {humanise(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Odometer">
            <Input
              type="number"
              value={form.odometer}
              onChange={(e) => setForm({ ...form, odometer: e.target.value })}
            />
          </Field>
          <Field label="Rego expiry">
            <Input
              type="date"
              value={form.regoExpiry}
              onChange={(e) => setForm({ ...form, regoExpiry: e.target.value })}
            />
          </Field>
          <Field label="Insurance expiry">
            <Input
              type="date"
              value={form.insuranceExpiry}
              onChange={(e) =>
                setForm({ ...form, insuranceExpiry: e.target.value })
              }
            />
          </Field>
          <Field label="Inspection expiry">
            <Input
              type="date"
              value={form.inspectionExpiry}
              onChange={(e) =>
                setForm({ ...form, inspectionExpiry: e.target.value })
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
            <Button type="submit">Save vehicle</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Rows<T>({
  rows,
  empty,
  render,
}: {
  rows: T[];
  empty: string;
  render: (row: T) => React.ReactNode;
}) {
  if (rows.length === 0)
    return <p className="py-8 text-center text-body text-ink-quiet">{empty}</p>;
  return <div className="grid gap-2">{rows.map(render)}</div>;
}

function Row({
  icon: Icon,
  title,
  meta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-hairline bg-surface px-3 py-2.5">
      <Icon className="h-4 w-4 text-ink-quiet" />
      <div className="min-w-0">
        <p className="truncate text-body-strong text-ink-strong">{title}</p>
        <p className="text-caption text-ink-quiet">{meta}</p>
      </div>
    </div>
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

function statusLine(date: string | undefined, status: string) {
  return (
    <span className="inline-flex items-center gap-2">
      {date ?? "-"}
      <StatusBadge value={status} />
    </span>
  );
}

function StatusBadge({ value }: { value?: string }) {
  const variant =
    value?.includes("expired") ||
    value === "critical" ||
    value === "unavailable" ||
    value === "overdue" ||
    value === "suspended"
      ? "destructive"
      : value?.includes("due") ||
          value === "booked" ||
          value === "in_maintenance" ||
          value === "high" ||
          value === "medium"
        ? "warning"
        : value === "active" ||
            value === "completed" ||
            value === "approved" ||
            value === "current" ||
            value === "ok"
          ? "success"
          : "muted";
  return <Badge variant={variant}>{humanise(value ?? "unknown")}</Badge>;
}
