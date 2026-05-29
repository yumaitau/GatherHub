import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireAnyRole,
  assertSameOrg,
  ASSET_MANAGER_ROLES,
  AuthContext,
} from "./lib/auth";
import { writeAudit } from "./lib/audit";
import { Doc } from "./_generated/dataModel";

async function loadAsset(
  ctx: Parameters<typeof writeAudit>[0],
  auth: AuthContext,
  assetId: Doc<"assets">["_id"],
): Promise<Doc<"assets">> {
  const asset = await ctx.db.get(assetId);
  assertSameOrg(auth, asset);
  if (!asset) throw new Error("Not found.");
  if (asset.status === "retired") {
    throw new Error("This asset is retired and cannot be operated on.");
  }
  return asset;
}

/** Check an asset out to a custodian. */
export const checkOut = mutation({
  args: {
    assetId: v.id("assets"),
    custodianMemberId: v.id("members"),
    location: v.optional(v.string()),
    dueBack: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    const asset = await loadAsset(ctx, auth, args.assetId);
    if (asset.status === "checked_out" || asset.status === "in_use") {
      throw new Error("Asset is already checked out.");
    }
    const custodian = await ctx.db.get(args.custodianMemberId);
    assertSameOrg(auth, custodian);

    await ctx.db.patch(args.assetId, {
      status: "checked_out",
      custodianMemberId: args.custodianMemberId,
      location: args.location ?? asset.location,
      dueBack: args.dueBack,
    });
    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId: args.assetId,
      action: "checked_out",
      performedBy: auth.user._id,
      fromStatus: asset.status,
      toStatus: "checked_out",
      fromCustodianMemberId: asset.custodianMemberId,
      toCustodianMemberId: args.custodianMemberId,
      fromLocation: asset.location,
      toLocation: args.location ?? asset.location,
      notes: args.notes,
    });
  },
});

/** Check an asset back in (returns to available, clears custodian). */
export const checkIn = mutation({
  args: {
    assetId: v.id("assets"),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    const asset = await loadAsset(ctx, auth, args.assetId);

    await ctx.db.patch(args.assetId, {
      status: "available",
      custodianMemberId: undefined,
      location: args.location ?? asset.location,
      dueBack: undefined,
    });
    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId: args.assetId,
      action: "checked_in",
      performedBy: auth.user._id,
      fromStatus: asset.status,
      toStatus: "available",
      fromCustodianMemberId: asset.custodianMemberId,
      fromLocation: asset.location,
      toLocation: args.location ?? asset.location,
      notes: args.notes,
    });
  },
});

/** Transfer an asset directly from one custodian to another. */
export const transfer = mutation({
  args: {
    assetId: v.id("assets"),
    toCustodianMemberId: v.id("members"),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    const asset = await loadAsset(ctx, auth, args.assetId);
    const newCustodian = await ctx.db.get(args.toCustodianMemberId);
    assertSameOrg(auth, newCustodian);

    await ctx.db.patch(args.assetId, {
      status: "checked_out",
      custodianMemberId: args.toCustodianMemberId,
      location: args.location ?? asset.location,
    });
    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId: args.assetId,
      action: "transferred",
      performedBy: auth.user._id,
      fromStatus: asset.status,
      toStatus: "checked_out",
      fromCustodianMemberId: asset.custodianMemberId,
      toCustodianMemberId: args.toCustodianMemberId,
      fromLocation: asset.location,
      toLocation: args.location ?? asset.location,
      notes: args.notes,
    });
  },
});

export const reportLost = mutation({
  args: { assetId: v.id("assets"), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    const asset = await loadAsset(ctx, auth, args.assetId);
    await ctx.db.patch(args.assetId, { status: "lost" });
    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId: args.assetId,
      action: "reported_lost",
      performedBy: auth.user._id,
      fromStatus: asset.status,
      toStatus: "lost",
      notes: args.notes,
    });
  },
});

export const setMaintenance = mutation({
  args: { assetId: v.id("assets"), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    const asset = await loadAsset(ctx, auth, args.assetId);
    await ctx.db.patch(args.assetId, {
      status: "maintenance",
      custodianMemberId: undefined,
    });
    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId: args.assetId,
      action: "maintenance",
      performedBy: auth.user._id,
      fromStatus: asset.status,
      toStatus: "maintenance",
      notes: args.notes,
    });
  },
});

export const retire = mutation({
  args: { assetId: v.id("assets"), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    const asset = await ctx.db.get(args.assetId);
    assertSameOrg(auth, asset);
    if (!asset) throw new Error("Not found.");
    await ctx.db.patch(args.assetId, {
      status: "retired",
      custodianMemberId: undefined,
    });
    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId: args.assetId,
      action: "retired",
      performedBy: auth.user._id,
      fromStatus: asset.status,
      toStatus: "retired",
      notes: args.notes,
    });
  },
});

/** Assets that are checked out past their dueBack date. */
export const overdue = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    const now = Date.now();
    const checkedOut = await ctx.db
      .query("assets")
      .withIndex("by_org_and_status", (q) =>
        q.eq("orgId", auth.org._id).eq("status", "checked_out"),
      )
      .collect();
    const overdueAssets = checkedOut.filter(
      (a) => a.dueBack !== undefined && a.dueBack < now,
    );
    return await Promise.all(
      overdueAssets.map(async (a) => ({
        ...a,
        custodian: a.custodianMemberId
          ? await ctx.db.get(a.custodianMemberId)
          : null,
      })),
    );
  },
});
