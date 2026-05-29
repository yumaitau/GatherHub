import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, requireRole, assertSameOrg } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const sponsors = await ctx.db
      .query("sponsors")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    return await Promise.all(
      sponsors
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (s) => ({
          ...s,
          logoUrl: s.logoStorageId
            ? await ctx.storage.getUrl(s.logoStorageId)
            : null,
        })),
    );
  },
});

export const get = query({
  args: { sponsorId: v.id("sponsors") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const sponsor = await ctx.db.get(args.sponsorId);
    assertSameOrg(auth, sponsor);
    if (!sponsor) throw new Error("Not found.");

    const sponsoredAssets = await ctx.db
      .query("assets")
      .withIndex("by_sponsor", (q) => q.eq("sponsorId", sponsor._id))
      .collect();

    return {
      sponsor,
      logoUrl: sponsor.logoStorageId
        ? await ctx.storage.getUrl(sponsor.logoStorageId)
        : null,
      sponsoredAssets,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    website: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    sponsorshipValue: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    visibleOnPublicSite: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    return await ctx.db.insert("sponsors", {
      orgId: auth.org._id,
      name: args.name.trim(),
      contactName: args.contactName,
      contactEmail: args.contactEmail,
      contactPhone: args.contactPhone,
      website: args.website,
      logoStorageId: args.logoStorageId,
      sponsorshipValue: args.sponsorshipValue,
      startDate: args.startDate,
      endDate: args.endDate,
      visibleOnPublicSite: args.visibleOnPublicSite ?? false,
      notes: args.notes,
    });
  },
});

export const update = mutation({
  args: {
    sponsorId: v.id("sponsors"),
    name: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    website: v.optional(v.string()),
    logoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    sponsorshipValue: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    visibleOnPublicSite: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const sponsor = await ctx.db.get(args.sponsorId);
    assertSameOrg(auth, sponsor);
    const { sponsorId, logoStorageId, ...rest } = args;
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    );
    if (logoStorageId !== undefined) {
      patch.logoStorageId = logoStorageId ?? undefined;
    }
    await ctx.db.patch(sponsorId, patch);
  },
});

export const remove = mutation({
  args: { sponsorId: v.id("sponsors") },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "admin");
    const sponsor = await ctx.db.get(args.sponsorId);
    assertSameOrg(auth, sponsor);
    // Unlink sponsored assets.
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_sponsor", (q) => q.eq("sponsorId", args.sponsorId))
      .collect();
    for (const a of assets) await ctx.db.patch(a._id, { sponsorId: undefined });
    await ctx.db.delete(args.sponsorId);
  },
});

/** Total sponsorship value for the org (dashboard widget). */
export const totalValue = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const sponsors = await ctx.db
      .query("sponsors")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    return sponsors.reduce((sum, s) => sum + (s.sponsorshipValue ?? 0), 0);
  },
});
