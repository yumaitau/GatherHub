import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, requireRole } from "./lib/auth";

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
      ? await ctx.storage.getUrl(row.logoStorageId)
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
 * Save (or create) the org's QR render settings. Admin+ only.
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
    logoStorageId: v.optional(v.id("_storage")),
    borderEnabled: v.boolean(),
    borderColor: v.string(),
    borderWidth: v.number(),
    borderRadius: v.number(),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "admin");
    const existing = await ctx.db
      .query("qrSettings")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .unique();
    const patch = {
      ...args,
      updatedAt: Date.now(),
      updatedBy: auth.user._id,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("qrSettings", {
      orgId: auth.org._id,
      ...patch,
    });
  },
});
