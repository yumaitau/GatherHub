import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, requireRole, assertSameOrg } from "./lib/auth";
import { roleValidator } from "./schema";

/** List all org members with their user details and role. */
export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    return await Promise.all(
      memberships.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return {
          membershipId: m._id,
          role: m.role,
          userId: m.userId,
          name: user
            ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
            : "Unknown",
          email: user?.email ?? null,
          imageUrl: user?.imageUrl ?? null,
        };
      }),
    );
  },
});

/**
 * Change a member's role. Only admins/owners may do this; only owners may grant
 * the owner role; the last remaining owner cannot be demoted.
 */
export const updateRole = mutation({
  args: { membershipId: v.id("memberships"), role: roleValidator },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "admin");
    const target = await ctx.db.get(args.membershipId);
    assertSameOrg(auth, target);
    if (!target) throw new Error("Not found.");

    if (args.role === "owner" && auth.role !== "owner") {
      throw new Error("Only an owner can grant the owner role.");
    }

    // Only an owner may mutate another owner's role (demote, transfer).
    // Admins must not be able to remove owners.
    if (target.role === "owner" && auth.role !== "owner") {
      throw new Error("Only an owner can change another owner's role.");
    }

    if (target.role === "owner" && args.role !== "owner") {
      const owners = (
        await ctx.db
          .query("memberships")
          .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
          .collect()
      ).filter((m) => m.role === "owner");
      if (owners.length <= 1) {
        throw new Error("Cannot demote the last owner.");
      }
    }

    await ctx.db.patch(args.membershipId, { role: args.role });
  },
});
