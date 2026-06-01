import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getAuthContext } from "./lib/auth";
import { effectiveOrgProfile } from "./lib/orgConfig";
import { effectiveRoleForMembership } from "./lib/capabilities";

type IdentityClaims = {
  email?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  // Optional fallback for installs that propagate Clerk publicMetadata through
  // the Convex JWT template. The web app's primary invitation sync path reads
  // the same metadata server-side in `syncClerk.ensureFromClerk`.
  publicMetadata?: {
    pendingOrgId?: string;
    pendingRole?: string;
    pendingRoleKey?: string;
    invitedBy?: string;
  };
};

/**
 * Idempotently upsert the current Clerk user into Convex from the verified JWT.
 *
 * Called by the web client on load so the Convex mirror exists even without
 * webhooks configured. Organisations and memberships are NOT touched here —
 * they are created in-app via `convex/organizations.ts`.
 */
export const ensureFromClient = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    const claims = identity as unknown as IdentityClaims;
    const clerkUserId = identity.subject;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();

    const fields = {
      clerkUserId,
      email: identity.email ?? claims.email,
      firstName: identity.givenName ?? claims.given_name,
      lastName: identity.familyName ?? claims.family_name,
      imageUrl: (identity.pictureUrl as string | undefined) ?? claims.picture,
    };

    let userId: Id<"users">;
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      userId = existing._id;
    } else {
      userId = await ctx.db.insert("users", fields);
    }

    // Clerk-native invitation fallback: if the JWT template forwards
    // public_metadata into the identity object, claim the membership here.
    // Web clients normally use `syncClerk.ensureFromClerk`, which reads the
    // same Clerk user metadata server-side and does not require custom JWT
    // claims. Subsequent syncs are a no-op because the row already exists.
    //
    // Without publicMetadata (i.e. a user who signed up outside the
    // invitation flow) we leave them in the "no organisation" empty
    // state — that's how closed beta stays closed.
    const meta = claims.publicMetadata;
    const pendingOrgIdStr = meta?.pendingOrgId;
    const pendingRole = meta?.pendingRole;
    const pendingRoleKey = meta?.pendingRoleKey;
    // Mirrors `roleValidator` in schema.ts.
    const ALLOWED_ROLES = [
      "owner",
      "admin",
      "committee",
      "coach",
      "volunteer",
      "parent",
      "player",
    ] as const;
    type AllowedRole = (typeof ALLOWED_ROLES)[number];
    if (
      pendingOrgIdStr &&
      pendingRole &&
      (ALLOWED_ROLES as readonly string[]).includes(pendingRole)
    ) {
      const pendingOrgId = pendingOrgIdStr as Id<"organizations">;
      const org = await ctx.db.get(pendingOrgId);
      if (org) {
        const existingMembership = await ctx.db
          .query("memberships")
          .withIndex("by_user_and_org", (q) =>
            q.eq("userId", userId).eq("orgId", pendingOrgId),
          )
          .unique();
        if (!existingMembership) {
          await ctx.db.insert("memberships", {
            userId,
            orgId: pendingOrgId,
            role: pendingRole as AllowedRole,
            roleKey: pendingRoleKey,
          });
        }
        const userRow = await ctx.db.get(userId);
        if (userRow && !userRow.activeOrgId) {
          await ctx.db.patch(userId, { activeOrgId: pendingOrgId });
        }
      }
    }

    return { userId };
  },
});

/**
 * Return the current authenticated context for the web app: the user, their
 * active org, and their role. Returns null when signed out / no active org /
 * not yet synced.
 */
export const currentContext = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth) return null;
    const profile = await effectiveOrgProfile(ctx, auth.org);
    const effectiveRole = await effectiveRoleForMembership(
      ctx,
      auth.org._id,
      auth.membership,
    );
    return {
      user: {
        id: auth.user._id,
        firstName: auth.user.firstName,
        lastName: auth.user.lastName,
        email: auth.user.email,
        imageUrl: auth.user.imageUrl,
      },
      org: {
        id: auth.org._id,
        name: auth.org.name,
        slug: auth.org.slug,
        soccerMode: Boolean(auth.org.soccerMode),
        kind: profile.kind,
        templateKey: profile.templateKey,
        terminology: profile.terminology,
        modules: profile.modules,
        defaultAddress: auth.org.defaultAddress,
      },
      role: auth.role,
      roleKey: effectiveRole.roleKey,
      roleDisplayName: effectiveRole.displayName,
      capabilities: effectiveRole.capabilities,
    };
  },
});

/**
 * All organisations the signed-in user belongs to, with role. Used by the
 * profile page and the in-app org switcher to list memberships independent of
 * which org is currently active.
 */
export const myMemberships = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user) return [];
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return await Promise.all(
      memberships.map(async (m) => {
        const org = await ctx.db.get(m.orgId);
        return {
          membershipId: m._id,
          role: m.role,
          roleKey: m.roleKey,
          isActive: user.activeOrgId === m.orgId,
          org: org
            ? {
                id: org._id,
                name: org.name,
                slug: org.slug,
              }
            : null,
        };
      }),
    );
  },
});
