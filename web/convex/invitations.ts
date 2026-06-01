"use node";

import { v, ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { createClerkClient } from "@clerk/backend";
import { roleValidator } from "./schema";

/**
 * Clerk-native invitations. Committee sends → Clerk emails invite link →
 * /sign-up consumes Clerk's ticket and creates the account → on first sign-in
 * `syncClerk.ensureFromClerk` reads `publicMetadata.pendingOrgId` +
 * `pendingRole`/`pendingRoleKey` from Clerk and creates the Convex membership.
 *
 * Replaces the previous in-house invitations table + Resend wiring
 * (no separate code, no email delivery infra, no AcceptInvitePage).
 *
 * Requires `CLERK_SECRET_KEY` on the Convex deployment:
 *   npx convex env set CLERK_SECRET_KEY sk_live_xxx
 */

const clerkClient = () =>
  createClerkClient({ secretKey: requireClerkSecretKey() });

/** Send an invitation via Clerk. Committee+ only. */
export const send = action({
  args: {
    email: v.string(),
    role: roleValidator,
    roleKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await ctx.runQuery(
      internal.invitationsAdmin.requireAdminContext,
      { role: args.role, roleKey: args.roleKey },
    );
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) throw new ConvexError("Enter a valid email.");

    if (auth.resolvedRole === "owner" && auth.role !== "owner") {
      throw new ConvexError("Only an owner can invite another owner.");
    }

    const appUrl = getPublicAppUrl();

    try {
      const invitation = await clerkClient().invitations.createInvitation({
        emailAddress: email,
        publicMetadata: {
          pendingOrgId: auth.orgId,
          pendingRole: auth.resolvedRole,
          pendingRoleKey: auth.resolvedRoleKey,
          pendingRoleDisplayName: auth.resolvedRoleDisplayName,
          invitedBy: auth.userId,
        },
        // Point at /sign-up — Clerk's hosted /v1/tickets/accept endpoint
        // appends `__clerk_ticket=...` to this URL; SignUpPage consumes
        // the ticket and completes the invitation.
        redirectUrl: `${appUrl}/sign-up`,
        notify: true,
        ignoreExisting: true,
        expiresInDays: 30,
      });
      return { invitationId: invitation.id };
    } catch (err: unknown) {
      throw new ConvexError(
        clerkErrorMessage(err, "Couldn't send invitation."),
      );
    }
  },
});

export type InvitationRow = {
  id: string;
  email: string;
  role: string;
  roleKey: string | null;
  roleDisplayName: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  sentAt: number;
  acceptedAt: number | null;
};

/** List Clerk invitations scoped to the active org. Committee+ only. */
export const list = action({
  args: {},
  handler: async (ctx): Promise<InvitationRow[]> => {
    const auth = await ctx.runQuery(
      internal.invitationsAdmin.requireAdminContext,
      {},
    );
    const { data } = await clerkClient().invitations.getInvitationList({
      limit: 200,
    });
    return data
      .filter((inv) => {
        const meta = (inv.publicMetadata ?? {}) as Record<string, unknown>;
        return meta.pendingOrgId === auth.orgId;
      })
      .map((inv) => {
        const meta = (inv.publicMetadata ?? {}) as Record<string, unknown>;
        return {
          id: inv.id,
          email: inv.emailAddress,
          role: (meta.pendingRole as string) ?? "player",
          roleKey: (meta.pendingRoleKey as string) ?? null,
          roleDisplayName: (meta.pendingRoleDisplayName as string) ?? null,
          status: inv.status as "pending" | "accepted" | "revoked" | "expired",
          sentAt: inv.createdAt,
          acceptedAt: inv.status === "accepted" ? inv.updatedAt : null,
        };
      })
      .sort((a, b) => b.sentAt - a.sentAt);
  },
});

/** Revoke a pending Clerk invitation. Committee+ only. */
export const revoke = action({
  args: { invitationId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.invitationsAdmin.requireAdminContext, {});
    try {
      await clerkClient().invitations.revokeInvitation(args.invitationId);
    } catch (err) {
      throw new ConvexError(
        clerkErrorMessage(err, "Couldn't revoke invitation."),
      );
    }
  },
});

/**
 * Clerk doesn't support hard-delete on invitations; `remove` aliases
 * to `revoke` so the UI delete button stays idempotent. Revoking an
 * already-revoked invitation throws, so we swallow that case.
 */
export const remove = action({
  args: { invitationId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.invitationsAdmin.requireAdminContext, {});
    try {
      await clerkClient().invitations.revokeInvitation(args.invitationId);
    } catch {
      // idempotent
    }
  },
});

function requireClerkSecretKey(): string {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new ConvexError(
      "CLERK_SECRET_KEY is not configured in the Convex environment.",
    );
  }
  return secretKey;
}

function getPublicAppUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ??
    process.env.VITE_PUBLIC_APP_URL ??
    "http://localhost:5173"
  ).replace(/\/+$/, "");
}

function clerkErrorMessage(err: unknown, fallback: string): string {
  if (
    err &&
    typeof err === "object" &&
    "errors" in err &&
    Array.isArray((err as { errors?: unknown }).errors)
  ) {
    const first = (err as { errors: unknown[] }).errors[0] as
      | {
          longMessage?: string;
          long_message?: string;
          message?: string;
        }
      | undefined;
    return (
      first?.longMessage ?? first?.long_message ?? first?.message ?? fallback
    );
  }

  return err instanceof Error ? err.message : fallback;
}
