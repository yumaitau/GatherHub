import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { Role } from "./lib/auth";

/**
 * Internal mutations invoked by the Clerk webhook (convex/http.ts) to keep the
 * Convex mirror of users / organisations / memberships in sync server-side.
 * These complement the client-side `sync.ensureFromClient` path.
 */

function mapClerkRole(clerkRole: string | undefined): Role {
  const r = (clerkRole ?? "").toLowerCase();
  if (r.includes("admin")) return "admin";
  if (r.includes("owner")) return "owner";
  return "player";
}

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
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const upsertOrganization = internalMutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("organizations", args);
  },
});

export const upsertMembership = internalMutation({
  args: {
    clerkOrgId: v.string(),
    clerkUserId: v.string(),
    clerkRole: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!org || !user) return; // out-of-order webhook; client sync will reconcile

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_org_and_clerk_user", (q) =>
        q.eq("orgId", org._id).eq("clerkUserId", args.clerkUserId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { userId: user._id });
      return existing._id;
    }
    return await ctx.db.insert("memberships", {
      orgId: org._id as Id<"organizations">,
      userId: user._id,
      clerkUserId: args.clerkUserId,
      role: mapClerkRole(args.clerkRole),
    });
  },
});

export const removeMembership = internalMutation({
  args: { clerkOrgId: v.string(), clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();
    if (!org) return;
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_org_and_clerk_user", (q) =>
        q.eq("orgId", org._id).eq("clerkUserId", args.clerkUserId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
