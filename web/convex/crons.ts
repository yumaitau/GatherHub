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

const sendQueuedPostNotifications = makeFunctionReference<
  "action",
  { limit?: number },
  { configured: boolean; sent: number; failed: number; queued?: number }
>("postNotifications:sendQueued");

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

// Backstop for community-post notifications: posts notify immediately on
// create, but this retries any rows left queued (immediate send crashed, or
// email was configured after the post was made).
crons.interval(
  "send queued post notification emails",
  { minutes: 30 },
  sendQueuedPostNotifications,
  {},
);

export default crons;
