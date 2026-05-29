import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireOrgMember,
  requireAnyRole,
  assertSameOrg,
  ASSET_MANAGER_ROLES,
} from "./lib/auth";
import { writeAudit } from "./lib/audit";

/**
 * PUBLIC, unauthenticated tag lookup for QR landing pages.
 *
 * Returns ONLY safe, non-sensitive information — never custodian, value,
 * serial, notes, or history. Used by the `/a/:tagId` public route so a member
 * of the public who scans a found item can identify the owning club without
 * exposing private data. See /docs/security-model.md.
 */
export const lookupPublic = query({
  args: { tagId: v.string() },
  handler: async (ctx, args) => {
    const tag = await ctx.db
      .query("assetTags")
      .withIndex("by_tag", (q) => q.eq("tagId", args.tagId))
      .unique();
    if (!tag || !tag.active) {
      return { found: false as const };
    }
    const asset = await ctx.db.get(tag.assetId);
    if (!asset) return { found: false as const };
    const org = await ctx.db.get(asset.orgId);

    return {
      found: true as const,
      tagId: tag.tagId,
      assetName: asset.name,
      category: asset.category,
      status: asset.status,
      orgName: org?.name ?? "a GatherHub club",
      message:
        "If you have found this item, please return it to the club using the details on the item or contact the club directly.",
    };
  },
});

/**
 * AUTHENTICATED tag lookup — returns the full asset (within the caller's org).
 * Cross-org tags resolve to "not found" so tag ids can't probe other tenants.
 */
export const lookupAuthed = query({
  args: { tagId: v.string() },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const tag = await ctx.db
      .query("assetTags")
      .withIndex("by_tag", (q) => q.eq("tagId", args.tagId))
      .unique();
    if (!tag || tag.orgId !== auth.org._id) {
      return { found: false as const };
    }
    const asset = await ctx.db.get(tag.assetId);
    if (!asset || asset.orgId !== auth.org._id) {
      return { found: false as const };
    }
    const custodian = asset.custodianMemberId
      ? await ctx.db.get(asset.custodianMemberId)
      : null;
    return { found: true as const, asset, custodian, tag };
  },
});

/**
 * Reassign a tag id to a different asset (e.g. re-using a physical QR sticker).
 * Deactivates any previous binding implicitly by repointing the row.
 */
export const reassign = mutation({
  args: { tagId: v.string(), assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    const asset = await ctx.db.get(args.assetId);
    assertSameOrg(auth, asset);

    const tag = await ctx.db
      .query("assetTags")
      .withIndex("by_tag", (q) => q.eq("tagId", args.tagId))
      .unique();
    if (!tag || tag.orgId !== auth.org._id) {
      throw new Error("Tag not found in your organisation.");
    }
    const previousAssetId = tag.assetId;
    await ctx.db.patch(tag._id, { assetId: args.assetId, active: true });

    // Keep denormalised fields consistent.
    if (tag.type === "qr") {
      await ctx.db.patch(args.assetId, { qrTagId: tag.tagId });
    } else {
      await ctx.db.patch(args.assetId, { nfcTagId: tag.tagId });
    }

    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId: args.assetId,
      action: "tag_reassigned",
      performedBy: auth.user._id,
      notes: `Tag ${args.tagId} reassigned from asset ${previousAssetId}.`,
    });
  },
});

export const deactivate = mutation({
  args: { tagId: v.string() },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    const tag = await ctx.db
      .query("assetTags")
      .withIndex("by_tag", (q) => q.eq("tagId", args.tagId))
      .unique();
    if (!tag || tag.orgId !== auth.org._id) {
      throw new Error("Tag not found in your organisation.");
    }
    await ctx.db.patch(tag._id, { active: false });
  },
});
