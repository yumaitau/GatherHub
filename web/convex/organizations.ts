import { internalMutation, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireOrgMember, requireUser } from "./lib/auth";
import { generateSlug, generateTagId } from "./lib/ids";
import { seedAllDefaultsForOrg } from "./taxonomies";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";
import {
  effectiveOrgProfile,
  ensureOrganizationProfile,
  listVerticalTemplates,
  normalizedProfileInput,
  ORGANIZATION_MODULE_KEYS,
  replaceOrganizationModules,
  seedOrganizationProfile,
  type OrganizationModuleKey,
  type SportKey,
} from "./lib/orgConfig";
import { ensureOrganizationRoles, requireCapability } from "./lib/capabilities";
import { seedSportDefaultsForOrg } from "./fixtures";
import {
  organizationKindValidator,
  organizationModuleKeyValidator,
  organizationTerminologyValidator,
  sportKeyValidator,
} from "./schema";

/**
 * Convex-native organisation (club) lifecycle: create, join by invite code,
 * switch the active org, leave, and rotate the invite code. Clerk is not
 * involved — orgs and memberships live entirely here.
 */

function newInviteCode(): string {
  // Reuse the opaque-id generator; strip the "tag_" prefix for a short code.
  return generateTagId().slice(4, 14).toUpperCase();
}

/** Create a new organisation. The caller becomes its owner and active member. */
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    kind: v.optional(organizationKindValidator),
    templateKey: v.optional(v.string()),
    sportKey: v.optional(sportKeyValidator),
  },
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
    await seedOrganizationProfile(ctx, orgId, {
      kind: args.kind,
      templateKey: args.templateKey,
      sportKey: args.sportKey,
    });
    const org = await ctx.db.get(orgId);
    if (org) await ensureOrganizationRoles(ctx, org);
    await ctx.db.insert("memberships", {
      orgId,
      userId: user._id,
      role: "owner",
      roleKey: "owner",
    });
    await ctx.db.patch(user._id, { activeOrgId: orgId });
    await seedAllDefaultsForOrg(ctx, orgId);
    const profile = await effectiveOrgProfile(ctx, org!);
    if (
      profile.modules.some((module) => module.key === "sport" && module.enabled)
    ) {
      await seedSportDefaultsForOrg(ctx, orgId, profile.sportKey);
    }
    return { orgId, slug };
  },
});

export const verticalTemplates = query({
  args: {},
  handler: async () => listVerticalTemplates(),
});

export const profile = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    return await effectiveOrgProfile(ctx, auth.org);
  },
});

// Rate-limit policy for joinByCode: max 5 attempts per user per minute.
// The 10-char Crockford code is ~50 bits offline-strong, but Convex
// performs no per-IP throttling on its own, so we cap server-side.
const JOIN_RL_WINDOW_MS = 60_000;
const JOIN_RL_MAX_ATTEMPTS = 5;

/**
 * Join an existing club using its current invite code. The caller is added as
 * a `player` (committee can promote later) and the club becomes their active org.
 *
 * Rate-limited per user to prevent brute-forcing the invite code.
 */
export const joinByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const code = args.code.trim().toUpperCase();
    if (!code) throw new ConvexError("Enter an invite code.");

    const now = Date.now();
    const windowStart = now - JOIN_RL_WINDOW_MS;
    const recent = await ctx.db
      .query("joinAttempts")
      .withIndex("by_user_and_time", (q) =>
        q.eq("userId", user._id).gt("attemptedAt", windowStart),
      )
      .collect();
    if (recent.length >= JOIN_RL_MAX_ATTEMPTS) {
      throw new ConvexError(
        "Too many attempts. Wait a minute before trying again.",
      );
    }

    const org = await ctx.db
      .query("organizations")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", code))
      .unique();
    if (!org) {
      await ctx.db.insert("joinAttempts", {
        userId: user._id,
        attemptedAt: now,
        success: false,
      });
      throw new ConvexError("Invalid invite code.");
    }

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
    await ctx.db.insert("joinAttempts", {
      userId: user._id,
      attemptedAt: now,
      success: true,
    });
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
 * Read the active org's invite code. Committee-and-above only — the code is
 * what lets anyone join, so it should not leak to ordinary members.
 */
export const getInviteCode = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "invitations.manage");
    return { code: auth.org.inviteCode ?? null };
  },
});

/** Read location defaults for the active org. Available to all org members. */
export const locationDefaults = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    return { defaultAddress: auth.org.defaultAddress ?? null };
  },
});

export const updateProfile = mutation({
  args: {
    kind: v.optional(organizationKindValidator),
    templateKey: v.optional(v.string()),
    sportKey: v.optional(sportKeyValidator),
    terminology: v.optional(organizationTerminologyValidator),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "settings.admin");
    const templateChanged =
      args.templateKey !== undefined &&
      args.templateKey !== auth.org.templateKey;
    const profile = normalizedProfileInput({
      kind: args.kind ?? auth.org.kind,
      templateKey: args.templateKey ?? auth.org.templateKey,
      sportKey:
        args.sportKey ??
        (templateChanged
          ? undefined
          : (auth.org.sportKey as SportKey | undefined)),
      terminology:
        args.terminology ??
        (templateChanged ? undefined : auth.org.terminology),
    });
    const template = listVerticalTemplates().find(
      (row) => row.key === profile.templateKey,
    );
    const enabled = new Set<OrganizationModuleKey>(
      (template?.modules ?? []).filter((key): key is OrganizationModuleKey =>
        (ORGANIZATION_MODULE_KEYS as readonly string[]).includes(key),
      ),
    );
    await ctx.db.patch(auth.org._id, {
      kind: profile.kind,
      templateKey: profile.templateKey,
      sportKey: profile.sportKey,
      terminology: profile.terminology,
      soccerMode: enabled.has("soccer"),
      profileUpdatedAt: Date.now(),
    });
    if (template) {
      await replaceOrganizationModules(ctx, auth.org._id, enabled);
    }
    if (enabled.has("sport")) {
      await seedSportDefaultsForOrg(ctx, auth.org._id, profile.sportKey);
    }
  },
});

export const setModule = mutation({
  args: {
    key: organizationModuleKeyValidator,
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "settings.admin");
    if ((args.key === "core" || args.key === "people") && !args.enabled) {
      throw new ConvexError("Core and people modules cannot be disabled.");
    }
    await ensureOrganizationProfile(ctx, auth.org);
    const existing = await ctx.db
      .query("organizationModules")
      .withIndex("by_org_key", (q) =>
        q.eq("orgId", auth.org._id).eq("key", args.key),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("organizationModules", {
        orgId: auth.org._id,
        key: args.key,
        enabled: args.enabled,
        version: "1",
        updatedAt: now,
      });
    }
    if (args.key === "sport" && !args.enabled) {
      await ctx.db.patch(auth.org._id, {
        soccerMode: false,
        sportKey: undefined,
      });
      const soccer = await ctx.db
        .query("organizationModules")
        .withIndex("by_org_key", (q) =>
          q.eq("orgId", auth.org._id).eq("key", "soccer"),
        )
        .unique();
      if (soccer) {
        await ctx.db.patch(soccer._id, { enabled: false, updatedAt: now });
      }
    }
    if (args.key === "sport" && args.enabled && !auth.org.sportKey) {
      await ctx.db.patch(auth.org._id, { sportKey: "multi_sport" });
      await seedSportDefaultsForOrg(ctx, auth.org._id, "multi_sport");
    }
    if (args.key === "soccer") {
      await ctx.db.patch(auth.org._id, { soccerMode: args.enabled });
      if (args.enabled) {
        await ctx.db.patch(auth.org._id, { sportKey: "soccer" });
        await seedSportDefaultsForOrg(ctx, auth.org._id, "soccer");
        const sport = await ctx.db
          .query("organizationModules")
          .withIndex("by_org_key", (q) =>
            q.eq("orgId", auth.org._id).eq("key", "sport"),
          )
          .unique();
        if (sport) {
          await ctx.db.patch(sport._id, { enabled: true, updatedAt: now });
        } else {
          await ctx.db.insert("organizationModules", {
            orgId: auth.org._id,
            key: "sport",
            enabled: true,
            version: "1",
            updatedAt: now,
          });
        }
      }
    }
  },
});

export const migrateMissingProfiles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    let migrated = 0;
    for (const org of orgs) {
      const modules = await ctx.db
        .query("organizationModules")
        .withIndex("by_org", (q) => q.eq("orgId", org._id))
        .first();
      if (!org.kind || !org.templateKey || !org.terminology || !modules) {
        await ensureOrganizationProfile(ctx, org);
        migrated += 1;
      }
      const updated = await ctx.db.get(org._id);
      if (updated) {
        await ensureOrganizationRoles(ctx, updated);
        const profile = await effectiveOrgProfile(ctx, updated);
        if (
          profile.modules.some(
            (module) => module.key === "sport" && module.enabled,
          )
        ) {
          await seedSportDefaultsForOrg(ctx, updated._id, profile.sportKey);
        }
      }
    }
    return { migrated };
  },
});

/** Rotate (or set, if missing) the active org's invite code. Committee+ only. */
export const rotateInviteCode = mutation({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "invitations.manage");
    const code = newInviteCode();
    await ctx.db.patch(auth.org._id, { inviteCode: code });
    return { code };
  },
});

/** Edit location defaults. Committee+ only. */
export const updateLocationSettings = mutation({
  args: {
    defaultAddress: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "settings.admin");
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const defaultAddress = args.defaultAddress?.trim();
    await ctx.db.patch(auth.org._id, {
      defaultAddress: defaultAddress || undefined,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "organizations:updateLocationSettings",
    );
  },
});

/** Edit basic club details (name, slug, image). Committee+ only. */
export const update = mutation({
  args: {
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "settings.admin");
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
