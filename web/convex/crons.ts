import { cronJobs, makeFunctionReference } from "convex/server";

type EmptyArgs = Record<string, never>;

const queueDueReminders = makeFunctionReference<
  "mutation",
  EmptyArgs,
  { queued: number; skipped: number }
>("tasks:queueDueReminders");

const sendQueuedReminderEmails = makeFunctionReference<
  "action",
  EmptyArgs,
  { configured: boolean; sent: number; failed: number; queued: number }
>("taskReminderEmailSender:sendQueued");

const crons = cronJobs();

crons.daily(
  "queue overdue task reminders",
  { hourUTC: 16, minuteUTC: 5 },
  queueDueReminders,
  {},
);

crons.hourly(
  "send queued task reminder emails",
  { minuteUTC: 15 },
  sendQueuedReminderEmails,
  {},
);

export default crons;
