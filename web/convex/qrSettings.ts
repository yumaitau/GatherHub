import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember } from "./lib/auth";
import { attachOrgImage, deleteOrgImage, orgImageUrl } from "./lib/uploads";
import { requireCapability } from "./lib/capabilities";

/**
 * Read the active org's QR render settings. Returns `null` when the
 * org has never customised theirs — callers fall back to the default
 * preset declared in `web/src/lib/qr/types.ts`.
 *
 * Visible to any org member so the asset list / sheet view can render
 * the same look without extra round-trips.
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const row = await ctx.db
      .query("qrSettings")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .unique();
    if (!row) return null;
    const logoUrl = row.logoStorageId
      ? await orgImageUrl(ctx, auth, row.logoStorageId)
      : null;
    return {
      fgColor: row.fgColor,
      bgColor: row.bgColor,
      dotStyle: row.dotStyle,
      cornerSquareStyle: row.cornerSquareStyle,
      margin: row.margin,
      logoSize: row.logoSize,
      logoUrl,
      borderEnabled: row.borderEnabled,
      borderColor: row.borderColor,
      borderWidth: row.borderWidth,
      borderRadius: row.borderRadius,
    };
  },
});

/**
 * Save (or create) the org's QR render settings. Committee+ only.
 * Settings are the same shape `web/src/lib/qr/types.ts:QRSettings`
 * minus the runtime-only `size` field and plus an optional uploaded
 * logo storage id.
 */
export const upsert = mutation({
  args: {
    fgColor: v.string(),
    bgColor: v.string(),
    dotStyle: v.string(),
    cornerSquareStyle: v.string(),
    margin: v.number(),
    logoSize: v.string(),
    logoStorageId: v.optional(v.union(v.string(), v.null())),
    logoFileName: v.optional(v.string()),
    borderEnabled: v.boolean(),
    borderColor: v.string(),
    borderWidth: v.number(),
    borderRadius: v.number(),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "settings.admin");
    const existing = await ctx.db
      .query("qrSettings")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .unique();
    if (args.logoStorageId) {
      await attachOrgImage(ctx, auth, {
        storageId: args.logoStorageId,
        ownerType: "qrSettings",
        ownerId: auth.org._id,
        purpose: "qrLogo",
        fileName: args.logoFileName,
      });
    }
    const patch = {
      fgColor: args.fgColor,
      bgColor: args.bgColor,
      dotStyle: args.dotStyle,
      cornerSquareStyle: args.cornerSquareStyle,
      margin: args.margin,
      logoSize: args.logoSize,
      borderEnabled: args.borderEnabled,
      borderColor: args.borderColor,
      borderWidth: args.borderWidth,
      borderRadius: args.borderRadius,
      updatedAt: Date.now(),
      updatedBy: auth.user._id,
    };
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...patch,
        ...(args.logoStorageId !== undefined
          ? { logoStorageId: args.logoStorageId ?? undefined }
          : {}),
      });
      if (
        args.logoStorageId !== undefined &&
        args.logoStorageId !== existing.logoStorageId
      ) {
        await deleteOrgImage(ctx, auth, existing.logoStorageId);
      }
      return existing._id;
    }
    return await ctx.db.insert("qrSettings", {
      orgId: auth.org._id,
      ...patch,
      logoStorageId: args.logoStorageId ?? undefined,
    });
  },
});
