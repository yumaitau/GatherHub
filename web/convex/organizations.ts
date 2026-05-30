import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireRole, requireUser } from "./lib/auth";
import { generateSlug, generateTagId } from "./lib/ids";
import { seedAllDefaultsForOrg } from "./taxonomies";

/**
 * Convex-native organisation (club) lifecycle: create, join by invite code,
 * switch the active org, leave, and rotate the invite code. Clerk is not
 * involved — orgs and memberships live entirely here.
 */

function newInviteCode(): string {
  // Reuse the opaque-id generator; strip the "tag_" prefix for a short code.
  return generateTagId().slice(4, 14).toUpperCase();
}

/** Create a new club. The caller becomes its owner and active member. */
export const create = mutation({
  args: { name: v.string(), slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Name is required.");

    const slug = args.slug?.trim() || generateSlug(name);
    const slugClash = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (slugClash) throw new ConvexError("That slug is already taken.");

    const orgId = await ctx.db.insert("organizations", {
      name,
      slug,
      createdBy: user._id,
      inviteCode: newInviteCode(),
    });
    await ctx.db.insert("memberships", {
      orgId,
      userId: user._id,
      role: "owner",
    });
    await ctx.db.patch(user._id, { activeOrgId: orgId });
    await seedAllDefaultsForOrg(ctx, orgId);
    return { orgId, slug };
  },
});

/**
 * Join an existing club using its current invite code. The caller is added as
 * a `player` (admins can promote later) and the club becomes their active org.
 */
export const joinByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const code = args.code.trim().toUpperCase();
    if (!code) throw new ConvexError("Enter an invite code.");

    const org = await ctx.db
      .query("organizations")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", code))
      .unique();
    if (!org) throw new ConvexError("Invalid invite code.");

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_org_and_user", (q) =>
        q.eq("orgId", org._id).eq("userId", user._id),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("memberships", {
        orgId: org._id,
        userId: user._id,
        role: "player",
      });
    }
    await ctx.db.patch(user._id, { activeOrgId: org._id });
    return { orgId: org._id };
  },
});

/** Switch the caller's active club. Caller must already be a member. */
export const setActive = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_org_and_user", (q) =>
        q.eq("orgId", args.orgId).eq("userId", user._id),
      )
      .unique();
    if (!membership) throw new ConvexError("Not a member of that club.");
    await ctx.db.patch(user._id, { activeOrgId: args.orgId });
  },
});

/**
 * Leave a club. The last owner cannot leave (must transfer ownership first).
 * If the org being left is the active one, `activeOrgId` is cleared.
 */
export const leave = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_org_and_user", (q) =>
        q.eq("orgId", args.orgId).eq("userId", user._id),
      )
      .unique();
    if (!membership) return;

    if (membership.role === "owner") {
      const owners = (
        await ctx.db
          .query("memberships")
          .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
          .collect()
      ).filter((m) => m.role === "owner");
      if (owners.length <= 1) {
        throw new ConvexError(
          "Transfer ownership before leaving — you are the last owner.",
        );
      }
    }

    await ctx.db.delete(membership._id);
    if (user.activeOrgId === args.orgId) {
      const next = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();
      await ctx.db.patch(user._id, {
        activeOrgId: next?.orgId as Id<"organizations"> | undefined,
      });
    }
  },
});

/**
 * Read the active org's invite code. Admin-and-above only — the code is what
 * lets anyone join, so it should not leak to ordinary members.
 */
export const getInviteCode = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireRole(ctx, "admin");
    return { code: auth.org.inviteCode ?? null };
  },
});

/** Rotate (or set, if missing) the active org's invite code. Admin+ only. */
export const rotateInviteCode = mutation({
  args: {},
  handler: async (ctx) => {
    const auth = await requireRole(ctx, "admin");
    const code = newInviteCode();
    await ctx.db.patch(auth.org._id, { inviteCode: code });
    return { code };
  },
});

/** Edit basic club details (name, slug, image). Admin+ only. */
export const update = mutation({
  args: {
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "admin");
    const patch: Record<string, string> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new ConvexError("Name is required.");
      patch.name = name;
    }
    if (args.slug !== undefined) {
      const slug = args.slug.trim();
      if (slug && slug !== auth.org.slug) {
        const clash = await ctx.db
          .query("organizations")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .unique();
        if (clash) throw new ConvexError("That slug is already taken.");
      }
      patch.slug = slug;
    }
    if (args.imageUrl !== undefined) patch.imageUrl = args.imageUrl;
    await ctx.db.patch(auth.org._id, patch);
  },
});
