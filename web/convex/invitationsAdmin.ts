import { internalQuery } from "./_generated/server";
import { requireRole } from "./lib/auth";

/**
 * Admin-context lookup for the Clerk-native invitations actions in
 * `invitations.ts`. Lives in its own file because the actions file uses
 * `"use node"`, which forbids defining queries/mutations alongside.
 */
export const requireAdminContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const auth = await requireRole(ctx, "admin");
    return {
      orgId: String(auth.org._id),
      role: auth.role,
      userId: String(auth.user._id),
    };
  },
});
