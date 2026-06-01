import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, assertSameOrg } from "./lib/auth";
import { attachOrgImage, deleteOrgImage, orgImageUrl } from "./lib/uploads";
import { requireModule } from "./lib/orgConfig";
import { requireCapability } from "./lib/capabilities";

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
            ? await orgImageUrl(ctx, auth, s.logoStorageId)
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
        ? await orgImageUrl(ctx, auth, sponsor.logoStorageId)
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
    logoStorageId: v.optional(v.string()),
    logoFileName: v.optional(v.string()),
    sponsorshipValue: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    visibleOnPublicSite: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "sponsors.manage");
    await requireModule(ctx, auth, "sponsors");
    const sponsorId = await ctx.db.insert("sponsors", {
      orgId: auth.org._id,
      name: args.name.trim(),
      contactName: args.contactName,
      contactEmail: args.contactEmail,
      contactPhone: args.contactPhone,
      website: args.website,
      sponsorshipValue: args.sponsorshipValue,
      startDate: args.startDate,
      endDate: args.endDate,
      visibleOnPublicSite: args.visibleOnPublicSite ?? false,
      notes: args.notes,
    });
    if (args.logoStorageId) {
      await attachOrgImage(ctx, auth, {
        storageId: args.logoStorageId,
        ownerType: "sponsors",
        ownerId: sponsorId,
        purpose: "logo",
        fileName: args.logoFileName,
      });
      await ctx.db.patch(sponsorId, { logoStorageId: args.logoStorageId });
    }
    return sponsorId;
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
    logoStorageId: v.optional(v.union(v.string(), v.null())),
    logoFileName: v.optional(v.string()),
    sponsorshipValue: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    visibleOnPublicSite: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "sponsors.manage");
    await requireModule(ctx, auth, "sponsors");
    const sponsor = await ctx.db.get(args.sponsorId);
    assertSameOrg(auth, sponsor);
    const { sponsorId, logoStorageId, logoFileName, ...rest } = args;
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    );
    if (logoStorageId !== undefined) {
      if (logoStorageId) {
        await attachOrgImage(ctx, auth, {
          storageId: logoStorageId,
          ownerType: "sponsors",
          ownerId: sponsorId,
          purpose: "logo",
          fileName: logoFileName,
        });
      }
      patch.logoStorageId = logoStorageId ?? undefined;
    }
    await ctx.db.patch(sponsorId, patch);
    if (
      logoStorageId !== undefined &&
      logoStorageId !== sponsor!.logoStorageId
    ) {
      await deleteOrgImage(ctx, auth, sponsor!.logoStorageId);
    }
  },
});

export const remove = mutation({
  args: { sponsorId: v.id("sponsors") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "sponsors.manage");
    await requireModule(ctx, auth, "sponsors");
    const sponsor = await ctx.db.get(args.sponsorId);
    assertSameOrg(auth, sponsor);
    // Unlink sponsored assets.
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_sponsor", (q) => q.eq("sponsorId", args.sponsorId))
      .collect();
    for (const a of assets) await ctx.db.patch(a._id, { sponsorId: undefined });
    await deleteOrgImage(ctx, auth, sponsor!.logoStorageId);
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
