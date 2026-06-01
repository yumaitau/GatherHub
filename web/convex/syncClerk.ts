"use node";

import { createClerkClient } from "@clerk/backend";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const ROLES = [
  "owner",
  "admin",
  "committee",
  "coach",
  "volunteer",
  "parent",
  "player",
] as const;

type Role = (typeof ROLES)[number];

type PendingMembership = {
  pendingOrgId: string;
  pendingRole: Role;
  pendingRoleKey?: string;
};

type ClerkPublicMetadata = {
  pendingOrgId?: unknown;
  pendingRole?: unknown;
  pendingRoleKey?: unknown;
};

/**
 * Web-session sync with Clerk as the source of invitation metadata.
 *
 * `sync.ensureFromClient` remains the lightweight mutation used by iOS and by
 * installs without a Clerk secret. The web app calls this action so a newly
 * invited user can claim their Convex membership from Clerk's server-side user
 * public metadata immediately after accepting an application invitation.
 */
export const ensureFromClerk = action({
  args: {},
  handler: async (ctx): Promise<Id<"users">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    let email = identity.email;
    let firstName = identity.givenName;
    let lastName = identity.familyName;
    let imageUrl = identity.pictureUrl as string | undefined;
    let pending: PendingMembership | undefined;

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (secretKey) {
      const user = await createClerkClient({ secretKey }).users.getUser(
        identity.subject,
      );
      email =
        user.primaryEmailAddress?.emailAddress ??
        user.emailAddresses[0]?.emailAddress ??
        email;
      firstName = user.firstName ?? firstName;
      lastName = user.lastName ?? lastName;
      imageUrl = user.imageUrl ?? imageUrl;
      pending = pendingMembershipFromMetadata(
        user.publicMetadata as ClerkPublicMetadata,
      );
    }

    return await ctx.runMutation(internal.clerk.upsertUser, {
      clerkUserId: identity.subject,
      email,
      firstName,
      lastName,
      imageUrl,
      pendingOrgId: pending?.pendingOrgId,
      pendingRole: pending?.pendingRole,
      pendingRoleKey: pending?.pendingRoleKey,
    });
  },
});

function pendingMembershipFromMetadata(
  metadata: ClerkPublicMetadata | null | undefined,
): PendingMembership | undefined {
  const pendingOrgId = metadata?.pendingOrgId;
  const pendingRole = metadata?.pendingRole;
  const pendingRoleKey = metadata?.pendingRoleKey;
  if (
    typeof pendingOrgId !== "string" ||
    typeof pendingRole !== "string" ||
    !(ROLES as readonly string[]).includes(pendingRole)
  ) {
    return undefined;
  }
  return {
    pendingOrgId,
    pendingRole: pendingRole as Role,
    pendingRoleKey:
      typeof pendingRoleKey === "string" ? pendingRoleKey : undefined,
  };
}
