import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, requireRole, assertSameOrg } from "./lib/auth";
import { capabilityValidator, roleValidator } from "./schema";
import {
  CAPABILITIES,
  coerceCapabilityList,
  effectiveRoleForMembership,
  ensureOrganizationRoles,
  requireCapability,
  roleTemplatesForOrg,
} from "./lib/capabilities";

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
        const effectiveRole = await effectiveRoleForMembership(
          ctx,
          auth.org._id,
          m,
        );
        return {
          membershipId: m._id,
          role: m.role,
          roleKey: effectiveRole.roleKey,
          roleDisplayName: effectiveRole.displayName,
          capabilities: effectiveRole.capabilities,
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

export const listConfigured = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const rows = await ctx.db
      .query("organizationRoles")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const roles =
      rows.length > 0
        ? rows
            .filter((row) => row.active)
            .sort((a, b) => a.order - b.order)
            .map((row) => ({
              id: row._id,
              key: row.key,
              displayName: row.displayName,
              description: row.description,
              legacyRole: row.legacyRole,
              capabilities: row.capabilities,
              isSystem: row.isSystem ?? false,
              active: row.active,
              order: row.order,
            }))
        : roleTemplatesForOrg(auth.org).map((row, order) => ({
            id: null,
            key: row.key,
            displayName: row.displayName,
            description: row.description,
            legacyRole: row.legacyRole,
            capabilities: row.capabilities,
            isSystem: true,
            active: true,
            order,
          }));
    return {
      roles,
      capabilities: CAPABILITIES,
    };
  },
});

/**
 * Change a member's role. Committee+ may manage non-owner roles; only owners
 * may grant or change the owner role; the last remaining owner cannot be
 * demoted.
 */
export const updateRole = mutation({
  args: {
    membershipId: v.id("memberships"),
    role: roleValidator,
    roleKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "roles.manage");
    const target = await ctx.db.get(args.membershipId);
    assertSameOrg(auth, target);
    if (!target) throw new Error("Not found.");
    await ensureOrganizationRoles(ctx, auth.org);

    let nextRole = args.role;
    let nextRoleKey = args.roleKey;
    if (args.roleKey) {
      const configuredRole =
        (await ctx.db
          .query("organizationRoles")
          .withIndex("by_org_key", (q) =>
            q.eq("orgId", auth.org._id).eq("key", args.roleKey!),
          )
          .unique()) ??
        roleTemplatesForOrg(auth.org).find((row) => row.key === args.roleKey);
      if (!configuredRole) throw new Error("Role is not configured.");
      if ("active" in configuredRole && !configuredRole.active) {
        throw new Error("Role is not active.");
      }
      nextRole = configuredRole.legacyRole ?? args.role;
      nextRoleKey = configuredRole.key;
    }

    if (nextRole === "owner" && auth.role !== "owner") {
      throw new Error("Only an owner can grant the owner role.");
    }

    // Only an owner may mutate another owner's role (demote, transfer).
    // Non-owners must not be able to remove owners.
    if (target.role === "owner" && auth.role !== "owner") {
      throw new Error("Only an owner can change another owner's role.");
    }

    if (target.role === "owner" && nextRole !== "owner") {
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

    await ctx.db.patch(args.membershipId, {
      role: nextRole,
      roleKey: nextRoleKey,
    });
  },
});

export const upsertConfigured = mutation({
  args: {
    key: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
    legacyRole: roleValidator,
    capabilities: v.array(capabilityValidator),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "owner");
    await ensureOrganizationRoles(ctx, auth.org);
    const key = args.key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_");
    const displayName = args.displayName.trim();
    if (!key || !displayName)
      throw new Error("Role key and name are required.");
    const capabilities = coerceCapabilityList(args.capabilities);
    const existing = await ctx.db
      .query("organizationRoles")
      .withIndex("by_org_key", (q) =>
        q.eq("orgId", auth.org._id).eq("key", key),
      )
      .unique();
    const patch = {
      displayName,
      description: args.description?.trim() || undefined,
      legacyRole: args.legacyRole,
      capabilities,
      active: args.active ?? true,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    const rows = await ctx.db
      .query("organizationRoles")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    return await ctx.db.insert("organizationRoles", {
      orgId: auth.org._id,
      key,
      ...patch,
      isSystem: false,
      order: rows.length,
    });
  },
});
