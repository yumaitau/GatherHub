import { internalMutation, MutationCtx } from "./_generated/server";
import { v, Infer } from "convex/values";
import { Id } from "./_generated/dataModel";
import { roleValidator } from "./schema";

/**
 * Internal mutations invoked by the Clerk webhook (convex/http.ts) to keep the
 * Convex `users` mirror in sync with Clerk identities. Organisations and
 * memberships are Convex-native; Clerk application invitation metadata is only
 * used as a signed server-side hint to claim the intended Convex membership.
 */

type Role = Infer<typeof roleValidator>;

export const upsertUser = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    pendingOrgId: v.optional(v.string()),
    pendingRole: v.optional(roleValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    let userId: Id<"users">;
    if (existing) {
      await ctx.db.patch(existing._id, {
        clerkUserId: args.clerkUserId,
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        imageUrl: args.imageUrl,
      });
      userId = existing._id;
    } else {
      userId = await ctx.db.insert("users", {
        clerkUserId: args.clerkUserId,
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        imageUrl: args.imageUrl,
      });
    }

    await claimPendingMembership(
      ctx,
      userId,
      args.pendingOrgId,
      args.pendingRole,
    );
    return userId;
  },
});

export const deleteUser = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!existing) return;
    // Cascade: drop every membership the user held. Org records and tenant
    // data are left intact (other members may still be using them).
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", existing._id))
      .collect();
    for (const m of memberships) await ctx.db.delete(m._id);
    await ctx.db.delete(existing._id);
  },
});

async function claimPendingMembership(
  ctx: MutationCtx,
  userId: Id<"users">,
  pendingOrgId: string | undefined,
  pendingRole: Role | undefined,
) {
  if (!pendingOrgId || !pendingRole) return;

  const orgId = ctx.db.normalizeId("organizations", pendingOrgId);
  if (!orgId) return;

  const org = await ctx.db.get(orgId);
  if (!org) return;

  const existingMembership = await ctx.db
    .query("memberships")
    .withIndex("by_user_and_org", (q) =>
      q.eq("userId", userId).eq("orgId", orgId),
    )
    .unique();

  if (!existingMembership) {
    await ctx.db.insert("memberships", {
      userId,
      orgId,
      role: pendingRole,
    });
  }

  const user = await ctx.db.get(userId);
  if (user && !user.activeOrgId) {
    await ctx.db.patch(userId, { activeOrgId: orgId });
  }
}
