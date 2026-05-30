import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getAuthContext } from "./lib/auth";

type IdentityClaims = {
  email?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
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
      },
      role: auth.role,
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
