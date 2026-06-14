import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { postNotificationStatusValidator } from "./schema";
import { COMMUNITY_POSTS_SCOPE } from "./emailOptOuts";
import { htmlToText, postContentHtml, renderPostEmail } from "./emailTemplates";
import { signUnsubscribe } from "./lib/unsubscribe";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Shared context needed to render a post email, independent of recipient. */
type PostContext = {
  orgId: Id<"organizations">;
  postId: Id<"posts">;
  orgName: string;
  orgLogo?: string;
  authorName: string;
  teamName?: string;
  postTitle?: string;
  bodyHtml: string;
  bodyText: string;
  postUrl: string;
};

function memberName(member: Doc<"members">): string {
  return `${member.firstName} ${member.lastName}`.trim();
}

function appBaseUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ??
    process.env.VITE_PUBLIC_APP_URL ??
    ""
  ).replace(/\/+$/, "");
}

/** Build the recipient-independent email context for a post (or null if gone). */
async function buildPostContext(
  ctx: QueryCtx | MutationCtx,
  post: Doc<"posts">,
): Promise<PostContext> {
  const org = await ctx.db.get(post.orgId);
  const author = await ctx.db.get(post.createdBy);
  const authorName =
    `${author?.firstName ?? ""} ${author?.lastName ?? ""}`.trim() || "A member";
  const team = post.teamId ? await ctx.db.get(post.teamId) : null;
  const isHtml = post.bodyFormat === "html";
  const appUrl = appBaseUrl();
  return {
    orgId: post.orgId,
    postId: post._id,
    orgName: org?.name ?? "Your club",
    orgLogo: org?.imageUrl,
    authorName,
    teamName: team?.name,
    postTitle: post.title,
    bodyHtml: postContentHtml(post.body, isHtml),
    bodyText: htmlToText(post.body),
    postUrl: appUrl ? `${appUrl}/posts` : "",
  };
}

/**
 * Resolve a post's audience, insert one queued notification row per recipient,
 * and return the rows plus the shared render context. Audience:
 * - team post → that team's roster (members table via teamMembers)
 * - org-wide post → all active org members
 * In both cases only members with an email on file are notified; the author,
 * duplicate addresses, and opted-out addresses are excluded.
 */
export const enqueue = internalMutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;

    let recipientMembers: Doc<"members">[];
    if (post.teamId) {
      const links = await ctx.db
        .query("teamMembers")
        .withIndex("by_team", (q) => q.eq("teamId", post.teamId!))
        .collect();
      const members = await Promise.all(
        links.map((link) => ctx.db.get(link.memberId)),
      );
      recipientMembers = members.filter(
        (m): m is Doc<"members"> => m !== null && m.status === "active",
      );
    } else {
      recipientMembers = await ctx.db
        .query("members")
        .withIndex("by_org_and_status", (q) =>
          q.eq("orgId", post.orgId).eq("status", "active"),
        )
        .collect();
    }

    const optOuts = await ctx.db
      .query("emailOptOuts")
      .withIndex("by_org_and_scope", (q) =>
        q.eq("orgId", post.orgId).eq("scope", COMMUNITY_POSTS_SCOPE),
      )
      .collect();
    const optedOut = new Set(optOuts.map((row) => row.email));

    const author = await ctx.db.get(post.createdBy);
    const authorEmail = author?.email?.trim().toLowerCase();

    const seen = new Set<string>();
    const now = Date.now();
    const recipients: {
      notificationId: Id<"postNotifications">;
      email: string;
      name?: string;
    }[] = [];

    for (const member of recipientMembers) {
      const raw = member.email?.trim();
      if (!raw) continue;
      const email = raw.toLowerCase();
      if (email === authorEmail) continue;
      if (member.userId && member.userId === post.createdBy) continue;
      if (optedOut.has(email)) continue;
      if (seen.has(email)) continue;
      seen.add(email);

      const name = memberName(member) || undefined;
      const notificationId = await ctx.db.insert("postNotifications", {
        orgId: post.orgId,
        postId: post._id,
        recipientEmail: raw,
        recipientName: name,
        memberId: member._id,
        userId: member.userId,
        status: "queued",
        queuedAt: now,
      });
      recipients.push({ notificationId, email: raw, name });
    }

    if (recipients.length === 0) return null;
    const context = await buildPostContext(ctx, post);
    return { context, recipients };
  },
});

/** Update a notification row to its final delivery state. */
export const mark = internalMutation({
  args: {
    notificationId: v.id("postNotifications"),
    status: postNotificationStatusValidator,
    providerMessageId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.notificationId, {
      status: args.status,
      providerMessageId: args.providerMessageId,
      error: args.error,
      sentAt: args.status === "sent" ? now : undefined,
      failedAt: args.status === "failed" ? now : undefined,
    });
  },
});

/** Notification rows still awaiting delivery (used by the backstop cron). */
export const listQueued = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("postNotifications")
      .withIndex("by_status_queued", (q) => q.eq("status", "queued"))
      .take(args.limit ?? 50);
    return rows.map((row) => ({
      notificationId: row._id,
      postId: row.postId,
      email: row.recipientEmail,
      name: row.recipientName,
    }));
  },
});

/** Recipient-independent render context for one post (null if deleted). */
export const contextForPost = internalQuery({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;
    return await buildPostContext(ctx, post);
  },
});

type EmailConfig = {
  apiKey: string;
  fromEmail: string;
  secret: string;
  siteUrl?: string;
};

/** Read + validate the email-sending environment. Null when not configured. */
function emailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.COMMUNITY_POST_FROM_EMAIL ??
    process.env.RESEND_FROM_EMAIL ??
    process.env.TASK_REMINDER_FROM_EMAIL;
  if (!apiKey || !fromEmail) return null;
  return {
    apiKey,
    fromEmail,
    // The unsubscribe secret falls back to the Resend key so signing always
    // has a key without requiring an extra secret to be provisioned.
    secret: process.env.UNSUBSCRIBE_SECRET ?? apiKey,
    siteUrl: process.env.CONVEX_SITE_URL?.replace(/\/+$/, ""),
  };
}

async function unsubscribeUrl(
  config: EmailConfig,
  orgId: Id<"organizations">,
  email: string,
): Promise<string> {
  if (!config.siteUrl) {
    return `mailto:${config.fromEmail}?subject=${encodeURIComponent(
      "Unsubscribe from post emails",
    )}`;
  }
  const token = await signUnsubscribe(
    { orgId, email, scope: COMMUNITY_POSTS_SCOPE },
    config.secret,
  );
  return `${config.siteUrl}/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Send one post email via Resend. Returns the final delivery state. */
async function sendOne(
  config: EmailConfig,
  context: PostContext,
  recipient: {
    notificationId: Id<"postNotifications">;
    email: string;
    name?: string;
  },
): Promise<{
  status: "sent" | "failed";
  providerMessageId?: string;
  error?: string;
}> {
  try {
    const unsub = await unsubscribeUrl(config, context.orgId, recipient.email);
    const { subject, html, text } = renderPostEmail({
      orgName: context.orgName,
      orgLogo: context.orgLogo,
      authorName: context.authorName,
      teamName: context.teamName,
      postTitle: context.postTitle,
      bodyHtml: context.bodyHtml,
      bodyText: context.bodyText,
      postUrl: context.postUrl || unsub,
      unsubscribeUrl: unsub,
      recipientName: recipient.name,
    });
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `post-notif-${recipient.notificationId}`,
      },
      body: JSON.stringify({
        from: config.fromEmail,
        to: recipient.email,
        subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<${unsub}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend returned ${response.status}. ${detail}`.trim());
    }
    const payload = await response.json().catch(() => ({}));
    return {
      status: "sent",
      providerMessageId:
        typeof payload.id === "string" ? payload.id : undefined,
    };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Explicit result types: these actions call same-module internal functions via
// `internal.postNotifications.*`, so without annotations TS infers their return
// type from their own body and reports a circular-reference `any`.
type DeliverResult = {
  configured: boolean;
  recipients: number;
  sent: number;
  failed: number;
};
type SendQueuedResult = {
  configured: boolean;
  sent: number;
  failed: number;
  queued?: number;
};

/**
 * Resolve a new post's audience and email it immediately. Scheduled from
 * `posts.create` right after the post commits. If email isn't configured the
 * queued rows are left for the backstop cron to pick up once it is.
 */
export const deliver = internalAction({
  args: { postId: v.id("posts") },
  handler: async (ctx, args): Promise<DeliverResult> => {
    const job = await ctx.runMutation(internal.postNotifications.enqueue, {
      postId: args.postId,
    });
    if (!job) return { configured: true, recipients: 0, sent: 0, failed: 0 };

    const config = emailConfig();
    if (!config) {
      return {
        configured: false,
        recipients: job.recipients.length,
        sent: 0,
        failed: 0,
      };
    }

    let sent = 0;
    let failed = 0;
    for (const recipient of job.recipients) {
      const result = await sendOne(config, job.context, recipient);
      await ctx.runMutation(internal.postNotifications.mark, {
        notificationId: recipient.notificationId,
        status: result.status,
        providerMessageId: result.providerMessageId,
        error: result.error,
      });
      if (result.status === "sent") sent += 1;
      else failed += 1;
    }
    return {
      configured: true,
      recipients: job.recipients.length,
      sent,
      failed,
    };
  },
});

/**
 * Backstop: deliver any notifications left queued (e.g. the immediate send
 * crashed, or email was configured after the post was created). Runs on a cron.
 */
export const sendQueued = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<SendQueuedResult> => {
    const rows = await ctx.runQuery(internal.postNotifications.listQueued, {
      limit: args.limit ?? 50,
    });
    if (rows.length === 0) return { configured: true, sent: 0, failed: 0 };

    const config = emailConfig();
    if (!config) {
      return { configured: false, sent: 0, failed: 0, queued: rows.length };
    }

    const contexts = new Map<string, PostContext | null>();
    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      const key = row.postId as string;
      if (!contexts.has(key)) {
        contexts.set(
          key,
          await ctx.runQuery(internal.postNotifications.contextForPost, {
            postId: row.postId,
          }),
        );
      }
      const context = contexts.get(key) ?? null;
      if (!context) {
        await ctx.runMutation(internal.postNotifications.mark, {
          notificationId: row.notificationId,
          status: "skipped",
          error: "Post no longer exists.",
        });
        continue;
      }
      const result = await sendOne(config, context, {
        notificationId: row.notificationId,
        email: row.email,
        name: row.name,
      });
      await ctx.runMutation(internal.postNotifications.mark, {
        notificationId: row.notificationId,
        status: result.status,
        providerMessageId: result.providerMessageId,
        error: result.error,
      });
      if (result.status === "sent") sent += 1;
      else failed += 1;
    }
    return { configured: true, sent, failed };
  },
});
