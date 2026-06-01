import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { taskStatusValidator } from "./schema";
import {
  assertSameOrg,
  requireOrgMember,
  requireRole,
  type AuthContext,
  type Role,
} from "./lib/auth";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";

const nullableString = v.union(v.string(), v.null());
const DEFAULT_REMINDER_EVERY_DAYS = 3;
const DAY_MS = 86_400_000;
type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
const BLOCKED_ASSIGNEE_ROLES = new Set(["parent", "player"]);

function cleanString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function assertTitle(value: string): string {
  const title = value.trim();
  if (!title) {
    throw new ConvexError({
      code: "invalid_task",
      message: "Task title is required.",
    });
  }
  return title;
}

function normalizeReminderEveryDays(value: number | undefined): number {
  if (value === undefined) return DEFAULT_REMINDER_EVERY_DAYS;
  if (!Number.isFinite(value) || value < 1 || value > 30) {
    throw new ConvexError({
      code: "invalid_task_reminder",
      message: "Reminder interval must be between 1 and 30 days.",
    });
  }
  return Math.floor(value);
}

function todayIso(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function memberName(
  member: { firstName: string; lastName: string } | null,
): string {
  if (!member) return "Unassigned";
  return `${member.firstName} ${member.lastName}`.trim();
}

function hasBlockedAssigneeRole(role: string | Role | undefined): boolean {
  return BLOCKED_ASSIGNEE_ROLES.has(role?.trim().toLowerCase() ?? "");
}

async function assertAssignableAssignee(
  ctx: MutationCtx,
  auth: AuthContext,
  memberId: Id<"members">,
) {
  const assignee = await ctx.db.get(memberId);
  assertSameOrg(auth, assignee);
  if (!assignee) return;
  if (hasBlockedAssigneeRole(assignee.clubRole)) {
    throw new ConvexError({
      code: "invalid_task_assignee",
      message: "Tasks cannot be assigned to parents or players.",
    });
  }
  const assigneeUserId = assignee.userId;
  if (!assigneeUserId) return;
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_and_org", (q) =>
      q.eq("userId", assigneeUserId).eq("orgId", auth.org._id),
    )
    .unique();
  if (hasBlockedAssigneeRole(membership?.role)) {
    throw new ConvexError({
      code: "invalid_task_assignee",
      message: "Tasks cannot be assigned to parents or players.",
    });
  }
}

async function nextOrder(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  status: TaskStatus,
) {
  const last = await ctx.db
    .query("tasks")
    .withIndex("by_org_status_order", (q) =>
      q.eq("orgId", orgId).eq("status", status),
    )
    .order("desc")
    .first();
  return last ? last.order + 1 : 0;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const reminders = await ctx.db
      .query("taskReminderEmails")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();

    const reminderStats = new Map<
      string,
      { queued: number; sent: number; failed: number; skipped: number }
    >();
    for (const reminder of reminders) {
      const key = String(reminder.taskId);
      const current = reminderStats.get(key) ?? {
        queued: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
      };
      current[reminder.status] += 1;
      reminderStats.set(key, current);
    }

    tasks.sort((a, b) => {
      const byStatus = a.status.localeCompare(b.status);
      if (byStatus !== 0) return byStatus;
      return a.order - b.order;
    });

    return await Promise.all(
      tasks.map(async (task) => {
        const assignee = task.assigneeMemberId
          ? await ctx.db.get(task.assigneeMemberId)
          : null;
        return {
          ...task,
          assignee: assignee
            ? {
                _id: assignee._id,
                firstName: assignee.firstName,
                lastName: assignee.lastName,
                email: assignee.email,
              }
            : null,
          reminderStats: reminderStats.get(String(task._id)) ?? {
            queued: 0,
            sent: 0,
            failed: 0,
            skipped: 0,
          },
        };
      }),
    );
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    assigneeMemberId: v.optional(v.id("members")),
    status: v.optional(taskStatusValidator),
    dueDate: v.optional(v.string()),
    reminderEnabled: v.optional(v.boolean()),
    reminderEveryDays: v.optional(v.number()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const taskId = ctx.db.normalizeId("tasks", replay.resultId);
      if (!taskId) throw new Error("Invalid task idempotency result.");
      return taskId;
    }
    if (replay) throw new Error("Missing task idempotency result.");
    if (args.assigneeMemberId) {
      await assertAssignableAssignee(ctx, auth, args.assigneeMemberId);
    }
    const status = args.status ?? "todo";
    const now = Date.now();
    const taskId = await ctx.db.insert("tasks", {
      orgId: auth.org._id,
      title: assertTitle(args.title),
      description: cleanString(args.description),
      assigneeMemberId: args.assigneeMemberId,
      status,
      dueDate: cleanString(args.dueDate),
      order: await nextOrder(ctx, auth.org._id, status),
      reminderEnabled: args.reminderEnabled ?? true,
      reminderEveryDays: normalizeReminderEveryDays(args.reminderEveryDays),
      createdBy: auth.user._id,
      createdAt: now,
      updatedAt: now,
      completedAt: status === "done" ? now : undefined,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "tasks:create",
      String(taskId),
    );
    return taskId;
  },
});

export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(nullableString),
    assigneeMemberId: v.optional(v.union(v.id("members"), v.null())),
    status: v.optional(taskStatusValidator),
    dueDate: v.optional(nullableString),
    reminderEnabled: v.optional(v.boolean()),
    reminderEveryDays: v.optional(v.number()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return;
    const task = await ctx.db.get(args.taskId);
    assertSameOrg(auth, task);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = assertTitle(args.title);
    if (args.description !== undefined) {
      patch.description = cleanString(args.description);
    }
    if (args.assigneeMemberId !== undefined) {
      if (args.assigneeMemberId !== null) {
        await assertAssignableAssignee(ctx, auth, args.assigneeMemberId);
      }
      patch.assigneeMemberId = args.assigneeMemberId ?? undefined;
    }
    if (args.status !== undefined) {
      patch.status = args.status;
      patch.completedAt = args.status === "done" ? Date.now() : undefined;
    }
    if (args.dueDate !== undefined) {
      patch.dueDate = cleanString(args.dueDate);
      patch.lastReminderQueuedAt = undefined;
    }
    if (args.reminderEnabled !== undefined) {
      patch.reminderEnabled = args.reminderEnabled;
    }
    if (args.reminderEveryDays !== undefined) {
      patch.reminderEveryDays = normalizeReminderEveryDays(
        args.reminderEveryDays,
      );
    }

    await ctx.db.patch(args.taskId, patch);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "tasks:update",
      String(args.taskId),
    );
  },
});

export const move = mutation({
  args: {
    taskId: v.id("tasks"),
    status: taskStatusValidator,
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return;
    const task = await ctx.db.get(args.taskId);
    assertSameOrg(auth, task);
    const now = Date.now();
    await ctx.db.patch(args.taskId, {
      status: args.status,
      order: await nextOrder(ctx, auth.org._id, args.status),
      completedAt: args.status === "done" ? now : undefined,
      updatedAt: now,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "tasks:move",
      String(args.taskId),
    );
  },
});

export const remove = mutation({
  args: {
    taskId: v.id("tasks"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const task = await ctx.db.get(args.taskId);
    assertSameOrg(auth, task);
    const reminders = await ctx.db
      .query("taskReminderEmails")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    for (const reminder of reminders) {
      await ctx.db.delete(reminder._id);
    }
    await ctx.db.delete(args.taskId);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "tasks:remove",
      String(args.taskId),
    );
  },
});

export const queueDueReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = todayIso(now);
    const overdue = await ctx.db
      .query("tasks")
      .withIndex("by_due", (q) => q.lt("dueDate", today))
      .collect();
    let queued = 0;
    let skipped = 0;

    for (const task of overdue) {
      if (task.status === "done" || !task.reminderEnabled || !task.dueDate) {
        continue;
      }
      const intervalMs =
        normalizeReminderEveryDays(task.reminderEveryDays) * DAY_MS;
      if (
        task.lastReminderQueuedAt !== undefined &&
        now - task.lastReminderQueuedAt < intervalMs
      ) {
        continue;
      }

      const org = await ctx.db.get(task.orgId);
      const assignee = task.assigneeMemberId
        ? await ctx.db.get(task.assigneeMemberId)
        : null;
      const email = assignee?.email?.trim();
      const subject = `Task overdue: ${task.title}`;
      const body = [
        `${memberName(assignee)},`,
        "",
        `The task "${task.title}" in ${org?.name ?? "GatherHub"} is overdue.`,
        `Due date: ${task.dueDate}.`,
        "",
        `This reminder repeats every ${task.reminderEveryDays} days until the task is marked Done or removed.`,
      ].join("\n");

      await ctx.db.insert("taskReminderEmails", {
        orgId: task.orgId,
        taskId: task._id,
        assigneeMemberId: task.assigneeMemberId,
        email: email || undefined,
        status: email ? "queued" : "skipped",
        subject,
        body,
        dueDate: task.dueDate,
        queuedAt: now,
        error: email ? undefined : "No assignee email address.",
      });
      await ctx.db.patch(task._id, { lastReminderQueuedAt: now });
      if (email) queued += 1;
      else skipped += 1;
    }

    return { queued, skipped };
  },
});
