import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { requireRole } from "./lib/auth";
import { requireCapability, roleTemplatesForOrg } from "./lib/capabilities";
import { roleValidator } from "./schema";

/**
 * Committee-context lookup for the Clerk-native invitations actions in
 * `invitations.ts`. Lives in its own file because the actions file uses
 * `"use node"`, which forbids defining queries/mutations alongside.
 */
export const requireAdminContext = internalQuery({
  args: {
    role: v.optional(roleValidator),
    roleKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    await requireCapability(ctx, auth, "invitations.manage");
    let resolvedRole = args.role ?? "player";
    let resolvedRoleKey: string | undefined;
    let resolvedRoleDisplayName: string | undefined;

    if (args.roleKey) {
      const configured =
        (await ctx.db
          .query("organizationRoles")
          .withIndex("by_org_key", (q) =>
            q.eq("orgId", auth.org._id).eq("key", args.roleKey!),
          )
          .unique()) ??
        roleTemplatesForOrg(auth.org).find((row) => row.key === args.roleKey);
      if (!configured || ("active" in configured && !configured.active)) {
        throw new Error("Role is not configured.");
      }
      resolvedRole = configured.legacyRole ?? resolvedRole;
      resolvedRoleKey = configured.key;
      resolvedRoleDisplayName = configured.displayName;
    } else if (args.role) {
      const configured = (
        await ctx.db
          .query("organizationRoles")
          .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
          .collect()
      ).find((row) => row.active && row.legacyRole === args.role);
      const template = roleTemplatesForOrg(auth.org).find(
        (row) => row.legacyRole === args.role,
      );
      resolvedRoleKey = configured?.key ?? template?.key;
      resolvedRoleDisplayName =
        configured?.displayName ?? template?.displayName;
    }

    return {
      orgId: String(auth.org._id),
      role: auth.role,
      userId: String(auth.user._id),
      resolvedRole,
      resolvedRoleKey,
      resolvedRoleDisplayName,
    };
  },
});
