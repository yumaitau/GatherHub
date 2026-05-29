import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { Role } from "./lib/auth";
import { getAuthContext } from "./lib/auth";

/**
 * Map a Clerk organisation role (e.g. "org:admin", "admin", "org:member") to a
 * GatherHub role. Only used to seed the role on first membership creation —
 * subsequent in-app role changes are preserved (see `ensureFromClient`).
 */
function mapClerkRole(clerkRole: string | undefined): Role {
  const r = (clerkRole ?? "").toLowerCase();
  if (r.includes("admin")) return "admin";
  if (r.includes("owner")) return "owner";
  return "player";
}

type Claims = {
  email?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  org_id?: string;
  org_slug?: string;
  org_name?: string;
  org_role?: string;
};

/**
 * Idempotently upsert the current Clerk user, their active organisation, and
 * their membership into Convex, based purely on the verified JWT identity.
 *
 * Called by the web client on load. This keeps the app runnable without
 * configuring Clerk webhooks; in production the webhook (convex/http.ts) keeps
 * data in sync on the server side too. Both paths are convergent.
 */
export const ensureFromClient = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    const claims = identity as unknown as Claims;
    const clerkUserId = identity.subject;

    // --- user ---
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();

    const userFields = {
      clerkUserId,
      email: identity.email ?? claims.email,
      firstName: identity.givenName ?? claims.given_name,
      lastName: identity.familyName ?? claims.family_name,
      imageUrl: (identity.pictureUrl as string | undefined) ?? claims.picture,
    };

    let userId: Id<"users">;
    if (existingUser) {
      await ctx.db.patch(existingUser._id, userFields);
      userId = existingUser._id;
    } else {
      userId = await ctx.db.insert("users", userFields);
    }

    // --- organisation (only if an org is active) ---
    const clerkOrgId = (identity.orgId as string | undefined) ?? claims.org_id;
    if (!clerkOrgId) {
      return { userId, orgId: null as Id<"organizations"> | null };
    }

    const existingOrg = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_id", (q) => q.eq("clerkOrgId", clerkOrgId))
      .unique();

    const orgFields = {
      clerkOrgId,
      name: claims.org_name ?? "My Club",
      slug: claims.org_slug,
    };

    let orgId: Id<"organizations">;
    if (existingOrg) {
      await ctx.db.patch(existingOrg._id, {
        name: orgFields.name,
        slug: orgFields.slug,
      });
      orgId = existingOrg._id;
    } else {
      orgId = await ctx.db.insert("organizations", orgFields);
    }

    // --- membership ---
    const existingMembership = await ctx.db
      .query("memberships")
      .withIndex("by_org_and_clerk_user", (q) =>
        q.eq("orgId", orgId).eq("clerkUserId", clerkUserId),
      )
      .unique();

    if (existingMembership) {
      // Preserve in-app role changes; only keep the user link fresh.
      await ctx.db.patch(existingMembership._id, { userId });
    } else {
      await ctx.db.insert("memberships", {
        orgId,
        userId,
        clerkUserId,
        role: mapClerkRole(claims.org_role),
      });
    }

    return { userId, orgId };
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
      },
      role: auth.role,
    };
  },
});

/**
 * All organisations the signed-in user belongs to, with role. Used by the
 * profile page so the user can see every membership at a glance, independent
 * of which org is currently active in Clerk.
 */
export const myMemberships = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
      .collect();
    return await Promise.all(
      memberships.map(async (m) => {
        const org = await ctx.db.get(m.orgId);
        return {
          membershipId: m._id,
          role: m.role,
          org: org
            ? {
                id: org._id,
                name: org.name,
                slug: org.slug,
                clerkOrgId: org.clerkOrgId,
              }
            : null,
        };
      }),
    );
  },
});
