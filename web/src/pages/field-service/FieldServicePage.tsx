import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { Plus, Truck, MapPin, ClipboardList } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { moduleEnabled } from "@/lib/verticals";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { cn, relativeTime } from "@/lib/utils";

type JobStatus =
  | "open"
  | "scheduled"
  | "en_route"
  | "on_site"
  | "completed"
  | "exception"
  | "cancelled";

const STATUS_LABELS: Record<JobStatus, string> = {
  open: "Unassigned",
  scheduled: "Scheduled",
  en_route: "En route",
  on_site: "On site",
  completed: "Completed",
  exception: "Exception",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<
  JobStatus,
  "muted" | "info" | "accent" | "success" | "warning" | "destructive"
> = {
  open: "muted",
  scheduled: "info",
  en_route: "accent",
  on_site: "accent",
  completed: "success",
  exception: "destructive",
  cancelled: "muted",
};

// Board columns left→right: pending dispatch, live in the field, then closed.
const BOARD_COLUMNS: JobStatus[] = [
  "open",
  "scheduled",
  "en_route",
  "on_site",
  "completed",
  "exception",
];

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export default function FieldServicePage() {
  const { org, hasCapability } = useGatherHub();
  const enabled = moduleEnabled(org, "field_service");
  const canDispatch = hasCapability("jobs.dispatch");
  const canComplete = hasCapability("jobs.complete");
  const hasAccess = canDispatch || canComplete;

  if (!enabled) {
    return (
      <EmptyState
        icon={Truck}
        title="Field service is off"
        description="Enable the Field service module in Settings to dispatch jobs and routes."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }
  if (!hasAccess) {
    return (
      <EmptyState
        icon={Truck}
        title="No field-service access"
        description="You need the dispatch or complete-jobs permission to use this area."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Field service"
        description="Dispatch jobs, build routes, and track proof-of-service from the field."
        actions={canDispatch ? <NewJobDialog /> : undefined}
      />
      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Dispatch board</TabsTrigger>
          <TabsTrigger value="routes">Routes</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
        </TabsList>
        <TabsContent value="board">
          <DispatchBoard canComplete={canComplete} canDispatch={canDispatch} />
        </TabsContent>
        <TabsContent value="routes">
          <RoutesTab canDispatch={canDispatch} />
        </TabsContent>
        <TabsContent value="customers">
          <CustomersTab canDispatch={canDispatch} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- dispatch board -------------------------------------------------------

function DispatchBoard({
  canComplete,
  canDispatch,
}: {
  canComplete: boolean;
  canDispatch: boolean;
}) {
  const jobs = useQuery(api.fieldService.dispatchBoard, {});
  const [openJobId, setOpenJobId] = React.useState<Id<"fieldJobs"> | null>(
    null,
  );

  if (jobs === undefined) return <LoadingState />;
  if (jobs.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No jobs yet"
        description="Create a job to start dispatching."
      />
    );
  }

  return (
    <>
      <p className="mb-3 text-caption text-ink-quiet">
        Live field status: unassigned and scheduled are pending; en route and on
        site are in progress; completed and exception are closed.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {BOARD_COLUMNS.map((status) => {
          const column = jobs.filter((j) => j.status === status);
          return (
            <div key={status} className="rounded-lg border border-hairline">
              <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
                <span className="text-label text-ink-soft">
                  {STATUS_LABELS[status]}
                </span>
                <Badge variant="muted">{column.length}</Badge>
              </div>
              <div className="grid gap-2 p-2">
                {column.length === 0 ? (
                  <p className="px-1 py-2 text-caption text-ink-quiet">—</p>
                ) : (
                  column.map((job) => (
                    <button
                      key={job._id}
                      type="button"
                      onClick={() => setOpenJobId(job._id)}
                      className="rounded-md border border-hairline bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-sunk"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-body-strong text-ink-strong">
                          {job.title}
                        </span>
                        <PriorityDot priority={job.priority} />
                      </div>
                      <div className="mt-0.5 text-caption text-ink-quiet">
                        {[job.customerName, job.siteName]
                          .filter(Boolean)
                          .join(" · ") || "No customer"}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        {job.routeName && (
                          <span className="text-caption text-ink-quiet">
                            {job.routeName}
                          </span>
                        )}
                        {job.lastEventAt && (
                          <span className="text-caption text-ink-quiet">
                            · {relativeTime(job.lastEventAt)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      {openJobId && (
        <JobDialog
          jobId={openJobId}
          canComplete={canComplete}
          canDispatch={canDispatch}
          onClose={() => setOpenJobId(null)}
        />
      )}
    </>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const color =
    priority === "urgent"
      ? "bg-danger"
      : priority === "high"
        ? "bg-warning"
        : priority === "low"
          ? "bg-border-strong"
          : "bg-info";
  return (
    <span
      className={cn("h-2 w-2 shrink-0 rounded-full", color)}
      title={`Priority: ${priority}`}
    />
  );
}

// --- job detail -----------------------------------------------------------

function JobDialog({
  jobId,
  canComplete,
  canDispatch,
  onClose,
}: {
  jobId: Id<"fieldJobs">;
  canComplete: boolean;
  canDispatch: boolean;
  onClose: () => void;
}) {
  const job = useQuery(api.fieldService.getJob, { jobId });
  const isClosed = job?.status === "completed" || job?.status === "exception";
  const isLive =
    job?.status === "open" ||
    job?.status === "scheduled" ||
    job?.status === "en_route" ||
    job?.status === "on_site";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px]">
        {job === undefined ? (
          <LoadingState />
        ) : job === null ? (
          <DialogHeader>
            <DialogTitle>Job not found</DialogTitle>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{job.title}</DialogTitle>
              <DialogDescription>
                {[job.customerName, job.siteName].filter(Boolean).join(" · ") ||
                  "No customer or site"}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[job.status as JobStatus]}>
                {STATUS_LABELS[job.status as JobStatus]}
              </Badge>
              <Badge variant="muted">{job.priority}</Badge>
              {job.routeName && <Badge variant="muted">{job.routeName}</Badge>}
            </div>

            {job.instructions && (
              <p className="whitespace-pre-wrap text-body text-ink">
                {job.instructions}
              </p>
            )}
            {job.siteAddress && (
              <p className="flex items-center gap-1.5 text-caption text-ink-quiet">
                <MapPin className="h-3.5 w-3.5" /> {job.siteAddress}
              </p>
            )}

            {isLive && canComplete && <CompleteJobForm jobId={jobId} />}
            {isClosed && canDispatch && (
              <CorrectJobForm jobId={jobId} status={job.status} />
            )}

            <ProofTimeline history={job.history} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProofTimeline({
  history,
}: {
  history: {
    _id: string;
    action: string;
    notes: string | null;
    signatureName: string | null;
    scanRef: string | null;
    exceptionReason: string | null;
    correctsEventId: string | null;
    performedAt: number;
    performedByName: string | null;
  }[];
}) {
  if (history.length === 0) return null;
  return (
    <div className="mt-1 border-t border-hairline pt-3">
      <span className="text-label text-ink-soft">Activity & proof</span>
      <ol className="mt-2 grid gap-2">
        {history
          .slice()
          .reverse()
          .map((e) => (
            <li
              key={e._id}
              className="rounded-md bg-surface-sunk px-3 py-2 text-caption"
            >
              <div className="flex items-center justify-between">
                <span className="text-body-strong capitalize text-ink-strong">
                  {e.action}
                  {e.correctsEventId ? " (correction)" : ""}
                </span>
                <span className="text-ink-quiet">
                  {relativeTime(e.performedAt)}
                </span>
              </div>
              <div className="text-ink-quiet">
                {e.performedByName ?? "Someone"}
              </div>
              {e.exceptionReason && (
                <div className="mt-0.5 text-danger">{e.exceptionReason}</div>
              )}
              {e.signatureName && (
                <div className="mt-0.5 text-ink-soft">
                  Signed: {e.signatureName}
                </div>
              )}
              {e.scanRef && (
                <div className="text-ink-soft">Scan: {e.scanRef}</div>
              )}
              {e.notes && <div className="text-ink-soft">{e.notes}</div>}
            </li>
          ))}
      </ol>
    </div>
  );
}

function CompleteJobForm({ jobId }: { jobId: Id<"fieldJobs"> }) {
  const config = useQuery(api.fieldService.getConfig, {});
  const completeJob = useMutation(api.fieldService.completeJob);
  const raiseException = useMutation(api.fieldService.raiseException);
  const [signatureName, setSignatureName] = React.useState("");
  const [scanRef, setScanRef] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [exceptionReason, setExceptionReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function complete() {
    setBusy(true);
    try {
      await completeJob({
        jobId,
        signatureName: signatureName.trim() || undefined,
        scanRef: scanRef.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toastSuccess("Job completed.");
    } catch (err) {
      toastFailure(err, "Could not complete job.");
    } finally {
      setBusy(false);
    }
  }

  async function except() {
    if (!exceptionReason) return;
    setBusy(true);
    try {
      await raiseException({
        jobId,
        exceptionReason,
        notes: notes.trim() || undefined,
      });
      toastSuccess("Exception recorded.");
    } catch (err) {
      toastFailure(err, "Could not record exception.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-md border border-hairline p-3">
      <span className="text-label text-ink-soft">Record proof-of-service</span>
      <Input
        placeholder="Signature / recipient name"
        value={signatureName}
        onChange={(e) => setSignatureName(e.target.value)}
      />
      <Input
        placeholder="Scan reference (bin / asset)"
        value={scanRef}
        onChange={(e) => setScanRef(e.target.value)}
      />
      <Textarea
        placeholder="Notes (optional)"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={complete}>
          Mark complete
        </Button>
        <Select value={exceptionReason} onValueChange={setExceptionReason}>
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue placeholder="Exception reason" />
          </SelectTrigger>
          <SelectContent>
            {(config?.exceptionReasons ?? []).map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !exceptionReason}
          onClick={except}
        >
          Exception
        </Button>
      </div>
    </div>
  );
}

function CorrectJobForm({
  jobId,
  status,
}: {
  jobId: Id<"fieldJobs">;
  status: string;
}) {
  const correct = useMutation(api.fieldService.correctJobCompletion);
  const reopen = useMutation(api.fieldService.reopenJob);
  const [reason, setReason] = React.useState("");
  const [signatureName, setSignatureName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submitCorrection() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await correct({
        jobId,
        reason: reason.trim(),
        signatureName: signatureName.trim() || undefined,
      });
      toastSuccess("Correction recorded.");
      setReason("");
      setSignatureName("");
    } catch (err) {
      toastFailure(err, "Could not record correction.");
    } finally {
      setBusy(false);
    }
  }

  async function doReopen() {
    setBusy(true);
    try {
      await reopen({ jobId });
      toastSuccess("Job reopened.");
    } catch (err) {
      toastFailure(err, "Could not reopen job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-md border border-hairline p-3">
      <span className="text-label text-ink-soft">
        Amend closed job ({STATUS_LABELS[status as JobStatus]})
      </span>
      <p className="text-caption text-ink-quiet">
        Proof is immutable; corrections are appended to the audit trail.
      </p>
      <Input
        placeholder="Correction reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Input
        placeholder="Corrected signature (optional)"
        value={signatureName}
        onChange={(e) => setSignatureName(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={busy || !reason.trim()}
          onClick={submitCorrection}
        >
          Record correction
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={doReopen}>
          Reopen job
        </Button>
      </div>
    </div>
  );
}

// --- new job --------------------------------------------------------------

function NewJobDialog() {
  const config = useQuery(api.fieldService.getConfig, {});
  const customers = useQuery(api.fieldService.listCustomers, {});
  const create = useMutation(api.fieldService.createJob);
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [customerId, setCustomerId] = React.useState<string>("none");
  const [jobType, setJobType] = React.useState<string>("none");
  const [priority, setPriority] = React.useState("normal");
  const [instructions, setInstructions] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const sites = useQuery(
    api.fieldService.listSites,
    customerId === "none"
      ? {}
      : { customerId: customerId as Id<"fieldCustomers"> },
  );
  const [siteId, setSiteId] = React.useState<string>("none");

  function reset() {
    setTitle("");
    setCustomerId("none");
    setJobType("none");
    setPriority("normal");
    setInstructions("");
    setSiteId("none");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await create({
        title: title.trim(),
        customerId:
          customerId === "none"
            ? undefined
            : (customerId as Id<"fieldCustomers">),
        siteId: siteId === "none" ? undefined : (siteId as Id<"fieldSites">),
        jobType: jobType === "none" ? undefined : jobType,
        priority: priority as (typeof PRIORITIES)[number],
        instructions: instructions.trim() || undefined,
      });
      reset();
      setOpen(false);
      toastSuccess("Job created.");
    } catch (err) {
      toastFailure(err, "Could not create job.");
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
          New job
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New job</DialogTitle>
          <DialogDescription>
            Create a work order to dispatch.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="job-title">Title</Label>
            <Input
              id="job-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Customer</Label>
            <Select
              value={customerId}
              onValueChange={(v) => {
                setCustomerId(v);
                setSiteId("none");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No customer</SelectItem>
                {(customers ?? []).map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {customerId !== "none" && (sites ?? []).length > 0 && (
            <div className="grid gap-1.5">
              <Label>Site</Label>
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No site</SelectItem>
                  {(sites ?? []).map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={jobType} onValueChange={setJobType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unspecified</SelectItem>
                  {(config?.jobTypes ?? []).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="job-instructions">Instructions</Label>
            <Textarea
              id="job-instructions"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form={formId}
            disabled={saving || !title.trim()}
          >
            {saving ? "Creating…" : "Create job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- routes ---------------------------------------------------------------

function RoutesTab({ canDispatch }: { canDispatch: boolean }) {
  const routes = useQuery(api.fieldService.listRoutes, {});
  const [manageId, setManageId] = React.useState<Id<"fieldRoutes"> | null>(
    null,
  );

  if (routes === undefined) return <LoadingState />;
  return (
    <div className="grid gap-3">
      {canDispatch && <NewRouteDialog />}
      {routes.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No routes"
          description="Build a route to sequence stops for a crew."
        />
      ) : (
        <div className="grid gap-2">
          {routes.map((r) => (
            <button
              key={r._id}
              type="button"
              onClick={() => canDispatch && setManageId(r._id)}
              className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-sunk"
            >
              <div>
                <div className="text-body-strong text-ink-strong">{r.name}</div>
                <div className="text-caption text-ink-quiet">
                  {r.date}
                  {r.assigneeName ? ` · ${r.assigneeName}` : " · Unassigned"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="muted">
                  {r.completedCount}/{r.stopCount} done
                </Badge>
                <Badge variant="info">{r.status}</Badge>
              </div>
            </button>
          ))}
        </div>
      )}
      {manageId && (
        <RouteManageDialog
          routeId={manageId}
          onClose={() => setManageId(null)}
        />
      )}
    </div>
  );
}

function NewRouteDialog() {
  const create = useMutation(api.fieldService.createRoute);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [date, setDate] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !date) return;
    setSaving(true);
    try {
      await create({ name: name.trim(), date });
      setName("");
      setDate("");
      setOpen(false);
      toastSuccess("Route created.");
    } catch (err) {
      toastFailure(err, "Could not create route.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="justify-self-start">
          <Plus className="h-4 w-4" />
          New route
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New route</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="route-name">Name</Label>
            <Input
              id="route-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="route-date">Date</Label>
            <Input
              id="route-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !name.trim() || !date}>
              {saving ? "Creating…" : "Create route"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RouteManageDialog({
  routeId,
  onClose,
}: {
  routeId: Id<"fieldRoutes">;
  onClose: () => void;
}) {
  const route = useQuery(api.fieldService.getRoute, { routeId });
  const unrouted = useQuery(api.fieldService.dispatchBoard, { status: "open" });
  const users = useQuery(api.fieldService.assignableUsers, {});
  const assign = useMutation(api.fieldService.assignRoute);
  const setJobs = useMutation(api.fieldService.setRouteJobs);
  const [busy, setBusy] = React.useState(false);

  const stops = route?.stops ?? [];

  async function addStop(jobId: Id<"fieldJobs">) {
    setBusy(true);
    try {
      await setJobs({
        routeId,
        jobIds: [...stops.map((s) => s._id), jobId],
      });
    } catch (err) {
      toastFailure(err, "Could not add stop.");
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...stops.map((s) => s._id)];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setBusy(true);
    try {
      await setJobs({ routeId, jobIds: next });
    } catch (err) {
      toastFailure(err, "Could not reorder.");
    } finally {
      setBusy(false);
    }
  }

  async function assignDriver(userId: string) {
    setBusy(true);
    try {
      await assign({
        routeId,
        assignedUserId: userId === "none" ? null : (userId as Id<"users">),
      });
      toastSuccess("Route assigned.");
    } catch (err) {
      toastFailure(err, "Could not assign route.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px]">
        {route === undefined ? (
          <LoadingState />
        ) : route === null ? (
          <DialogHeader>
            <DialogTitle>Route not found</DialogTitle>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{route.name}</DialogTitle>
              <DialogDescription>{route.date}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-1.5">
              <Label>Driver / crew</Label>
              <Select
                value={route.assignedUserId ?? "none"}
                onValueChange={assignDriver}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {(users ?? []).map((u) => (
                    <SelectItem key={u.userId} value={u.userId}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <span className="text-label text-ink-soft">
                Stops ({stops.length})
              </span>
              <ol className="mt-2 grid gap-1.5">
                {stops.map((s, i) => (
                  <li
                    key={s._id}
                    className="flex items-center gap-2 rounded-md border border-hairline px-3 py-2"
                  >
                    <span className="text-caption text-ink-quiet">{i + 1}</span>
                    <span className="flex-1 text-body text-ink">{s.title}</span>
                    <button
                      type="button"
                      disabled={busy || i === 0}
                      onClick={() => move(i, -1)}
                      className="px-1 text-ink-quiet disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={busy || i === stops.length - 1}
                      onClick={() => move(i, 1)}
                      className="px-1 text-ink-quiet disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </li>
                ))}
              </ol>
            </div>

            {(unrouted ?? []).length > 0 && (
              <div className="grid gap-1.5">
                <Label>Add an unassigned job</Label>
                <Select
                  value="none"
                  onValueChange={(v) =>
                    v !== "none" && addStop(v as Id<"fieldJobs">)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a job…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose a job…</SelectItem>
                    {(unrouted ?? []).map((j) => (
                      <SelectItem key={j._id} value={j._id}>
                        {j.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- customers ------------------------------------------------------------

function CustomersTab({ canDispatch }: { canDispatch: boolean }) {
  const customers = useQuery(api.fieldService.listCustomers, {});
  if (customers === undefined) return <LoadingState />;
  return (
    <div className="grid gap-3">
      {canDispatch && <NewCustomerDialog />}
      {customers.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No customers"
          description="Add the accounts and sites you do work for."
        />
      ) : (
        <div className="grid gap-2">
          {customers.map((c) => (
            <div
              key={c._id}
              className="rounded-lg border border-hairline bg-surface px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <div className="text-body-strong text-ink-strong">{c.name}</div>
                {canDispatch && <NewSiteDialog customerId={c._id} />}
              </div>
              {(c.contactName || c.contactPhone) && (
                <div className="text-caption text-ink-quiet">
                  {[c.contactName, c.contactPhone].filter(Boolean).join(" · ")}
                </div>
              )}
              <CustomerSites customerId={c._id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerSites({ customerId }: { customerId: Id<"fieldCustomers"> }) {
  const sites = useQuery(api.fieldService.listSites, { customerId });
  if (!sites || sites.length === 0) return null;
  return (
    <ul className="mt-1.5 grid gap-1">
      {sites.map((s) => (
        <li key={s._id} className="text-caption text-ink-soft">
          <MapPin className="mr-1 inline h-3 w-3" />
          {s.name}
          {s.address ? ` — ${s.address}` : ""}
        </li>
      ))}
    </ul>
  );
}

function NewCustomerDialog() {
  const create = useMutation(api.fieldService.createCustomer);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await create({
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      });
      setName("");
      setContactName("");
      setContactPhone("");
      setOpen(false);
      toastSuccess("Customer added.");
    } catch (err) {
      toastFailure(err, "Could not add customer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="justify-self-start">
          <Plus className="h-4 w-4" />
          New customer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cust-name">Name</Label>
            <Input
              id="cust-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cust-contact">Contact</Label>
              <Input
                id="cust-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cust-phone">Phone</Label>
              <Input
                id="cust-phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Adding…" : "Add customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewSiteDialog({ customerId }: { customerId: Id<"fieldCustomers"> }) {
  const create = useMutation(api.fieldService.createSite);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [accessNotes, setAccessNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await create({
        customerId,
        name: name.trim(),
        address: address.trim() || undefined,
        accessNotes: accessNotes.trim() || undefined,
      });
      setName("");
      setAddress("");
      setAccessNotes("");
      setOpen(false);
      toastSuccess("Site added.");
    } catch (err) {
      toastFailure(err, "Could not add site.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Plus className="h-3.5 w-3.5" />
          Site
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New site</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="site-name">Name</Label>
            <Input
              id="site-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="site-address">Address</Label>
            <Input
              id="site-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="site-access">Access notes</Label>
            <Textarea
              id="site-access"
              rows={2}
              value={accessNotes}
              onChange={(e) => setAccessNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Adding…" : "Add site"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
