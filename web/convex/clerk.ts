import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Internal mutations invoked by the Clerk webhook (convex/http.ts) to keep the
 * Convex `users` mirror in sync with Clerk identities. Organisations and
 * memberships are Convex-native — Clerk never owns them, so there are no org
 * or membership sync handlers here.
 */

export const upsertUser = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("users", args);
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
