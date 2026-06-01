import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

const listQueued = makeFunctionReference<
  "query",
  { limit?: number },
  (Doc<"taskReminderEmails"> & { taskDeliverable: boolean })[]
>("taskReminderEmails:listQueued");

const markReminder = makeFunctionReference<
  "mutation",
  {
    reminderId: Id<"taskReminderEmails">;
    status: "queued" | "sent" | "failed" | "skipped";
    providerMessageId?: string;
    error?: string;
  },
  null
>("taskReminderEmails:mark");

export const sendQueued = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFrom =
      process.env.TASK_REMINDER_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL;
    const endpoint =
      process.env.TASK_REMINDER_EMAIL_WEBHOOK_URL ??
      process.env.TASK_REMINDER_WEBHOOK_URL;
    const token = process.env.TASK_REMINDER_WEBHOOK_TOKEN;
    const queued = await ctx.runQuery(listQueued, {
      limit: args.limit ?? 25,
    });
    if ((!resendApiKey || !resendFrom) && !endpoint) {
      return { configured: false, sent: 0, failed: 0, queued: queued.length };
    }

    let sent = 0;
    let failed = 0;
    for (const reminder of queued) {
      if (!reminder.taskDeliverable) {
        await ctx.runMutation(markReminder, {
          reminderId: reminder._id,
          status: "skipped",
          error: "Task is done or removed.",
        });
        continue;
      }
      if (!reminder.email) {
        await ctx.runMutation(markReminder, {
          reminderId: reminder._id,
          status: "skipped",
          error: "No recipient email address.",
        });
        continue;
      }

      try {
        const response =
          resendApiKey && resendFrom
            ? await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${resendApiKey}`,
                  "Content-Type": "application/json",
                  "Idempotency-Key": `task-reminder-${reminder._id}`,
                },
                body: JSON.stringify({
                  from: resendFrom,
                  to: reminder.email,
                  subject: reminder.subject,
                  text: reminder.body,
                }),
              })
            : await fetch(endpoint!, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                  to: reminder.email,
                  subject: reminder.subject,
                  text: reminder.body,
                  orgId: reminder.orgId,
                  taskId: reminder.taskId,
                  reminderId: reminder._id,
                }),
              });
        if (!response.ok) {
          throw new Error(`Email provider returned ${response.status}.`);
        }
        const payload = await response.json().catch(() => ({}));
        await ctx.runMutation(markReminder, {
          reminderId: reminder._id,
          status: "sent",
          providerMessageId:
            typeof payload.id === "string" ? payload.id : undefined,
        });
        sent += 1;
      } catch (err) {
        await ctx.runMutation(markReminder, {
          reminderId: reminder._id,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
        failed += 1;
      }
    }

    return { configured: true, sent, failed, queued: queued.length };
  },
});
