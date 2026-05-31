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
import { getClientMutation, recordClientMutation } from "./lib/idempotency";

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

function resolvedLocation(
  explicit: string | undefined,
  current: string | undefined,
  defaultAddress: string | undefined,
): string | undefined {
  return (
    explicit?.trim() || current?.trim() || defaultAddress?.trim() || undefined
  );
}

/** Check an asset out to a custodian. */
export const checkOut = mutation({
  args: {
    assetId: v.id("assets"),
    custodianMemberId: v.id("members"),
    location: v.optional(v.string()),
    dueBack: v.optional(v.number()),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const asset = await loadAsset(ctx, auth, args.assetId);
    if (asset.status === "checked_out" || asset.status === "in_use") {
      throw new Error("Asset is already checked out.");
    }
    const custodian = await ctx.db.get(args.custodianMemberId);
    assertSameOrg(auth, custodian);
    const location = resolvedLocation(
      args.location,
      asset.location,
      auth.org.defaultAddress,
    );

    await ctx.db.patch(args.assetId, {
      status: "checked_out",
      custodianMemberId: args.custodianMemberId,
      location,
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
      toLocation: location,
      notes: args.notes,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "assetOps:checkOut",
    );
  },
});

/** Check an asset back in (returns to available, clears custodian). */
export const checkIn = mutation({
  args: {
    assetId: v.id("assets"),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const asset = await loadAsset(ctx, auth, args.assetId);
    const location = resolvedLocation(
      args.location,
      asset.location,
      auth.org.defaultAddress,
    );

    await ctx.db.patch(args.assetId, {
      status: "available",
      custodianMemberId: undefined,
      location,
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
      toLocation: location,
      notes: args.notes,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "assetOps:checkIn",
    );
  },
});

/** Transfer an asset directly from one custodian to another. */
export const transfer = mutation({
  args: {
    assetId: v.id("assets"),
    toCustodianMemberId: v.id("members"),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const asset = await loadAsset(ctx, auth, args.assetId);
    const newCustodian = await ctx.db.get(args.toCustodianMemberId);
    assertSameOrg(auth, newCustodian);
    const location = resolvedLocation(
      args.location,
      asset.location,
      auth.org.defaultAddress,
    );

    await ctx.db.patch(args.assetId, {
      status: "checked_out",
      custodianMemberId: args.toCustodianMemberId,
      location,
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
      toLocation: location,
      notes: args.notes,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "assetOps:transfer",
    );
  },
});

export const reportLost = mutation({
  args: {
    assetId: v.id("assets"),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
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
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "assetOps:reportLost",
    );
  },
});

export const setMaintenance = mutation({
  args: {
    assetId: v.id("assets"),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
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
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "assetOps:setMaintenance",
    );
  },
});

export const retire = mutation({
  args: {
    assetId: v.id("assets"),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
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
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "assetOps:retire",
    );
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

/**
 * Record a field "sighting" of an asset by tag scan. Does not change
 * custodian or status — purely an audit-log breadcrumb with optional
 * geo coordinates so committee can trace where club kit was seen.
 *
 * Mirrors the Kit-Trace mobile scan flow: every NFC / QR scan from the
 * field writes one row here.
 */
export const recordScan = mutation({
  args: {
    assetId: v.id("assets"),
    geoLatitude: v.optional(v.number()),
    geoLongitude: v.optional(v.number()),
    geoAccuracy: v.optional(v.number()),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const asset = await loadAsset(ctx, auth, args.assetId);
    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId: asset._id,
      action: "scanned",
      performedBy: auth.user._id,
      geoLatitude: args.geoLatitude,
      geoLongitude: args.geoLongitude,
      geoAccuracy: args.geoAccuracy,
      notes: args.notes,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "assetOps:recordScan",
    );
  },
});
