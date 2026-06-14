import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  Download,
  Fuel,
  Gauge,
  Plus,
  Route,
  ShieldAlert,
  Truck,
  Wrench,
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
import {
  downloadCsv,
  formatCurrency,
  formatDate,
  formatDateTime,
  humanise,
  toCsv,
} from "@/lib/utils";
import { fleetLabel, moduleEnabled } from "@/lib/verticals";

type Dashboard = NonNullable<
  ReturnType<typeof useQuery<typeof api.fleet.operationsDashboard>>
>;
type VehicleRow = Dashboard["vehicles"][number];
type DriverRow = Dashboard["drivers"][number];
type JobRow = Dashboard["jobs"][number];
type ProjectRow = Dashboard["projects"][number];
type MaintenanceRow = Dashboard["maintenance"][number];
type DefectRow = Dashboard["defects"][number];
type CostRow = Dashboard["costs"][number];
type ReferenceData = NonNullable<
  ReturnType<typeof useQuery<typeof api.fleet.referenceData>>
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
const DRIVER_STATUSES = [
  "active",
  "pending_approval",
  "suspended",
  "expired_documents",
  "inactive",
] as const;
const JOB_TYPES = [
  "delivery",
  "pickup",
  "transport",
  "school_run",
  "excursion",
  "community_transport",
  "field_visit",
  "work_order",
  "asset_movement",
  "maintenance_run",
  "custom",
] as const;
const MAINTENANCE_TYPES = [
  "scheduled_service",
  "unscheduled_repair",
  "defect_repair",
  "inspection",
  "roadworthy",
  "tyres",
  "brakes",
  "fluids",
  "battery",
  "cleaning",
  "safety_equipment",
  "other",
] as const;
const COST_CATEGORIES = [
  "fuel",
  "maintenance",
  "registration",
  "insurance",
  "tolls",
  "parking",
  "fines",
  "repairs",
  "cleaning",
  "lease_finance",
  "driver_labour",
  "contractor",
  "job_expense",
  "project_expense",
  "other",
] as const;

export default function FleetPage() {
  const { org, hasCapability } = useGatherHub();
  const fleetEnabled = moduleEnabled(org, "fleet");
  const dashboard = useQuery(
    api.fleet.operationsDashboard,
    fleetEnabled ? {} : "skip",
  );
  const references = useQuery(
    api.fleet.referenceData,
    fleetEnabled ? {} : "skip",
  );
  const exportData = useQuery(
    api.fleet.exportData,
    fleetEnabled &&
      (hasCapability("fleet.export") ||
        hasCapability("reports.export") ||
        hasCapability("fleet.manage"))
      ? {}
      : "skip",
  );
  const generateReminders = useMutation(api.fleet.generateReminders);

  const labels = {
    vehicles: fleetLabel(org, "vehicles", "Vehicles"),
    drivers: fleetLabel(org, "drivers", "Drivers"),
    jobs: fleetLabel(org, "jobs", "Jobs"),
    projects: fleetLabel(org, "projects", "Projects"),
    depots: fleetLabel(org, "depots", "Depots"),
    costs: fleetLabel(org, "costs", "Costs"),
  };

  if (!fleetEnabled) {
    return (
      <EmptyState
        icon={Truck}
        title="Fleet is off"
        description="Enable Fleet Management in Settings to manage vehicles, drivers, jobs, compliance, reminders, costs, and driver workflows."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  if (dashboard === undefined || references === undefined) {
    return <LoadingState />;
  }

  async function refreshReminders() {
    try {
      const result = await generateReminders({});
      toastSuccess(`Reminders refreshed (${result.created} new).`);
    } catch (err) {
      toastFailure(err, "Could not refresh reminders.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Fleet"
        description="Vehicles, drivers, compliance, jobs, maintenance, costs, reminders, and mobile driver workflows."
        actions={
          <>
            <Button variant="outline" onClick={refreshReminders}>
              <Bell className="h-4 w-4" />
              Refresh reminders
            </Button>
            {hasCapability("fleet.vehicles.manage") ||
            hasCapability("fleet.manage") ? (
              <VehicleDialog references={references} />
            ) : null}
          </>
        }
      />

      <Tabs defaultValue="dashboard">
        <TabsList className="mb-5">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="vehicles">{labels.vehicles}</TabsTrigger>
          <TabsTrigger value="drivers">{labels.drivers}</TabsTrigger>
          <TabsTrigger value="jobs">{labels.jobs}</TabsTrigger>
          <TabsTrigger value="projects">{labels.projects}</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="defects">Defects</TabsTrigger>
          <TabsTrigger value="costs">{labels.costs}</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="driver">Driver portal</TabsTrigger>
          <TabsTrigger value="exports">Exports</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab dashboard={dashboard} labels={labels} />
        </TabsContent>
        <TabsContent value="vehicles">
          <VehiclesTab dashboard={dashboard} references={references} />
        </TabsContent>
        <TabsContent value="drivers">
          <DriversTab dashboard={dashboard} references={references} />
        </TabsContent>
        <TabsContent value="jobs">
          <JobsTab dashboard={dashboard} references={references} />
        </TabsContent>
        <TabsContent value="projects">
          <ProjectsTab dashboard={dashboard} />
        </TabsContent>
        <TabsContent value="maintenance">
          <MaintenanceTab dashboard={dashboard} references={references} />
        </TabsContent>
        <TabsContent value="defects">
          <DefectsTab dashboard={dashboard} references={references} />
        </TabsContent>
        <TabsContent value="costs">
          <CostsTab dashboard={dashboard} references={references} />
        </TabsContent>
        <TabsContent value="calendar">
          <CalendarTab dashboard={dashboard} />
        </TabsContent>
        <TabsContent value="driver">
          <DriverPortalTab references={references} />
        </TabsContent>
        <TabsContent value="exports">
          <ExportsTab data={exportData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DashboardTab({
  dashboard,
  labels,
}: {
  dashboard: Dashboard;
  labels: Record<string, string>;
}) {
  const stats = dashboard.counts;
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Metric
          label={`Total ${labels.vehicles}`}
          value={stats.totalVehicles}
          icon={Truck}
        />
        <Metric
          label="Active"
          value={stats.activeVehicles}
          icon={CheckCircle2}
          tone="success"
        />
        <Metric
          label="Unavailable"
          value={stats.unavailableVehicles}
          icon={ShieldAlert}
          tone="danger"
        />
        <Metric
          label="In maintenance"
          value={stats.vehiclesInMaintenance}
          icon={Wrench}
          tone="warning"
        />
        <Metric
          label="Rego soon"
          value={stats.regoExpiringSoon}
          icon={CalendarDays}
          tone="warning"
        />
        <Metric
          label="Rego expired"
          value={stats.regoExpired}
          icon={AlertTriangle}
          tone="danger"
        />
        <Metric
          label="Insurance soon"
          value={stats.insuranceExpiringSoon}
          icon={ShieldAlert}
          tone="warning"
        />
        <Metric
          label="Services soon"
          value={stats.servicesDueSoon}
          icon={Gauge}
          tone="warning"
        />
        <Metric
          label="Services overdue"
          value={stats.servicesOverdue}
          icon={AlertTriangle}
          tone="danger"
        />
        <Metric
          label="Open defects"
          value={stats.openDefects}
          icon={AlertTriangle}
          tone="warning"
        />
        <Metric
          label="Critical defects"
          value={stats.criticalDefects}
          icon={ShieldAlert}
          tone="danger"
        />
        <Metric label="Active jobs" value={stats.activeJobs} icon={Route} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="Utilisation">
          <div className="grid grid-cols-3 gap-3">
            <ProgressMetric
              label="Fleet"
              value={dashboard.utilisation.fleetUtilisation}
            />
            <ProgressMetric
              label="Vehicle"
              value={dashboard.utilisation.vehicleUtilisation}
            />
            <ProgressMetric
              label="Driver"
              value={dashboard.utilisation.driverUtilisation}
            />
          </div>
        </Panel>
        <Panel title="Cost summary">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniStat
              label="Monthly costs"
              value={formatCurrency(dashboard.costSummary.totalCosts)}
            />
            <MiniStat
              label="Cost per km"
              value={formatCurrency(dashboard.costSummary.costPerKm)}
            />
            <MiniStat
              label="Maintenance"
              value={formatCurrency(dashboard.costSummary.maintenanceSpend)}
            />
            <MiniStat
              label="Fuel"
              value={formatCurrency(dashboard.costSummary.fuelSpend)}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Upcoming reminders">
          {dashboard.reminders.length === 0 ? (
            <EmptyLine>No reminders due.</EmptyLine>
          ) : (
            <div className="divide-y divide-hairline">
              {dashboard.reminders.slice(0, 10).map((reminder) => (
                <div
                  key={reminder._id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div>
                    <p className="text-body-strong text-ink-strong">
                      {reminder.title}
                    </p>
                    <p className="text-caption text-ink-quiet">
                      {formatDate(reminder.dueAt)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      reminder.status === "overdue" ? "destructive" : "warning"
                    }
                  >
                    {humanise(reminder.status)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Vehicles needing attention">
          {dashboard.vehicles.filter((v) => v.compliance.warnings.length > 0)
            .length === 0 ? (
            <EmptyLine>No vehicle compliance warnings.</EmptyLine>
          ) : (
            <div className="grid gap-2">
              {dashboard.vehicles
                .filter((v) => v.compliance.warnings.length > 0)
                .slice(0, 8)
                .map((vehicle) => (
                  <Link
                    key={vehicle._id}
                    to={`/fleet/vehicles/${vehicle._id}`}
                    className="rounded-sm border border-hairline bg-surface px-3 py-2 hover:border-border"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-body-strong text-ink-strong">
                        {vehicle.name}
                      </span>
                      <Badge variant="warning">
                        {vehicle.compliance.warnings.length}
                      </Badge>
                    </div>
                    <p className="mt-1 text-caption text-ink-quiet">
                      {vehicle.compliance.warnings.join(" · ")}
                    </p>
                  </Link>
                ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function VehiclesTab({
  dashboard,
  references,
}: {
  dashboard: Dashboard;
  references: ReferenceData;
}) {
  const columns = React.useMemo<ColumnDef<VehicleRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Vehicle",
        cell: ({ row }) => (
          <Link
            to={`/fleet/vehicles/${row.original._id}`}
            className="font-semi text-ink-strong hover:text-primary"
          >
            {row.original.name}
          </Link>
        ),
      },
      { accessorKey: "registrationNumber", header: "Registration" },
      { accessorKey: "vehicleType", header: "Type" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
      },
      {
        id: "service",
        header: "Service",
        cell: ({ row }) => (
          <StatusBadge value={row.original.compliance.service.state} />
        ),
      },
      { accessorKey: "driverName", header: "Primary driver" },
      {
        id: "rego",
        header: "Rego",
        cell: ({ row }) => <StatusBadge value={row.original.compliance.rego} />,
      },
    ],
    [],
  );
  return (
    <DataTable
      data={dashboard.vehicles}
      columns={columns}
      searchPlaceholder="Search vehicles"
      toolbar={<VehicleDialog references={references} variant="outline" />}
    />
  );
}

function DriversTab({
  dashboard,
  references,
}: {
  dashboard: Dashboard;
  references: ReferenceData;
}) {
  const columns = React.useMemo<ColumnDef<DriverRow>[]>(
    () => [
      { accessorKey: "name", header: "Driver" },
      { accessorKey: "email", header: "Email" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
      },
      { accessorKey: "licenceExpiry", header: "Licence expiry" },
      { accessorKey: "workingWithChildrenCheckExpiry", header: "WWCC expiry" },
      {
        id: "approved",
        header: "Vehicle types",
        cell: ({ row }) =>
          row.original.approvedVehicleTypes.join(", ") || "Any",
      },
    ],
    [],
  );
  return (
    <DataTable
      data={dashboard.drivers}
      columns={columns}
      searchPlaceholder="Search drivers"
      toolbar={<DriverDialog references={references} />}
    />
  );
}

function JobsTab({
  dashboard,
  references,
}: {
  dashboard: Dashboard;
  references: ReferenceData;
}) {
  const columns = React.useMemo<ColumnDef<JobRow>[]>(
    () => [
      { accessorKey: "title", header: "Job" },
      { accessorKey: "referenceNumber", header: "Reference" },
      {
        id: "time",
        header: "Time",
        cell: ({ row }) => formatDateTime(row.original.startDateTime),
      },
      {
        id: "vehicle",
        header: "Vehicle",
        cell: ({ row }) =>
          references.vehicles.find(
            (v) => v._id === row.original.assignedVehicleId,
          )?.name ?? "Unassigned",
      },
      {
        id: "driver",
        header: "Driver",
        cell: ({ row }) =>
          references.drivers.find(
            (d) => d._id === row.original.assignedDriverId,
          )?.name ?? "Unassigned",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
      },
    ],
    [references],
  );
  return (
    <DataTable
      data={dashboard.jobs}
      columns={columns}
      searchPlaceholder="Search jobs"
      toolbar={<JobDialog references={references} />}
    />
  );
}

function ProjectsTab({ dashboard }: { dashboard: Dashboard }) {
  const columns = React.useMemo<ColumnDef<ProjectRow>[]>(
    () => [
      { accessorKey: "name", header: "Project" },
      { accessorKey: "clientName", header: "Client" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
      },
      {
        accessorKey: "budget",
        header: "Budget",
        cell: ({ row }) => formatCurrency(row.original.budget),
        meta: { numeric: true },
      },
      {
        id: "actual",
        header: "Actual cost",
        cell: ({ row }) =>
          formatCurrency(
            dashboard.costs
              .filter((cost) => cost.projectId === row.original._id)
              .reduce((sum, cost) => sum + cost.amount, 0),
          ),
        meta: { numeric: true },
      },
    ],
    [dashboard.costs],
  );
  return (
    <DataTable
      data={dashboard.projects}
      columns={columns}
      searchPlaceholder="Search projects"
      toolbar={<ProjectDialog />}
    />
  );
}

function MaintenanceTab({
  dashboard,
  references,
}: {
  dashboard: Dashboard;
  references: ReferenceData;
}) {
  const columns = React.useMemo<ColumnDef<MaintenanceRow>[]>(
    () => [
      {
        id: "vehicle",
        header: "Vehicle",
        cell: ({ row }) =>
          references.vehicles.find((v) => v._id === row.original.vehicleId)
            ?.name ?? "Vehicle",
      },
      { accessorKey: "description", header: "Description" },
      {
        accessorKey: "maintenanceType",
        header: "Type",
        cell: ({ row }) => humanise(row.original.maintenanceType),
      },
      { accessorKey: "scheduledDate", header: "Scheduled" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
      },
      {
        accessorKey: "totalCost",
        header: "Cost",
        cell: ({ row }) => formatCurrency(row.original.totalCost),
        meta: { numeric: true },
      },
    ],
    [references.vehicles],
  );
  return (
    <DataTable
      data={dashboard.maintenance}
      columns={columns}
      searchPlaceholder="Search maintenance"
      toolbar={<MaintenanceDialog references={references} />}
    />
  );
}

function DefectsTab({
  dashboard,
  references,
}: {
  dashboard: Dashboard;
  references: ReferenceData;
}) {
  const columns = React.useMemo<ColumnDef<DefectRow>[]>(
    () => [
      {
        id: "vehicle",
        header: "Vehicle",
        cell: ({ row }) =>
          references.vehicles.find((v) => v._id === row.original.vehicleId)
            ?.name ?? "Vehicle",
      },
      { accessorKey: "category", header: "Category" },
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ row }) => <StatusBadge value={row.original.severity} />,
      },
      {
        accessorKey: "safeToOperate",
        header: "Safe",
        cell: ({ row }) => (row.original.safeToOperate ? "Yes" : "No"),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
      },
      {
        accessorKey: "dateTime",
        header: "Reported",
        cell: ({ row }) => formatDateTime(row.original.dateTime),
      },
    ],
    [references.vehicles],
  );
  return (
    <DataTable
      data={dashboard.defects}
      columns={columns}
      searchPlaceholder="Search defects"
      toolbar={<DefectDialog references={references} />}
    />
  );
}

function CostsTab({
  dashboard,
  references,
}: {
  dashboard: Dashboard;
  references: ReferenceData;
}) {
  const columns = React.useMemo<ColumnDef<CostRow>[]>(
    () => [
      { accessorKey: "date", header: "Date" },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => humanise(row.original.category),
      },
      {
        id: "vehicle",
        header: "Vehicle",
        cell: ({ row }) =>
          row.original.vehicleId
            ? references.vehicles.find((v) => v._id === row.original.vehicleId)
                ?.name
            : "",
      },
      {
        accessorKey: "approvalStatus",
        header: "Approval",
        cell: ({ row }) => <StatusBadge value={row.original.approvalStatus} />,
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => formatCurrency(row.original.amount),
        meta: { numeric: true },
      },
    ],
    [references.vehicles],
  );
  return (
    <DataTable
      data={dashboard.costs}
      columns={columns}
      searchPlaceholder="Search costs"
      toolbar={<CostDialog references={references} />}
    />
  );
}

function CalendarTab({ dashboard }: { dashboard: Dashboard }) {
  const items = [
    ...dashboard.jobs.map((job) => ({
      id: String(job._id),
      type: "job",
      title: job.title,
      start: job.startDateTime,
      status: job.status,
    })),
    ...dashboard.maintenance.map((record) => ({
      id: String(record._id),
      type: "maintenance",
      title: record.description,
      start: Date.parse(record.scheduledDate ?? record.dateReported),
      status: record.status,
    })),
    ...dashboard.reminders.map((reminder) => ({
      id: String(reminder._id),
      type: "reminder",
      title: reminder.title,
      start: reminder.dueAt,
      status: reminder.status,
    })),
  ].sort((a, b) => a.start - b.start);
  return (
    <Panel title="Availability calendar">
      <div className="divide-y divide-hairline">
        {items.slice(0, 80).map((item) => (
          <div
            key={`${item.type}-${item.id}`}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <Badge variant="muted">{item.type}</Badge>
              <span className="text-body-strong text-ink-strong">
                {item.title}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-caption text-ink-quiet">
                {formatDateTime(item.start)}
              </span>
              <StatusBadge value={item.status} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DriverPortalTab({ references }: { references: ReferenceData }) {
  const portal = useQuery(api.fleet.driverPortal, {});
  const updateJob = useMutation(api.fleet.updateJobStatus);
  if (portal === undefined) return <LoadingState />;
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Panel title="Today">
        {portal.todayJobs.length === 0 ? (
          <EmptyLine>No jobs assigned for today.</EmptyLine>
        ) : (
          <div className="grid gap-3">
            {portal.todayJobs.map((job) => (
              <DriverJobCard
                key={job._id}
                job={job}
                references={references}
                onStart={() =>
                  updateJob({ jobId: job._id, status: "in_progress" })
                }
                onComplete={() =>
                  updateJob({ jobId: job._id, status: "completed" })
                }
              />
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Upcoming">
        {portal.upcomingJobs.length === 0 ? (
          <EmptyLine>No upcoming assigned jobs.</EmptyLine>
        ) : (
          <div className="grid gap-2">
            {portal.upcomingJobs.map((job) => (
              <DriverJobCard
                key={job._id}
                job={job}
                references={references}
                onStart={() =>
                  updateJob({ jobId: job._id, status: "in_progress" })
                }
                onComplete={() =>
                  updateJob({ jobId: job._id, status: "completed" })
                }
              />
            ))}
          </div>
        )}
      </Panel>
      <div className="grid gap-3 sm:grid-cols-3">
        <FuelDialog references={references} compact />
        <DefectDialog references={references} compact />
        <OdometerDialog references={references} />
      </div>
    </div>
  );
}

function ExportsTab({
  data,
}: {
  data: ReturnType<typeof useQuery<typeof api.fleet.exportData>>;
}) {
  if (data === undefined) {
    return (
      <EmptyState
        icon={Download}
        title="Export access required"
        description="Fleet exports require the export reports permission."
      />
    );
  }
  const downloads = [
    ["vehicles.csv", data.vehicles],
    ["drivers.csv", data.drivers],
    ["jobs.csv", data.jobs],
    ["maintenance.csv", data.maintenance],
    ["defects.csv", data.defects],
    ["costs.csv", data.costs],
    ["fuel-logs.csv", data.fuelLogs],
    ["fleet-reminders.csv", data.reminders],
    ["project-cost-report.csv", data.projects],
    ["fleet-audit.csv", data.auditLogs],
  ] as const;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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

function VehicleDialog({
  references,
  variant = "default",
}: {
  references: ReferenceData;
  variant?: "default" | "outline";
}) {
  const createVehicle = useMutation(api.fleet.createVehicle);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    registrationNumber: "",
    vehicleType: "vehicle",
    fuelType: "diesel",
    odometer: "0",
    status: "active",
    regoExpiry: "",
    insuranceExpiry: "",
    inspectionExpiry: "",
    serviceIntervalKm: "10000",
    serviceIntervalMonths: "6",
    depotId: "",
    notes: "",
  });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await createVehicle({
        name: form.name,
        registrationNumber: form.registrationNumber,
        vehicleType: form.vehicleType,
        fuelType: form.fuelType,
        odometer: Number(form.odometer || 0),
        status: form.status as (typeof VEHICLE_STATUSES)[number],
        regoExpiry: form.regoExpiry || undefined,
        insuranceExpiry: form.insuranceExpiry || undefined,
        inspectionExpiry: form.inspectionExpiry || undefined,
        serviceIntervalKm: numberOrUndefined(form.serviceIntervalKm),
        serviceIntervalMonths: numberOrUndefined(form.serviceIntervalMonths),
        depotId: (form.depotId as Id<"depots">) || undefined,
        notes: form.notes,
      });
      toastSuccess("Vehicle created.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not create vehicle.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Plus className="h-4 w-4" />
          Vehicle
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add vehicle</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Registration">
            <Input
              required
              value={form.registrationNumber}
              onChange={(e) =>
                setForm({ ...form, registrationNumber: e.target.value })
              }
            />
          </Field>
          <Field label="Type">
            <Input
              value={form.vehicleType}
              onChange={(e) =>
                setForm({ ...form, vehicleType: e.target.value })
              }
            />
          </Field>
          <Field label="Fuel">
            <Input
              value={form.fuelType}
              onChange={(e) => setForm({ ...form, fuelType: e.target.value })}
            />
          </Field>
          <Field label="Odometer">
            <Input
              type="number"
              value={form.odometer}
              onChange={(e) => setForm({ ...form, odometer: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <EnumSelect
              value={form.status}
              values={VEHICLE_STATUSES}
              onChange={(status) => setForm({ ...form, status })}
            />
          </Field>
          <Field label="Depot">
            <ReferenceSelect
              value={form.depotId}
              rows={references.depots}
              label={(d) => d.name}
              onChange={(depotId) => setForm({ ...form, depotId })}
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
          <Field label="Service km">
            <Input
              type="number"
              value={form.serviceIntervalKm}
              onChange={(e) =>
                setForm({ ...form, serviceIntervalKm: e.target.value })
              }
            />
          </Field>
          <Field label="Service months">
            <Input
              type="number"
              value={form.serviceIntervalMonths}
              onChange={(e) =>
                setForm({ ...form, serviceIntervalMonths: e.target.value })
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
              {saving ? "Saving..." : "Save vehicle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DriverDialog({ references }: { references: ReferenceData }) {
  const createDriver = useMutation(api.fleet.createDriver);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    phone: "",
    driverType: "driver",
    licenceExpiry: "",
    wwcc: "",
    approvedVehicleTypes: "",
    status: "active",
    defaultVehicleId: "",
  });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await createDriver({
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        driverType: form.driverType,
        licenceExpiry: form.licenceExpiry || undefined,
        workingWithChildrenCheckExpiry: form.wwcc || undefined,
        approvedVehicleTypes: form.approvedVehicleTypes
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        status: form.status as (typeof DRIVER_STATUSES)[number],
        defaultVehicleId:
          (form.defaultVehicleId as Id<"vehicles">) || undefined,
      });
      toastSuccess("Driver created.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not create driver.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Driver
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add driver</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Type">
            <Input
              value={form.driverType}
              onChange={(e) => setForm({ ...form, driverType: e.target.value })}
            />
          </Field>
          <Field label="Licence expiry">
            <Input
              type="date"
              value={form.licenceExpiry}
              onChange={(e) =>
                setForm({ ...form, licenceExpiry: e.target.value })
              }
            />
          </Field>
          <Field label="WWCC expiry">
            <Input
              type="date"
              value={form.wwcc}
              onChange={(e) => setForm({ ...form, wwcc: e.target.value })}
            />
          </Field>
          <Field label="Approved vehicle types">
            <Input
              placeholder="bus, van, ute"
              value={form.approvedVehicleTypes}
              onChange={(e) =>
                setForm({ ...form, approvedVehicleTypes: e.target.value })
              }
            />
          </Field>
          <Field label="Default vehicle">
            <ReferenceSelect
              value={form.defaultVehicleId}
              rows={references.vehicles}
              label={(v) => v.name}
              onChange={(defaultVehicleId) =>
                setForm({ ...form, defaultVehicleId })
              }
            />
          </Field>
          <Field label="Status">
            <EnumSelect
              value={form.status}
              values={DRIVER_STATUSES}
              onChange={(status) => setForm({ ...form, status })}
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save driver"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JobDialog({ references }: { references: ReferenceData }) {
  const createJob = useMutation(api.fleet.createJob);
  const now = new Date();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    title: "",
    referenceNumber: "",
    vehicleId: "",
    driverId: "",
    projectId: "",
    pickupLocation: "",
    dropoffLocation: "",
    start: datetimeLocal(now.getTime() + 60 * 60 * 1000),
    end: datetimeLocal(now.getTime() + 2 * 60 * 60 * 1000),
    jobType: "transport",
    estimatedDistance: "",
  });
  const startDateTime = Date.parse(form.start);
  const endDateTime = Date.parse(form.end);
  const check = useQuery(
    api.fleet.checkJobAssignment,
    open && Number.isFinite(startDateTime) && Number.isFinite(endDateTime)
      ? {
          vehicleId: (form.vehicleId as Id<"vehicles">) || undefined,
          driverId: (form.driverId as Id<"drivers">) || undefined,
          startDateTime,
          endDateTime,
        }
      : "skip",
  );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await createJob({
        title: form.title,
        referenceNumber: form.referenceNumber || undefined,
        assignedVehicleId: (form.vehicleId as Id<"vehicles">) || undefined,
        assignedDriverId: (form.driverId as Id<"drivers">) || undefined,
        projectId: (form.projectId as Id<"projects">) || undefined,
        pickupLocation: form.pickupLocation || undefined,
        dropoffLocation: form.dropoffLocation || undefined,
        startDateTime,
        endDateTime,
        jobType: form.jobType as (typeof JOB_TYPES)[number],
        estimatedDistance: numberOrUndefined(form.estimatedDistance),
      });
      toastSuccess("Job created.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not create job.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Job
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create job</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <Input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Reference">
            <Input
              value={form.referenceNumber}
              onChange={(e) =>
                setForm({ ...form, referenceNumber: e.target.value })
              }
            />
          </Field>
          <Field label="Vehicle">
            <ReferenceSelect
              value={form.vehicleId}
              rows={references.vehicles}
              label={(v) => `${v.name} (${v.registrationNumber})`}
              onChange={(vehicleId) => setForm({ ...form, vehicleId })}
            />
          </Field>
          <Field label="Driver">
            <ReferenceSelect
              value={form.driverId}
              rows={references.drivers}
              label={(d) => d.name}
              onChange={(driverId) => setForm({ ...form, driverId })}
            />
          </Field>
          <Field label="Project">
            <ReferenceSelect
              value={form.projectId}
              rows={references.projects}
              label={(p) => p.name}
              onChange={(projectId) => setForm({ ...form, projectId })}
            />
          </Field>
          <Field label="Type">
            <EnumSelect
              value={form.jobType}
              values={JOB_TYPES}
              onChange={(jobType) => setForm({ ...form, jobType })}
            />
          </Field>
          <Field label="Start">
            <Input
              type="datetime-local"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </Field>
          <Field label="End">
            <Input
              type="datetime-local"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
          </Field>
          <Field label="Pickup">
            <Input
              value={form.pickupLocation}
              onChange={(e) =>
                setForm({ ...form, pickupLocation: e.target.value })
              }
            />
          </Field>
          <Field label="Dropoff">
            <Input
              value={form.dropoffLocation}
              onChange={(e) =>
                setForm({ ...form, dropoffLocation: e.target.value })
              }
            />
          </Field>
          <Field label="Estimated km">
            <Input
              type="number"
              value={form.estimatedDistance}
              onChange={(e) =>
                setForm({ ...form, estimatedDistance: e.target.value })
              }
            />
          </Field>
          {check?.issues.length ? (
            <div className="sm:col-span-2 rounded-sm border border-warning/40 bg-warning-wash px-3 py-2 text-caption text-ink-soft">
              {check.issues.map((issue) => (
                <p key={issue.code}>
                  {issue.severity === "block" ? "Blocked" : "Warning"}:{" "}
                  {issue.message}
                </p>
              ))}
            </div>
          ) : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={saving || check?.blocked}>
              {saving ? "Saving..." : "Save job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectDialog() {
  const createProject = useMutation(api.fleet.createProject);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [clientName, setClientName] = React.useState("");
  const [budget, setBudget] = React.useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createProject({
        name,
        clientName,
        budget: numberOrUndefined(budget),
      });
      toastSuccess("Project created.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not create project.");
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Name">
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Client">
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </Field>
          <Field label="Budget">
            <Input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit">Save project</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceDialog({ references }: { references: ReferenceData }) {
  const create = useMutation(api.fleet.createMaintenanceRecord);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    vehicleId: "",
    description: "",
    type: "scheduled_service",
    scheduledDate: "",
    partsCost: "",
    labourCost: "",
  });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await create({
        vehicleId: form.vehicleId as Id<"vehicles">,
        description: form.description,
        maintenanceType: form.type as (typeof MAINTENANCE_TYPES)[number],
        scheduledDate: form.scheduledDate || undefined,
        partsCost: numberOrUndefined(form.partsCost),
        labourCost: numberOrUndefined(form.labourCost),
      });
      toastSuccess("Maintenance recorded.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not record maintenance.");
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Maintenance
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add maintenance</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Vehicle">
            <ReferenceSelect
              required
              value={form.vehicleId}
              rows={references.vehicles}
              label={(v) => v.name}
              onChange={(vehicleId) => setForm({ ...form, vehicleId })}
            />
          </Field>
          <Field label="Type">
            <EnumSelect
              value={form.type}
              values={MAINTENANCE_TYPES}
              onChange={(type) => setForm({ ...form, type })}
            />
          </Field>
          <Field label="Scheduled">
            <Input
              type="date"
              value={form.scheduledDate}
              onChange={(e) =>
                setForm({ ...form, scheduledDate: e.target.value })
              }
            />
          </Field>
          <Field label="Parts cost">
            <Input
              type="number"
              value={form.partsCost}
              onChange={(e) => setForm({ ...form, partsCost: e.target.value })}
            />
          </Field>
          <Field label="Labour cost">
            <Input
              type="number"
              value={form.labourCost}
              onChange={(e) => setForm({ ...form, labourCost: e.target.value })}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea
              required
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit">Save maintenance</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DefectDialog({
  references,
  compact,
}: {
  references: ReferenceData;
  compact?: boolean;
}) {
  const submitDefect = useMutation(api.fleet.submitDefect);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    vehicleId: "",
    severity: "medium",
    category: "Safety",
    safeToOperate: true,
    notes: "",
  });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await submitDefect({
        vehicleId: form.vehicleId as Id<"vehicles">,
        severity: form.severity as "low" | "medium" | "high" | "critical",
        category: form.category,
        safeToOperate: form.safeToOperate,
        notes: form.notes || undefined,
      });
      toastSuccess("Defect submitted.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not submit defect.");
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={compact ? "outline" : "default"}>
          <AlertTriangle className="h-4 w-4" />
          Defect
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit defect</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Vehicle">
            <ReferenceSelect
              required
              value={form.vehicleId}
              rows={references.vehicles}
              label={(v) => v.name}
              onChange={(vehicleId) => setForm({ ...form, vehicleId })}
            />
          </Field>
          <Field label="Severity">
            <EnumSelect
              value={form.severity}
              values={["low", "medium", "high", "critical"] as const}
              onChange={(severity) => setForm({ ...form, severity })}
            />
          </Field>
          <Field label="Category">
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-body text-ink-soft">
            <input
              type="checkbox"
              checked={form.safeToOperate}
              onChange={(e) =>
                setForm({ ...form, safeToOperate: e.target.checked })
              }
            />
            Safe to operate
          </label>
          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <DialogFooter>
            <Button type="submit">Submit defect</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CostDialog({ references }: { references: ReferenceData }) {
  const create = useMutation(api.fleet.createCostEntry);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    category: "other",
    amount: "",
    vehicleId: "",
    projectId: "",
    notes: "",
  });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await create({
        category: form.category as (typeof COST_CATEGORIES)[number],
        amount: Number(form.amount),
        vehicleId: (form.vehicleId as Id<"vehicles">) || undefined,
        projectId: (form.projectId as Id<"projects">) || undefined,
        notes: form.notes || undefined,
      });
      toastSuccess("Cost added.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not add cost.");
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <DollarSign className="h-4 w-4" />
          Cost
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add cost</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Category">
            <EnumSelect
              value={form.category}
              values={COST_CATEGORIES}
              onChange={(category) => setForm({ ...form, category })}
            />
          </Field>
          <Field label="Amount">
            <Input
              required
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field label="Vehicle">
            <ReferenceSelect
              value={form.vehicleId}
              rows={references.vehicles}
              label={(v) => v.name}
              onChange={(vehicleId) => setForm({ ...form, vehicleId })}
            />
          </Field>
          <Field label="Project">
            <ReferenceSelect
              value={form.projectId}
              rows={references.projects}
              label={(p) => p.name}
              onChange={(projectId) => setForm({ ...form, projectId })}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <DialogFooter>
            <Button type="submit">Save cost</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FuelDialog({
  references,
  compact,
}: {
  references: ReferenceData;
  compact?: boolean;
}) {
  const create = useMutation(api.fleet.createFuelLog);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    vehicleId: "",
    driverId: "",
    odometer: "",
    litres: "",
    cost: "",
    location: "",
  });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await create({
        vehicleId: form.vehicleId as Id<"vehicles">,
        driverId: (form.driverId as Id<"drivers">) || undefined,
        odometer: Number(form.odometer),
        litres: Number(form.litres),
        cost: Number(form.cost),
        locationStation: form.location || undefined,
      });
      toastSuccess("Fuel log submitted.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not submit fuel log.");
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={compact ? "outline" : "default"}>
          <Fuel className="h-4 w-4" />
          Fuel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit fuel log</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Vehicle">
            <ReferenceSelect
              required
              value={form.vehicleId}
              rows={references.vehicles}
              label={(v) => v.name}
              onChange={(vehicleId) => setForm({ ...form, vehicleId })}
            />
          </Field>
          <Field label="Driver">
            <ReferenceSelect
              value={form.driverId}
              rows={references.drivers}
              label={(d) => d.name}
              onChange={(driverId) => setForm({ ...form, driverId })}
            />
          </Field>
          <Field label="Odometer">
            <Input
              required
              type="number"
              value={form.odometer}
              onChange={(e) => setForm({ ...form, odometer: e.target.value })}
            />
          </Field>
          <Field label="Litres">
            <Input
              required
              type="number"
              value={form.litres}
              onChange={(e) => setForm({ ...form, litres: e.target.value })}
            />
          </Field>
          <Field label="Cost">
            <Input
              required
              type="number"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
            />
          </Field>
          <Field label="Station">
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit">Save fuel log</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OdometerDialog({ references }: { references: ReferenceData }) {
  const update = useMutation(api.fleet.updateVehicle);
  const [open, setOpen] = React.useState(false);
  const [vehicleId, setVehicleId] = React.useState("");
  const [odometer, setOdometer] = React.useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await update({
        vehicleId: vehicleId as Id<"vehicles">,
        odometer: Number(odometer),
      });
      toastSuccess("Odometer updated.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not update odometer.");
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Gauge className="h-4 w-4" />
          Odometer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit odometer</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Vehicle">
            <ReferenceSelect
              required
              value={vehicleId}
              rows={references.vehicles}
              label={(v) => v.name}
              onChange={setVehicleId}
            />
          </Field>
          <Field label="Odometer">
            <Input
              required
              type="number"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit">Save odometer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DriverJobCard({
  job,
  references,
  onStart,
  onComplete,
}: {
  job: JobRow;
  references: ReferenceData;
  onStart: () => Promise<unknown>;
  onComplete: () => Promise<unknown>;
}) {
  const vehicle = references.vehicles.find(
    (v) => v._id === job.assignedVehicleId,
  );
  return (
    <div className="rounded-md border border-hairline bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-body-strong text-ink-strong">{job.title}</p>
          <p className="text-caption text-ink-quiet">
            {formatDateTime(job.startDateTime)} ·{" "}
            {vehicle?.name ?? "Vehicle unassigned"}
          </p>
          <p className="mt-1 text-caption text-ink-soft">
            {job.pickupLocation ?? "Pickup not set"} to{" "}
            {job.dropoffLocation ?? "dropoff not set"}
          </p>
        </div>
        <StatusBadge value={job.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onStart().catch((err) => toastFailure(err, "Could not start job."))
          }
        >
          Start
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onComplete().catch((err) =>
              toastFailure(err, "Could not complete job."),
            )
          }
        >
          Complete
        </Button>
      </div>
    </div>
  );
}

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

function ProgressMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-caption text-ink-quiet">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-surface-sunk">
        <div
          className="h-full bg-primary"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-caption text-ink-quiet">{label}</p>
      <p className="text-body-strong text-ink-strong">{value}</p>
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

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-body text-ink-quiet">{children}</p>;
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

function ReferenceSelect<T extends { _id: string }>({
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
          <SelectItem key={row._id} value={row._id}>
            {label(row)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function datetimeLocal(ms: number): string {
  const date = new Date(ms);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
