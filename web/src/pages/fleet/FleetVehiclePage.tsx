import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Plus,
  ClipboardCheck,
  AlertTriangle,
  Wrench,
  CalendarClock,
  Trash2,
  Check,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { AssetCustomFields } from "@/components/assets/AssetCustomFields";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { formatDate, humanise } from "@/lib/utils";

type Severity = "minor" | "major" | "critical";
type MaintStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

const SEVERITY_VARIANT: Record<Severity, "muted" | "warning" | "destructive"> =
  {
    minor: "muted",
    major: "warning",
    critical: "destructive",
  };
const MAINT_VARIANT: Record<
  MaintStatus,
  "info" | "warning" | "success" | "muted"
> = {
  scheduled: "info",
  in_progress: "warning",
  completed: "success",
  cancelled: "muted",
};
const FLAG_LABEL: Record<string, { label: string; variant: string }> = {
  out_of_service: { label: "Out of service", variant: "destructive" },
  defect: { label: "Open defect", variant: "warning" },
  overdue_service: { label: "Service overdue", variant: "warning" },
  expiring_docs: { label: "Docs expiring", variant: "info" },
  ok: { label: "Roadworthy", variant: "success" },
};
const ASSET_TYPES = [
  "vehicle",
  "trailer",
  "plant",
  "equipment",
  "bin",
  "container",
  "tool",
  "device",
  "other",
];

export default function FleetVehiclePage() {
  const { assetId } = useParams<{ assetId: string }>();
  const { hasCapability } = useGatherHub();
  const data = useQuery(
    api.fleet.vehicle,
    assetId ? { assetId: assetId as Id<"assets"> } : "skip",
  );
  const canManage = hasCapability("fleet.manage");
  const canInspect = hasCapability("fleet.inspect");

  if (data === undefined) return <LoadingState />;
  if (data === null)
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Not found"
        description="This fleet asset doesn't exist or you can't access it."
        action={
          <Button asChild>
            <Link to="/fleet">Back to fleet</Link>
          </Button>
        }
      />
    );

  const { asset, compliance, inspections, defects, maintenance, serviceRules } =
    data;
  const id = asset._id;
  const flag = FLAG_LABEL[compliance.flag] ?? FLAG_LABEL.ok!;

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
        title={asset.name}
        description={`${humanise(asset.assetType ?? "asset")}${asset.registration ? ` · ${asset.registration}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={flag.variant as "success"}>{flag.label}</Badge>
            {canManage && <EditFleetDetailsDialog asset={asset} />}
          </div>
        }
      />

      {compliance.alerts.length > 0 && (
        <div className="mb-5 rounded-md border border-warning/40 bg-warning-wash px-4 py-3">
          <p className="text-body-strong text-ink-strong">Attention</p>
          <ul className="mt-1 list-disc pl-5 text-caption text-ink-soft">
            {compliance.alerts.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6">
        <DetailGrid asset={asset} />

        <AssetCustomFields
          assetId={asset._id}
          category={asset.category}
          assetType={asset.assetType}
          attributes={asset.attributes}
          canEdit={hasCapability("assets.admin")}
        />

        <Section
          title="Defects"
          icon={AlertTriangle}
          action={canInspect ? <ReportDefectDialog assetId={id} /> : undefined}
        >
          {defects.length === 0 ? (
            <Empty>No defects reported.</Empty>
          ) : (
            <div className="grid gap-2">
              {defects.map((d) => (
                <div
                  key={d._id}
                  className="rounded-sm border border-hairline bg-surface px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={SEVERITY_VARIANT[d.severity]}>
                        {d.severity}
                      </Badge>
                      <span className="text-body-strong text-ink-strong">
                        {d.title}
                      </span>
                      {d.blocksAssignment && d.status !== "resolved" && (
                        <Badge variant="destructive">Blocks assignment</Badge>
                      )}
                      <Badge
                        variant={d.status === "resolved" ? "success" : "muted"}
                      >
                        {humanise(d.status)}
                      </Badge>
                    </div>
                    {canManage && d.status !== "resolved" && (
                      <ResolveDefectButton defectId={d._id} />
                    )}
                  </div>
                  {d.description && (
                    <p className="mt-1 text-caption text-ink-soft">
                      {d.description}
                    </p>
                  )}
                  <p className="mt-1 text-caption text-ink-quiet">
                    Reported {formatDate(d.reportedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Inspections"
          icon={ClipboardCheck}
          action={
            canInspect ? <RecordInspectionDialog assetId={id} /> : undefined
          }
        >
          {inspections.length === 0 ? (
            <Empty>No inspections recorded.</Empty>
          ) : (
            <div className="grid gap-2">
              {inspections.map((insp) => (
                <div
                  key={insp._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-hairline bg-surface px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="muted">{humanise(insp.type)}</Badge>
                    <Badge
                      variant={
                        insp.result === "fail"
                          ? "destructive"
                          : insp.result === "pass_with_defects"
                            ? "warning"
                            : "success"
                      }
                    >
                      {humanise(insp.result)}
                    </Badge>
                    {insp.odometer !== undefined && (
                      <span className="text-caption text-ink-quiet">
                        {insp.odometer.toLocaleString()} km
                      </span>
                    )}
                  </div>
                  <span className="text-caption text-ink-quiet">
                    {formatDate(insp.performedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Maintenance"
          icon={Wrench}
          action={
            canManage ? <ScheduleMaintenanceDialog assetId={id} /> : undefined
          }
        >
          {maintenance.length === 0 ? (
            <Empty>No maintenance scheduled.</Empty>
          ) : (
            <div className="grid gap-2">
              {maintenance.map((m) => (
                <div
                  key={m._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-hairline bg-surface px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={MAINT_VARIANT[m.status]}>
                      {humanise(m.status)}
                    </Badge>
                    <span className="text-body-strong text-ink-strong">
                      {m.title}
                    </span>
                    <Badge variant="muted">{humanise(m.kind)}</Badge>
                    {m.scheduledFor && (
                      <span className="text-caption text-ink-quiet">
                        {formatDate(m.scheduledFor)}
                      </span>
                    )}
                  </div>
                  {canManage &&
                    m.status !== "completed" &&
                    m.status !== "cancelled" && (
                      <MaintenanceActions maintenanceId={m._id} />
                    )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Service schedule"
          icon={CalendarClock}
          action={canManage ? <ServiceRuleDialog assetId={id} /> : undefined}
        >
          {serviceRules.length === 0 ? (
            <Empty>No recurring service rules.</Empty>
          ) : (
            <div className="grid gap-2">
              {serviceRules.map((r) => (
                <div
                  key={r._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-hairline bg-surface px-3 py-2"
                >
                  <div>
                    <span className="text-body-strong text-ink-strong">
                      {r.label}
                    </span>
                    <p className="text-caption text-ink-quiet">
                      {[
                        r.intervalDays ? `every ${r.intervalDays} days` : null,
                        r.intervalKm ? `every ${r.intervalKm} km` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "no interval set"}
                    </p>
                  </div>
                  {canManage && <RemoveRuleButton ruleId={r._id} />}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

// --- Detail grid ------------------------------------------------------------

function DetailGrid({
  asset,
}: {
  asset: {
    registration?: string;
    registrationExpiry?: string;
    insuranceExpiry?: string;
    inspectionExpiry?: string;
    odometer?: number;
    odometerUnit?: string;
    engineHours?: number;
    fuelType?: string;
    homeDepot?: string;
    assignedDriverName?: string | null;
    nextServiceDate?: string;
    nextServiceOdometer?: number;
  };
}) {
  const rows: [string, string | null][] = [
    ["Registration", asset.registration ?? null],
    ["Registration expiry", asset.registrationExpiry ?? null],
    ["Insurance expiry", asset.insuranceExpiry ?? null],
    ["Inspection due", asset.inspectionExpiry ?? null],
    [
      "Odometer",
      asset.odometer !== undefined
        ? `${asset.odometer.toLocaleString()} ${asset.odometerUnit ?? "km"}`
        : null,
    ],
    [
      "Engine hours",
      asset.engineHours !== undefined ? String(asset.engineHours) : null,
    ],
    ["Fuel", asset.fuelType ?? null],
    ["Home depot", asset.homeDepot ?? null],
    ["Assigned driver", asset.assignedDriverName ?? null],
    ["Next service", asset.nextServiceDate ?? null],
    [
      "Next service at",
      asset.nextServiceOdometer !== undefined
        ? `${asset.nextServiceOdometer.toLocaleString()} km`
        : null,
    ],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-hairline bg-surface px-4 py-3 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <p className="text-caption text-ink-quiet">{label}</p>
          <p className="text-body text-ink">{value ?? "—"}</p>
        </div>
      ))}
    </div>
  );
}

// --- Layout helpers ---------------------------------------------------------

function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-body-strong text-ink-strong">
          <Icon className="h-4 w-4 text-ink-quiet" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-caption text-ink-quiet">{children}</p>;
}

// --- Dialogs / actions ------------------------------------------------------

function EditFleetDetailsDialog({
  asset,
}: {
  asset: {
    _id: Id<"assets">;
    assetType?: string;
    registration?: string;
    registrationExpiry?: string;
    insuranceExpiry?: string;
    inspectionExpiry?: string;
    odometer?: number;
    odometerUnit?: string;
    engineHours?: number;
    fuelType?: string;
    homeDepot?: string;
    assignedDriverMemberId?: Id<"members">;
  };
}) {
  const setMeta = useMutation(api.fleet.setFleetMeta);
  const members = useQuery(api.members.list, { status: "active" });
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    assetType: asset.assetType ?? "vehicle",
    registration: asset.registration ?? "",
    registrationExpiry: asset.registrationExpiry ?? "",
    insuranceExpiry: asset.insuranceExpiry ?? "",
    inspectionExpiry: asset.inspectionExpiry ?? "",
    odometer: asset.odometer?.toString() ?? "",
    odometerUnit: asset.odometerUnit ?? "km",
    engineHours: asset.engineHours?.toString() ?? "",
    fuelType: asset.fuelType ?? "",
    homeDepot: asset.homeDepot ?? "",
    assignedDriverMemberId: asset.assignedDriverMemberId ?? "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await setMeta({
        assetId: asset._id,
        assetType: form.assetType as "vehicle",
        registration: form.registration,
        registrationExpiry: form.registrationExpiry,
        insuranceExpiry: form.insuranceExpiry,
        inspectionExpiry: form.inspectionExpiry,
        odometer: form.odometer ? Number(form.odometer) : undefined,
        odometerUnit: form.odometerUnit,
        engineHours: form.engineHours ? Number(form.engineHours) : undefined,
        fuelType: form.fuelType,
        homeDepot: form.homeDepot,
        assignedDriverMemberId:
          (form.assignedDriverMemberId as Id<"members">) || null,
      });
      toastSuccess("Fleet details saved.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not save fleet details.");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" />
          Edit details
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fleet details</DialogTitle>
          <DialogDescription>
            Compliance metadata for this asset.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select
              value={form.assetType}
              onValueChange={(v) => set("assetType", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {humanise(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Registration">
            <Input
              value={form.registration}
              onChange={(e) => set("registration", e.target.value)}
            />
          </Field>
          <Field label="Registration expiry">
            <Input
              type="date"
              value={form.registrationExpiry}
              onChange={(e) => set("registrationExpiry", e.target.value)}
            />
          </Field>
          <Field label="Insurance expiry">
            <Input
              type="date"
              value={form.insuranceExpiry}
              onChange={(e) => set("insuranceExpiry", e.target.value)}
            />
          </Field>
          <Field label="Inspection due">
            <Input
              type="date"
              value={form.inspectionExpiry}
              onChange={(e) => set("inspectionExpiry", e.target.value)}
            />
          </Field>
          <Field label="Odometer">
            <Input
              type="number"
              value={form.odometer}
              onChange={(e) => set("odometer", e.target.value)}
            />
          </Field>
          <Field label="Engine hours">
            <Input
              type="number"
              value={form.engineHours}
              onChange={(e) => set("engineHours", e.target.value)}
            />
          </Field>
          <Field label="Fuel">
            <Input
              value={form.fuelType}
              onChange={(e) => set("fuelType", e.target.value)}
            />
          </Field>
          <Field label="Home depot">
            <Input
              value={form.homeDepot}
              onChange={(e) => set("homeDepot", e.target.value)}
            />
          </Field>
          <Field label="Assigned driver">
            <Select
              value={form.assignedDriverMemberId || "none"}
              onValueChange={(v) =>
                set("assignedDriverMemberId", v === "none" ? "" : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {(members ?? []).map((m) => (
                  <SelectItem key={m._id} value={m._id}>
                    {m.firstName} {m.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type InlineDefect = { title: string; severity: Severity };

function RecordInspectionDialog({ assetId }: { assetId: Id<"assets"> }) {
  const record = useMutation(api.fleet.recordInspection);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [type, setType] = React.useState("pre_start");
  const [result, setResult] = React.useState("pass");
  const [odometer, setOdometer] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [defects, setDefects] = React.useState<InlineDefect[]>([]);
  const [draft, setDraft] = React.useState<InlineDefect>({
    title: "",
    severity: "major",
  });

  function reset() {
    setType("pre_start");
    setResult("pass");
    setOdometer("");
    setNotes("");
    setDefects([]);
    setDraft({ title: "", severity: "major" });
  }

  function addDefect() {
    if (!draft.title.trim()) return;
    setDefects((d) => [...d, { ...draft, title: draft.title.trim() }]);
    setDraft({ title: "", severity: "major" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await record({
        assetId,
        type: type as "pre_start",
        result: result as "pass",
        odometer: odometer ? Number(odometer) : undefined,
        notes: notes || undefined,
        defects: defects.length ? defects : undefined,
      });
      toastSuccess("Inspection recorded.");
      reset();
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not record inspection.");
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
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Record inspection
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record inspection</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_start">Pre-start</SelectItem>
                  <SelectItem value="periodic">Periodic</SelectItem>
                  <SelectItem value="return">Return</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Result">
              <Select value={result} onValueChange={setResult}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pass">Pass</SelectItem>
                  <SelectItem value="pass_with_defects">
                    Pass with defects
                  </SelectItem>
                  <SelectItem value="fail">Fail</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Odometer">
            <Input
              type="number"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <div className="rounded-sm border border-hairline p-3">
            <p className="mb-2 text-caption text-ink-quiet">
              Defects ({defects.length})
            </p>
            {defects.map((d, i) => (
              <div
                key={i}
                className="mb-1 flex items-center justify-between gap-2 text-caption"
              >
                <span>
                  <Badge variant={SEVERITY_VARIANT[d.severity]}>
                    {d.severity}
                  </Badge>{" "}
                  {d.title}
                </span>
                <button
                  type="button"
                  className="text-ink-quiet hover:text-danger"
                  onClick={() =>
                    setDefects((arr) => arr.filter((_, idx) => idx !== i))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="mt-2 flex items-end gap-2">
              <Input
                placeholder="Defect"
                value={draft.title}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, title: e.target.value }))
                }
              />
              <Select
                value={draft.severity}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, severity: v as Severity }))
                }
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor">Minor</SelectItem>
                  <SelectItem value="major">Major</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={addDefect}>
                Add
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReportDefectDialog({ assetId }: { assetId: Id<"assets"> }) {
  const report = useMutation(api.fleet.reportDefect);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [severity, setSeverity] = React.useState<Severity>("major");
  const [description, setDescription] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await report({
        assetId,
        severity,
        title: title.trim(),
        description: description || undefined,
      });
      toastSuccess("Defect reported.");
      setTitle("");
      setDescription("");
      setSeverity("major");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not report defect.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" />
          Report defect
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report defect</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Defect">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Severity">
            <Select
              value={severity}
              onValueChange={(v) => setSeverity(v as Severity)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minor">Minor</SelectItem>
                <SelectItem value="major">Major (blocks assignment)</SelectItem>
                <SelectItem value="critical">
                  Critical (blocks assignment)
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Description">
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Saving…" : "Report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDefectButton({ defectId }: { defectId: Id<"assetDefects"> }) {
  const resolve = useMutation(api.fleet.resolveDefect);
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await resolve({ defectId });
          toastSuccess("Defect resolved.");
        } catch (err) {
          toastFailure(err, "Could not resolve defect.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Check className="h-4 w-4" />
      Resolve
    </Button>
  );
}

function ScheduleMaintenanceDialog({ assetId }: { assetId: Id<"assets"> }) {
  const schedule = useMutation(api.fleet.scheduleMaintenance);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState("service");
  const [scheduledFor, setScheduledFor] = React.useState("");
  const [notes, setNotes] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await schedule({
        assetId,
        title: title.trim(),
        kind: kind as "service",
        scheduledFor: scheduledFor || undefined,
        notes: notes || undefined,
      });
      toastSuccess("Maintenance scheduled.");
      setTitle("");
      setScheduledFor("");
      setNotes("");
      setKind("service");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not schedule maintenance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Schedule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule maintenance</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="repair">Repair</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Scheduled for">
              <Input
                type="date"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Saving…" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceActions({
  maintenanceId,
}: {
  maintenanceId: Id<"maintenanceJobs">;
}) {
  const update = useMutation(api.fleet.updateMaintenance);
  const [busy, setBusy] = React.useState(false);
  async function go(status: "completed" | "cancelled") {
    setBusy(true);
    try {
      await update({ maintenanceId, status });
      toastSuccess(status === "completed" ? "Completed." : "Cancelled.");
    } catch (err) {
      toastFailure(err, "Could not update maintenance.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => go("completed")}
      >
        Complete
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => go("cancelled")}
      >
        Cancel
      </Button>
    </div>
  );
}

function ServiceRuleDialog({ assetId }: { assetId: Id<"assets"> }) {
  const upsert = useMutation(api.fleet.upsertServiceRule);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [intervalDays, setIntervalDays] = React.useState("");
  const [intervalKm, setIntervalKm] = React.useState("");
  const [lastServiceDate, setLastServiceDate] = React.useState("");
  const [lastServiceOdometer, setLastServiceOdometer] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    try {
      await upsert({
        assetId,
        label: label.trim(),
        intervalDays: intervalDays ? Number(intervalDays) : undefined,
        intervalKm: intervalKm ? Number(intervalKm) : undefined,
        lastServiceDate: lastServiceDate || undefined,
        lastServiceOdometer: lastServiceOdometer
          ? Number(lastServiceOdometer)
          : undefined,
      });
      toastSuccess("Service rule saved.");
      setOpen(false);
      setLabel("");
      setIntervalDays("");
      setIntervalKm("");
      setLastServiceDate("");
      setLastServiceOdometer("");
    } catch (err) {
      toastFailure(err, "Could not save service rule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Add rule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Service rule</DialogTitle>
          <DialogDescription>
            Recurring service by time and/or distance.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Every (days)">
              <Input
                type="number"
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
              />
            </Field>
            <Field label="Every (km)">
              <Input
                type="number"
                value={intervalKm}
                onChange={(e) => setIntervalKm(e.target.value)}
              />
            </Field>
            <Field label="Last service date">
              <Input
                type="date"
                value={lastServiceDate}
                onChange={(e) => setLastServiceDate(e.target.value)}
              />
            </Field>
            <Field label="Last service odometer">
              <Input
                type="number"
                value={lastServiceOdometer}
                onChange={(e) => setLastServiceOdometer(e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !label.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveRuleButton({ ruleId }: { ruleId: Id<"fleetServiceRules"> }) {
  const remove = useMutation(api.fleet.removeServiceRule);
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      type="button"
      className="text-ink-quiet hover:text-danger"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await remove({ ruleId });
        } catch (err) {
          toastFailure(err, "Could not remove rule.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-caption text-ink-quiet">{label}</Label>
      {children}
    </div>
  );
}
