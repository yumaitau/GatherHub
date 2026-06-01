import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { taskReminderEmailStatusValidator } from "./schema";

export const listQueued = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const reminders = await ctx.db
      .query("taskReminderEmails")
      .withIndex("by_status_queued", (q) => q.eq("status", "queued"))
      .take(args.limit ?? 25);
    return await Promise.all(
      reminders.map(async (reminder) => {
        const task = await ctx.db.get(reminder.taskId);
        return {
          ...reminder,
          taskDeliverable: Boolean(task && task.status !== "done"),
        };
      }),
    );
  },
});

export const mark = internalMutation({
  args: {
    reminderId: v.id("taskReminderEmails"),
    status: taskReminderEmailStatusValidator,
    providerMessageId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.reminderId, {
      status: args.status,
      providerMessageId: args.providerMessageId,
      error: args.error,
      sentAt: args.status === "sent" ? now : undefined,
      failedAt: args.status === "failed" ? now : undefined,
    });
  },
});
