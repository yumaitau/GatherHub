import { mutation, query, internalAction } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { requireRole, requireUser, hasAtLeastRole } from "./lib/auth";
import { roleValidator } from "./schema";
import { generateTagId } from "./lib/ids";

/**
 * Email-based organisation invitations. Admin+ sends an invitation to an
 * email + role; the recipient receives a link with an opaque code, signs in
 * (or signs up) via Clerk, and accepts. Codes are single-use, expire after
 * 7 days, and are scoped to one org.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function newCode(): string {
  // Reuse the opaque-id generator; strip "tag_" prefix.
  return generateTagId().slice(4);
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Send (or refresh) an invitation. Admin+ only. */
export const send = mutation({
  args: { email: v.string(), role: roleValidator },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "admin");
    const email = normaliseEmail(args.email);
    if (!email.includes("@")) throw new ConvexError("Enter a valid email.");

    if (args.role === "owner" && auth.role !== "owner") {
      throw new ConvexError("Only an owner can invite another owner.");
    }

    const existing = await ctx.db
      .query("invitations")
      .withIndex("by_org_and_email", (q) =>
        q.eq("orgId", auth.org._id).eq("email", email),
      )
      .collect();
    // Revoke any open invite for the same email so there's at most one live.
    for (const inv of existing) {
      if (!inv.acceptedAt && !inv.revokedAt) {
        await ctx.db.patch(inv._id, { revokedAt: Date.now() });
      }
    }

    const code = newCode();
    const id = await ctx.db.insert("invitations", {
      orgId: auth.org._id,
      email,
      role: args.role,
      code,
      invitedByUserId: auth.user._id,
      expiresAt: Date.now() + INVITE_TTL_MS,
    });

    await ctx.scheduler.runAfter(0, internal.invitations.deliver, {
      email,
      orgName: auth.org.name,
      inviterName:
        `${auth.user.firstName ?? ""} ${auth.user.lastName ?? ""}`.trim() ||
        auth.user.email ||
        "An admin",
      role: args.role,
      code,
    });

    return { invitationId: id };
  },
});

/** List the active org's invitations (admin+). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireRole(ctx, "admin");
    const rows = await ctx.db
      .query("invitations")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    return rows
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((r) => ({
        id: r._id,
        email: r.email,
        role: r.role,
        status: r.revokedAt
          ? ("revoked" as const)
          : r.acceptedAt
            ? ("accepted" as const)
            : r.expiresAt < Date.now()
              ? ("expired" as const)
              : ("pending" as const),
        sentAt: r._creationTime,
        expiresAt: r.expiresAt,
        acceptedAt: r.acceptedAt,
      }));
  },
});

/** Revoke a pending invitation. Admin+ only. */
export const revoke = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "admin");
    const inv = await ctx.db.get(args.invitationId);
    if (!inv || inv.orgId !== auth.org._id) {
      throw new ConvexError("Not found.");
    }
    if (inv.acceptedAt || inv.revokedAt) return;
    await ctx.db.patch(inv._id, { revokedAt: Date.now() });
  },
});

/**
 * Public preview of an invitation by code. Used by the accept page to render
 * "You are invited to join X" before the user signs in. Returns the bare
 * minimum — never anything tenant-private.
 */
export const preview = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const inv = await ctx.db
      .query("invitations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!inv) return { status: "not_found" as const };
    if (inv.revokedAt) return { status: "revoked" as const };
    if (inv.acceptedAt) return { status: "accepted" as const };
    if (inv.expiresAt < Date.now()) return { status: "expired" as const };
    const org = await ctx.db.get(inv.orgId);
    return {
      status: "pending" as const,
      orgName: org?.name ?? "an organisation",
      email: inv.email,
      role: inv.role,
    };
  },
});

/**
 * Accept an invitation. Caller must be signed in. The signed-in user's email
 * must match the invited email (case-insensitive). On success a membership
 * is created (or upgraded to the invited role) and the org becomes active.
 */
export const accept = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const inv = await ctx.db
      .query("invitations")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!inv || inv.revokedAt) throw new ConvexError("Invitation not found.");
    if (inv.acceptedAt) throw new ConvexError("Invitation already used.");
    if (inv.expiresAt < Date.now())
      throw new ConvexError("Invitation expired.");

    const userEmail = (user.email ?? "").trim().toLowerCase();
    if (userEmail !== inv.email) {
      throw new ConvexError(
        `This invitation was sent to ${inv.email}. Sign in with that email to accept.`,
      );
    }

    const existingMembership = await ctx.db
      .query("memberships")
      .withIndex("by_org_and_user", (q) =>
        q.eq("orgId", inv.orgId).eq("userId", user._id),
      )
      .unique();
    if (existingMembership) {
      // Upgrade only — never silently demote an existing membership. An
      // admin can craft an invite with a lower role for a current owner;
      // accepting it must not strip privileges.
      if (hasAtLeastRole(inv.role, existingMembership.role)) {
        await ctx.db.patch(existingMembership._id, { role: inv.role });
      }
    } else {
      await ctx.db.insert("memberships", {
        orgId: inv.orgId,
        userId: user._id,
        role: inv.role,
      });
    }

    await ctx.db.patch(inv._id, {
      acceptedAt: Date.now(),
      acceptedByUserId: user._id,
    });
    await ctx.db.patch(user._id, { activeOrgId: inv.orgId });
    return { orgId: inv.orgId };
  },
});

/**
 * Internal action: deliver the invitation email via Resend. Falls back to a
 * server log if RESEND_API_KEY is unset, so the dev loop still works without
 * email wired up.
 */
export const deliver = internalAction({
  args: {
    email: v.string(),
    orgName: v.string(),
    inviterName: v.string(),
    role: roleValidator,
    code: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.INVITE_FROM_EMAIL ?? "invites@gatherhub.local";
    const appUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:5173";
    const link = `${appUrl}/invite/${args.code}`;
    const subject = `${args.inviterName} invited you to join ${args.orgName} on GatherHub`;
    const text =
      `${args.inviterName} invited you to join ${args.orgName} as ${args.role}.\n\n` +
      `Accept here: ${link}\n\n` +
      `This link expires in 7 days. If you weren't expecting this, you can ignore it.`;

    if (!apiKey) {
      console.warn(
        `[invitations.deliver] RESEND_API_KEY not set — would have emailed ${args.email}\n${text}`,
      );
      return;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: args.email,
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[invitations.deliver] Resend ${res.status}: ${body}`);
      throw new Error(`Failed to send invitation email (${res.status})`);
    }
  },
});
