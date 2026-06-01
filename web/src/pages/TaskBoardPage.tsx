import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  Clock3,
  GripVertical,
  Mail,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { cn, formatDate, relativeTime } from "@/lib/utils";
import { toastFailure, toastSuccess } from "@/lib/feedback";

const UNASSIGNED = "__unassigned__";

const STATUSES = [
  { id: "todo", label: "To do", badge: "muted" },
  { id: "in_progress", label: "In progress", badge: "info" },
  { id: "blocked", label: "Blocked", badge: "warning" },
  { id: "done", label: "Done", badge: "success" },
] as const;

type TaskStatus = (typeof STATUSES)[number]["id"];
type TaskRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.tasks.list>>
>[number];
type MemberRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.members.list>>
>[number];

function statusLabel(status: TaskStatus): string {
  return STATUSES.find((s) => s.id === status)?.label ?? status;
}

function assigneeName(task: TaskRow): string {
  if (!task.assignee) return "Unassigned";
  return `${task.assignee.firstName} ${task.assignee.lastName}`.trim();
}

function isOverdue(task: TaskRow): boolean {
  return Boolean(
    task.dueDate &&
    task.status !== "done" &&
    task.dueDate < new Date().toISOString().slice(0, 10),
  );
}

function isAssignableTaskMember(member: MemberRow): boolean {
  const roles = [member.clubRole, member.membershipRole].map((role) =>
    role?.trim().toLowerCase(),
  );
  return !roles.includes("parent") && !roles.includes("player");
}

export default function TaskBoardPage() {
  const { can } = useGatherHub();
  const tasks = useQuery(api.tasks.list, {});
  const move = useMutation(api.tasks.move);
  const remove = useMutation(api.tasks.remove);
  const canEdit = can("committee");
  const [draggingTaskId, setDraggingTaskId] = React.useState<string | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);

  const moveTask = React.useCallback(
    async (taskId: Id<"tasks">, status: TaskStatus) => {
      setError(null);
      try {
        await move({ taskId, status });
      } catch (err) {
        setError(toastFailure(err, "Could not move task."));
      }
    },
    [move],
  );

  const removeTask = React.useCallback(
    async (task: TaskRow) => {
      if (!confirm(`Remove "${task.title}"?`)) return;
      setError(null);
      try {
        await remove({ taskId: task._id });
        toastSuccess("Task removed.");
      } catch (err) {
        setError(toastFailure(err, "Could not remove task."));
      }
    },
    [remove],
  );

  async function handleDrop(status: TaskStatus) {
    if (!draggingTaskId) return;
    await moveTask(draggingTaskId as Id<"tasks">, status);
    setDraggingTaskId(null);
  }

  const counts = React.useMemo(() => {
    const map = new Map<TaskStatus, number>();
    for (const status of STATUSES) map.set(status.id, 0);
    for (const task of tasks ?? []) {
      map.set(task.status, (map.get(task.status) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  return (
    <div>
      <PageHeader
        title="Task Board"
        description="Assign work, track deadlines, and move tasks through the board."
        actions={canEdit && <TaskDialog />}
      />

      {error && <p className="mb-4 text-caption text-danger">{error}</p>}

      {tasks === undefined ? (
        <LoadingState />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No tasks"
          description="Create the first task and assign it to a member."
          action={canEdit ? <TaskDialog /> : undefined}
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-4">
          {STATUSES.map((status) => {
            const columnTasks = tasks.filter(
              (task) => task.status === status.id,
            );
            return (
              <section
                key={status.id}
                className={cn(
                  "min-h-[420px] rounded-md border border-hairline bg-surface overflow-hidden",
                  draggingTaskId && "outline outline-1 outline-border-strong",
                )}
                onDragOver={(event) => {
                  if (canEdit) event.preventDefault();
                }}
                onDrop={() => handleDrop(status.id)}
              >
                <header className="flex items-center gap-2 border-b border-hairline px-4 py-3">
                  <h2 className="text-title text-ink-strong">{status.label}</h2>
                  <Badge variant={status.badge}>
                    <span data-numeric>{counts.get(status.id) ?? 0}</span>
                  </Badge>
                </header>
                <div className="grid gap-2 p-3">
                  {columnTasks.length === 0 ? (
                    <div className="rounded-sm border border-dashed border-hairline bg-paper px-3 py-8 text-center text-caption text-ink-quiet">
                      Drop tasks here.
                    </div>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskCard
                        key={task._id}
                        task={task}
                        canEdit={canEdit}
                        onDragStart={() => setDraggingTaskId(String(task._id))}
                        onDragEnd={() => setDraggingTaskId(null)}
                        onRemove={() => removeTask(task)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  canEdit,
  onDragStart,
  onDragEnd,
  onRemove,
}: {
  task: TaskRow;
  canEdit: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRemove: () => void;
}) {
  const overdue = isOverdue(task);
  return (
    <article
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-md border border-hairline bg-paper p-3",
        "transition-colors duration-fast ease-out hover:bg-surface-sunk/40",
        canEdit && "cursor-grab active:cursor-grabbing",
        overdue && "border-warning bg-warning-wash/30",
      )}
    >
      <div className="flex items-start gap-2">
        {canEdit && (
          <GripVertical
            className="mt-0.5 h-4 w-4 shrink-0 text-ink-quiet"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-body-strong text-ink-strong">{task.title}</h3>
          {task.description && (
            <p className="mt-1 line-clamp-3 text-caption text-ink-soft">
              {task.description}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <TaskDialog existing={task} />
            <Button
              variant="ghost"
              size="icon"
              title="Remove"
              onClick={onRemove}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant={task.status === "done" ? "success" : "muted"}>
          {statusLabel(task.status)}
        </Badge>
        <Badge variant={overdue ? "warning" : "outline"}>
          <Clock3 className="h-3 w-3" />
          {task.dueDate ? formatDate(task.dueDate) : "No due date"}
        </Badge>
        {task.reminderEnabled && task.dueDate && task.status !== "done" && (
          <Badge variant="info">
            <Mail className="h-3 w-3" />
            Every <span data-numeric>{task.reminderEveryDays}</span>d overdue
          </Badge>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-caption text-ink-quiet">
        <span>{assigneeName(task)}</span>
        <span>{relativeTime(task.updatedAt)}</span>
      </div>
    </article>
  );
}

function TaskDialog({ existing }: { existing?: TaskRow }) {
  const create = useMutation(api.tasks.create);
  const update = useMutation(api.tasks.update);
  const members = useQuery(api.members.list, {});
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(existing?.title ?? "");
  const [description, setDescription] = React.useState(
    existing?.description ?? "",
  );
  const [assigneeMemberId, setAssigneeMemberId] = React.useState(
    existing?.assigneeMemberId ? String(existing.assigneeMemberId) : UNASSIGNED,
  );
  const [status, setStatus] = React.useState<TaskStatus>(
    existing?.status ?? "todo",
  );
  const [dueDate, setDueDate] = React.useState(existing?.dueDate ?? "");
  const [reminderEnabled, setReminderEnabled] = React.useState(
    existing?.reminderEnabled ?? true,
  );
  const [reminderEveryDays, setReminderEveryDays] = React.useState(
    String(existing?.reminderEveryDays ?? 3),
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const assignableMembers = React.useMemo(
    () => (members ?? []).filter(isAssignableTaskMember),
    [members],
  );

  React.useEffect(() => {
    if (!open) return;
    setTitle(existing?.title ?? "");
    setDescription(existing?.description ?? "");
    setAssigneeMemberId(
      existing?.assigneeMemberId
        ? String(existing.assigneeMemberId)
        : UNASSIGNED,
    );
    setStatus(existing?.status ?? "todo");
    setDueDate(existing?.dueDate ?? "");
    setReminderEnabled(existing?.reminderEnabled ?? true);
    setReminderEveryDays(String(existing?.reminderEveryDays ?? 3));
    setError(null);
  }, [open, existing]);

  React.useEffect(() => {
    if (!open || members === undefined || assigneeMemberId === UNASSIGNED) {
      return;
    }
    if (!assignableMembers.some((member) => member._id === assigneeMemberId)) {
      setAssigneeMemberId(UNASSIGNED);
    }
  }, [assignableMembers, assigneeMemberId, members, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const assignee =
      assigneeMemberId === UNASSIGNED
        ? undefined
        : (assigneeMemberId as Id<"members">);
    const reminderDays = Number(reminderEveryDays || 3);

    try {
      if (existing) {
        await update({
          taskId: existing._id,
          title,
          description: description.trim() || null,
          assigneeMemberId: assignee ?? null,
          status,
          dueDate: dueDate || null,
          reminderEnabled,
          reminderEveryDays: reminderDays,
        });
      } else {
        await create({
          title,
          description: description.trim() || undefined,
          assigneeMemberId: assignee,
          status,
          dueDate: dueDate || undefined,
          reminderEnabled,
          reminderEveryDays: reminderDays,
        });
      }
      setOpen(false);
      toastSuccess(existing ? "Task updated." : "Task created.");
    } catch (err) {
      setError(toastFailure(err, "Could not save task."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {existing ? (
          <Button variant="ghost" size="icon" title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="h-4 w-4" /> New task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            Assign ownership, due date, and overdue reminder cadence.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="task-description">Description</Label>
            <textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="min-h-20 rounded-sm border border-border bg-surface px-3 py-2 text-body text-ink outline-none transition-[border-color,box-shadow] duration-fast focus-visible:shadow-focus"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Assignee</Label>
              <Select
                value={assigneeMemberId}
                onValueChange={setAssigneeMemberId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {members === undefined ? (
                    <SelectItem value="loading" disabled>
                      Loading...
                    </SelectItem>
                  ) : (
                    assignableMembers.map((member) => (
                      <SelectItem key={member._id} value={member._id}>
                        {member.firstName} {member.lastName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as TaskStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="task-due">Deadline</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="task-reminder-days">Reminder days</Label>
              <Input
                id="task-reminder-days"
                type="number"
                min="1"
                max="30"
                value={reminderEveryDays}
                onChange={(e) => setReminderEveryDays(e.target.value)}
                className="w-28"
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-body text-ink-soft">
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(e) => setReminderEnabled(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Email assignee after the deadline, then every{" "}
            <span data-numeric>{reminderEveryDays || 3}</span> days
          </label>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form={formId}
            disabled={saving || !title.trim()}
          >
            {saving ? "Saving..." : existing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
