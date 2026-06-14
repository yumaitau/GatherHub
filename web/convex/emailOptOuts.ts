import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/** Email scope used for community-post notifications. */
export const COMMUNITY_POSTS_SCOPE = "community_posts";

/**
 * Record an unsubscribe. Called from the public unsubscribe HTTP endpoint after
 * the signed token is verified, so `orgId`/`email` arrive as plain strings.
 * Idempotent: a repeat click is a no-op.
 */
export const optOut = internalMutation({
  args: { orgId: v.string(), email: v.string(), scope: v.string() },
  handler: async (ctx, args) => {
    const orgId = ctx.db.normalizeId("organizations", args.orgId);
    if (!orgId) return;
    const email = args.email.trim().toLowerCase();
    if (!email) return;
    const existing = await ctx.db
      .query("emailOptOuts")
      .withIndex("by_org_and_scope", (q) =>
        q.eq("orgId", orgId).eq("scope", args.scope),
      )
      .collect();
    if (existing.some((row) => row.email === email)) return;
    await ctx.db.insert("emailOptOuts", {
      orgId,
      email,
      scope: args.scope,
      createdAt: Date.now(),
    });
  },
});
