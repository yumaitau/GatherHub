import { mutation, query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  requireOrgMember,
  requireRole,
  requireAnyRole,
  assertSameOrg,
  ASSET_MANAGER_ROLES,
} from "./lib/auth";
import { writeAudit } from "./lib/audit";
import { generateTagId } from "./lib/ids";
import { assetStatusValidator } from "./schema";
import { assertTaxonomyKey } from "./taxonomies";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";

const nullableString = v.union(v.string(), v.null());

function defaultedLocation(
  explicit: string | undefined,
  fallback: string | undefined,
): string | undefined {
  return explicit?.trim() || fallback?.trim() || undefined;
}

async function enrichAsset(ctx: QueryCtx, asset: Doc<"assets">) {
  return {
    ...asset,
    custodianName: asset.custodianMemberId
      ? await memberName(ctx, asset.custodianMemberId)
      : null,
  };
}

async function enrichHistoryEntry(ctx: QueryCtx, entry: Doc<"assetAuditLog">) {
  const [performer, asset] = await Promise.all([
    ctx.db.get(entry.performedBy),
    ctx.db.get(entry.assetId),
  ]);
  return {
    ...entry,
    assetName: asset?.name ?? "(deleted asset)",
    assetCategory: asset?.category ?? null,
    performerName: performer
      ? `${performer.firstName ?? ""} ${performer.lastName ?? ""}`.trim()
      : "Unknown",
    fromCustodianName: entry.fromCustodianMemberId
      ? await memberName(ctx, entry.fromCustodianMemberId)
      : null,
    toCustodianName: entry.toCustodianMemberId
      ? await memberName(ctx, entry.toCustodianMemberId)
      : null,
  };
}

/**
 * Single KitTrace screen payload: inventory plus org-wide audit history.
 * Used by /assets so users do not need a separate Asset History route.
 */
export const kitTrace = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const [assets, history] = await Promise.all([
      ctx.db
        .query("assets")
        .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
        .collect(),
      ctx.db
        .query("assetAuditLog")
        .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
        .collect(),
    ]);

    assets.sort((a, b) => a.name.localeCompare(b.name));
    history.sort((a, b) => b.performedAt - a.performedAt);

    return {
      assets: await Promise.all(assets.map((asset) => enrichAsset(ctx, asset))),
      history: await Promise.all(
        history.map((entry) => enrichHistoryEntry(ctx, entry)),
      ),
    };
  },
});

export const list = query({
  args: {
    status: v.optional(assetStatusValidator),
    category: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);

    let assets;
    if (args.status) {
      assets = await ctx.db
        .query("assets")
        .withIndex("by_org_and_status", (q) =>
          q.eq("orgId", auth.org._id).eq("status", args.status!),
        )
        .collect();
    } else if (args.category) {
      assets = await ctx.db
        .query("assets")
        .withIndex("by_org_and_category", (q) =>
          q.eq("orgId", auth.org._id).eq("category", args.category!),
        )
        .collect();
    } else {
      assets = await ctx.db
        .query("assets")
        .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
        .collect();
    }

    const search = args.search?.trim().toLowerCase();
    if (search) {
      assets = assets.filter((a) =>
        `${a.name} ${a.serialNumber ?? ""} ${a.qrTagId ?? ""}`
          .toLowerCase()
          .includes(search),
      );
    }

    return await Promise.all(
      assets
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((asset) => enrichAsset(ctx, asset)),
    );
  },
});

export const get = query({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const asset = await ctx.db.get(args.assetId);
    assertSameOrg(auth, asset);
    if (!asset) throw new Error("Not found.");

    const custodian = asset.custodianMemberId
      ? await ctx.db.get(asset.custodianMemberId)
      : null;
    const sponsor = asset.sponsorId ? await ctx.db.get(asset.sponsorId) : null;
    const tags = await ctx.db
      .query("assetTags")
      .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
      .collect();

    return { asset, custodian, sponsor, tags };
  },
});

/**
 * Org-wide audit history across every asset, newest first. Kept for audit
 * log views and direct integrations; the main KitTrace screen uses kitTrace.
 */
export const allHistory = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const entries = await ctx.db
      .query("assetAuditLog")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    entries.sort((a, b) => b.performedAt - a.performedAt);
    return await Promise.all(
      entries.map((entry) => enrichHistoryEntry(ctx, entry)),
    );
  },
});

/** Immutable audit history for an asset, newest first. */
export const history = query({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const asset = await ctx.db.get(args.assetId);
    assertSameOrg(auth, asset);

    const entries = await ctx.db
      .query("assetAuditLog")
      .withIndex("by_asset", (q) => q.eq("assetId", args.assetId))
      .collect();
    entries.sort((a, b) => b.performedAt - a.performedAt);

    return await Promise.all(
      entries.map(async (e) => {
        const performer = await ctx.db.get(e.performedBy);
        return {
          ...e,
          performerName: performer
            ? `${performer.firstName ?? ""} ${performer.lastName ?? ""}`.trim()
            : "Unknown",
          fromCustodianName: e.fromCustodianMemberId
            ? await memberName(ctx, e.fromCustodianMemberId)
            : null,
          toCustodianName: e.toCustodianMemberId
            ? await memberName(ctx, e.toCustodianMemberId)
            : null,
        };
      }),
    );
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    purchaseDate: v.optional(v.string()),
    replacementValue: v.optional(v.number()),
    condition: v.optional(v.string()),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    sponsorId: v.optional(v.id("sponsors")),
    nfcTagId: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const assetId = ctx.db.normalizeId("assets", replay.resultId);
      if (assetId) return assetId;
    }
    if (replay) throw new Error("Asset creation already completed.");
    await assertTaxonomyKey(ctx, auth.org._id, "asset_category", args.category);
    if (args.condition !== undefined) {
      await assertTaxonomyKey(
        ctx,
        auth.org._id,
        "asset_condition",
        args.condition,
      );
    }
    if (args.sponsorId) {
      const sponsor = await ctx.db.get(args.sponsorId);
      assertSameOrg(auth, sponsor);
    }

    const nfcTagId = args.nfcTagId?.trim();
    if (args.nfcTagId !== undefined && !nfcTagId) {
      throw new Error("NFC tag id required.");
    }
    if (nfcTagId) {
      const clash = await ctx.db
        .query("assetTags")
        .withIndex("by_tag", (q) => q.eq("tagId", nfcTagId))
        .unique();
      if (clash) {
        throw new Error("That NFC tag is not available.");
      }
    }

    // Mint a QR tag id at creation so every asset is immediately scannable.
    const qrTagId = generateTagId();
    const location = defaultedLocation(args.location, auth.org.defaultAddress);
    const assetId = await ctx.db.insert("assets", {
      orgId: auth.org._id,
      name: args.name.trim(),
      category: args.category,
      description: args.description,
      serialNumber: args.serialNumber,
      purchaseDate: args.purchaseDate,
      replacementValue: args.replacementValue,
      condition: args.condition ?? "good",
      status: "available",
      location,
      notes: args.notes,
      sponsorId: args.sponsorId,
      qrTagId,
      ...(nfcTagId ? { nfcTagId } : {}),
    });

    await ctx.db.insert("assetTags", {
      orgId: auth.org._id,
      tagId: qrTagId,
      assetId,
      type: "qr",
      active: true,
    });

    if (nfcTagId) {
      await ctx.db.insert("assetTags", {
        orgId: auth.org._id,
        tagId: nfcTagId,
        assetId,
        type: "nfc",
        active: true,
      });
    }

    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId,
      action: "created",
      performedBy: auth.user._id,
      toStatus: "available",
      toLocation: location,
    });

    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "assets:create",
      String(assetId),
    );

    return assetId;
  },
});

export const update = mutation({
  args: {
    assetId: v.id("assets"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    description: v.optional(nullableString),
    serialNumber: v.optional(nullableString),
    purchaseDate: v.optional(nullableString),
    replacementValue: v.optional(v.union(v.number(), v.null())),
    condition: v.optional(v.string()),
    location: v.optional(nullableString),
    notes: v.optional(nullableString),
    sponsorId: v.optional(v.union(v.id("sponsors"), v.null())),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return;
    const asset = await ctx.db.get(args.assetId);
    assertSameOrg(auth, asset);
    if (args.category !== undefined) {
      await assertTaxonomyKey(
        ctx,
        auth.org._id,
        "asset_category",
        args.category,
      );
    }
    if (args.condition !== undefined) {
      await assertTaxonomyKey(
        ctx,
        auth.org._id,
        "asset_condition",
        args.condition,
      );
    }

    const { assetId, sponsorId, clientMutationId, ...rest } = args;
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest)
        .filter(([, v]) => v !== undefined)
        .map(([key, value]) => [key, value === null ? undefined : value]),
    );
    if (args.location !== undefined) {
      patch.location = args.location?.trim() || undefined;
    }
    if (sponsorId !== undefined) {
      if (sponsorId !== null) {
        const sponsor = await ctx.db.get(sponsorId);
        assertSameOrg(auth, sponsor);
      }
      patch.sponsorId = sponsorId ?? undefined;
    }
    await ctx.db.patch(assetId, patch);

    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId,
      action: "updated",
      performedBy: auth.user._id,
      notes: "Asset details updated.",
    });
    await recordClientMutation(
      ctx,
      auth,
      clientMutationId,
      "assets:update",
      String(assetId),
    );
  },
});

/**
 * Reassign an existing tag (QR or NFC) from one asset to another within the
 * same org. The physical tag is being moved or repurposed. The tag stays
 * the same; only the asset link changes. Audit-logs both assets.
 */
export const reassignTag = mutation({
  args: {
    tagId: v.string(),
    toAssetId: v.id("assets"),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    const target = await ctx.db.get(args.toAssetId);
    assertSameOrg(auth, target);
    if (!target) throw new Error("Target asset not found.");

    const tag = await ctx.db
      .query("assetTags")
      .withIndex("by_tag", (q) => q.eq("tagId", args.tagId))
      .unique();
    // Collapse "absent" and "belongs to another org" into one opaque error
    // so a tag id can't be used to probe other tenants.
    if (!tag || tag.orgId !== auth.org._id) {
      throw new Error("Tag not found in your organisation.");
    }
    if (tag.assetId === args.toAssetId) return;

    const fromAsset = await ctx.db.get(tag.assetId);
    if (fromAsset && fromAsset.orgId !== auth.org._id) {
      // Shouldn't be reachable given the tag-org check above, but keep the
      // same opaque wording to avoid leaking via timing or future changes.
      throw new Error("Tag not found in your organisation.");
    }

    await ctx.db.patch(tag._id, { assetId: args.toAssetId });

    // Sync the denormalised qrTagId / nfcTagId fields on both assets.
    const field = tag.type === "qr" ? "qrTagId" : "nfcTagId";
    if (fromAsset && fromAsset[field] === args.tagId) {
      await ctx.db.patch(fromAsset._id, { [field]: undefined });
    }
    await ctx.db.patch(args.toAssetId, { [field]: args.tagId });

    const tagLabel = tag.type === "qr" ? "QR tag" : "NFC tag";
    if (fromAsset) {
      await writeAudit(ctx, {
        orgId: auth.org._id,
        assetId: fromAsset._id,
        action: "tag_reassigned",
        performedBy: auth.user._id,
        notes: `${tagLabel} ${args.tagId} reassigned to ${target.name}.`,
      });
    }
    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId: args.toAssetId,
      action: "tag_reassigned",
      performedBy: auth.user._id,
      notes: `${tagLabel} ${args.tagId} reassigned${fromAsset ? ` from ${fromAsset.name}` : ""}.`,
    });
  },
});

/** Register an NFC tag id for an asset. */
export const registerNfc = mutation({
  args: {
    assetId: v.id("assets"),
    nfcTagId: v.string(),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireAnyRole(ctx, ASSET_MANAGER_ROLES);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const asset = await ctx.db.get(args.assetId);
    assertSameOrg(auth, asset);

    const tagId = args.nfcTagId.trim();
    if (!tagId) throw new Error("NFC tag id required.");

    // tagId is globally unique. If a clash exists in *another* org we must
    // not disclose that fact (it would oracle NFC ids across tenants).
    // Return the same opaque error as an in-org clash so the two cases are
    // indistinguishable. See security review (High #5).
    const clash = await ctx.db
      .query("assetTags")
      .withIndex("by_tag", (q) => q.eq("tagId", tagId))
      .unique();
    if (clash && clash.orgId !== auth.org._id) {
      throw new Error("That NFC tag is not available.");
    }
    if (clash && clash.assetId !== args.assetId) {
      throw new Error("That NFC tag is not available.");
    }

    if (!clash) {
      await ctx.db.insert("assetTags", {
        orgId: auth.org._id,
        tagId,
        assetId: args.assetId,
        type: "nfc",
        active: true,
      });
    }
    await ctx.db.patch(args.assetId, { nfcTagId: tagId });
    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId: args.assetId,
      action: "tag_registered",
      performedBy: auth.user._id,
      notes: `NFC tag registered (${tagId}).`,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "assets:registerNfc",
    );
  },
});

export const remove = mutation({
  args: {
    assetId: v.id("assets"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Deleting an asset is reserved for admins; prefer "retire" in normal use.
    const auth = await requireRole(ctx, "admin");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return;
    const asset = await ctx.db.get(args.assetId);
    assertSameOrg(auth, asset);
    const tags = await ctx.db
      .query("assetTags")
      .withIndex("by_asset", (q) => q.eq("assetId", args.assetId))
      .collect();
    for (const t of tags) await ctx.db.delete(t._id);
    // Note: audit log rows are intentionally retained.
    await ctx.db.delete(args.assetId);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "assets:remove",
      String(args.assetId),
    );
  },
});

async function memberName(
  ctx: QueryCtx,
  id: Id<"members">,
): Promise<string | null> {
  const m = await ctx.db.get(id);
  return m ? `${m.firstName} ${m.lastName}`.trim() : null;
}
