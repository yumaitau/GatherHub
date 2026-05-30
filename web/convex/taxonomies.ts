import { ConvexError, v } from "convex/values";
import {
  MutationCtx,
  mutation,
  query,
  QueryCtx,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireOrgMember, requireRole, assertSameOrg } from "./lib/auth";
import { taxonomyKindValidator } from "./schema";

/**
 * Per-org configurable taxonomies for event types, asset categories,
 * asset conditions, and team age groups. Records on `events`, `assets`,
 * and `teams` store the taxonomy `key` string; this module owns reading,
 * writing, and validating those keys.
 */

type Kind =
  | "event_type"
  | "asset_category"
  | "asset_condition"
  | "team_age_group";

interface DefaultRow {
  key: string;
  label: string;
  isDefault?: boolean;
}

const DEFAULTS: Record<Kind, DefaultRow[]> = {
  event_type: [
    { key: "training", label: "Training", isDefault: true },
    { key: "match", label: "Match" },
    { key: "meeting", label: "Meeting" },
    { key: "social", label: "Social" },
    { key: "working_bee", label: "Working bee" },
  ],
  asset_category: [
    { key: "apparel", label: "Apparel" },
    { key: "equipment", label: "Equipment", isDefault: true },
    { key: "tool", label: "Tool" },
    { key: "electronics", label: "Electronics" },
    { key: "av_equipment", label: "AV equipment" },
    { key: "safety_equipment", label: "Safety equipment" },
    { key: "furniture", label: "Furniture" },
    { key: "vehicle", label: "Vehicle" },
    { key: "key", label: "Key" },
    { key: "media", label: "Media" },
    { key: "other", label: "Other" },
  ],
  asset_condition: [
    { key: "new", label: "New" },
    { key: "good", label: "Good", isDefault: true },
    { key: "fair", label: "Fair" },
    { key: "poor", label: "Poor" },
    { key: "damaged", label: "Damaged" },
  ],
  team_age_group: [
    { key: "u6", label: "U6" },
    { key: "u8", label: "U8" },
    { key: "u10", label: "U10" },
    { key: "u12", label: "U12" },
    { key: "u14", label: "U14" },
    { key: "u16", label: "U16" },
    { key: "u18", label: "U18" },
    { key: "open", label: "Open", isDefault: true },
    { key: "masters", label: "Masters" },
  ],
};

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "untitled";
}

/**
 * Ensure default rows exist for an org and kind. Idempotent: only inserts
 * when no rows exist for that org+kind. Safe to call from mutations.
 */
export async function ensureKindDefaults(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  kind: Kind,
): Promise<void> {
  const existing = await ctx.db
    .query("taxonomies")
    .withIndex("by_org_kind_order", (q) =>
      q.eq("orgId", orgId).eq("kind", kind),
    )
    .first();
  if (existing) return;
  let order = 0;
  for (const row of DEFAULTS[kind]) {
    await ctx.db.insert("taxonomies", {
      orgId,
      kind,
      key: row.key,
      label: row.label,
      order: order++,
      active: true,
      isDefault: row.isDefault,
    });
  }
}

/** Ensure defaults for every taxonomy kind. Called on org creation. */
export async function seedAllDefaultsForOrg(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
): Promise<void> {
  const kinds: Kind[] = [
    "event_type",
    "asset_category",
    "asset_condition",
    "team_age_group",
  ];
  for (const kind of kinds) {
    await ensureKindDefaults(ctx, orgId, kind);
  }
}

/**
 * Verify a key matches an active taxonomy row for this org+kind.
 * Throws ConvexError("invalid_taxonomy_key") if not. Seeds defaults
 * first so brand-new orgs always have a working set.
 */
export async function assertTaxonomyKey(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  kind: Kind,
  key: string,
): Promise<void> {
  await ensureKindDefaults(ctx, orgId, kind);
  const row = await ctx.db
    .query("taxonomies")
    .withIndex("by_org_kind_key", (q) =>
      q.eq("orgId", orgId).eq("kind", kind).eq("key", key),
    )
    .first();
  if (!row || !row.active) {
    throw new ConvexError({
      code: "invalid_taxonomy_key",
      kind,
      key,
      message: `"${key}" is not an active ${humanKind(kind)} for this organisation.`,
    });
  }
}

function humanKind(kind: Kind): string {
  switch (kind) {
    case "event_type":
      return "event type";
    case "asset_category":
      return "asset category";
    case "asset_condition":
      return "asset condition";
    case "team_age_group":
      return "age group";
  }
}

/**
 * Read the active rows for a kind in the current org. Lazily seeds
 * defaults if none exist. UI dropdowns use this.
 */
export const list = query({
  args: {
    kind: taxonomyKindValidator,
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const rows = await ctx.db
      .query("taxonomies")
      .withIndex("by_org_kind_order", (q) =>
        q.eq("orgId", auth.org._id).eq("kind", args.kind),
      )
      .collect();
    const filtered = args.includeInactive ? rows : rows.filter((r) => r.active);
    filtered.sort((a, b) => a.order - b.order);
    return filtered.map((r) => ({
      id: r._id,
      kind: r.kind,
      key: r.key,
      label: r.label,
      order: r.order,
      active: r.active,
      isDefault: r.isDefault ?? false,
      color: r.color,
    }));
  },
});

/**
 * Seed defaults for the active org if no rows exist for a kind. Returns
 * the seeded rows. Used as a one-shot from the UI when a list query
 * comes back empty for an org that hasn't been touched yet.
 */
export const seedDefaultsIfEmpty = mutation({
  args: { kind: taxonomyKindValidator },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    await ensureKindDefaults(ctx, auth.org._id, args.kind);
  },
});

export const create = mutation({
  args: {
    kind: taxonomyKindValidator,
    label: v.string(),
    key: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const label = args.label.trim();
    if (!label) {
      throw new ConvexError({
        code: "invalid_label",
        message: "Label is required.",
      });
    }
    const key = (args.key ?? slugify(label)).trim();
    if (!key) {
      throw new ConvexError({
        code: "invalid_key",
        message: "Key is required.",
      });
    }

    // Reject duplicate active key within kind.
    const existing = await ctx.db
      .query("taxonomies")
      .withIndex("by_org_kind_key", (q) =>
        q.eq("orgId", auth.org._id).eq("kind", args.kind).eq("key", key),
      )
      .first();
    if (existing) {
      if (existing.active) {
        throw new ConvexError({
          code: "duplicate_key",
          message: `"${key}" already exists for this kind.`,
        });
      }
      // Reactivate the soft-deleted row instead of creating a new one.
      await ctx.db.patch(existing._id, { label, active: true, color: args.color });
      return existing._id;
    }

    // Append to end.
    const last = await ctx.db
      .query("taxonomies")
      .withIndex("by_org_kind_order", (q) =>
        q.eq("orgId", auth.org._id).eq("kind", args.kind),
      )
      .order("desc")
      .first();
    const order = last ? last.order + 1 : 0;

    return await ctx.db.insert("taxonomies", {
      orgId: auth.org._id,
      kind: args.kind,
      key,
      label,
      order,
      active: true,
      color: args.color,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("taxonomies"),
    label: v.optional(v.string()),
    color: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const row = await ctx.db.get(args.id);
    assertSameOrg(auth, row);
    if (!row) return;
    const patch: Record<string, unknown> = {};
    if (args.label !== undefined) {
      const next = args.label.trim();
      if (!next) {
        throw new ConvexError({
          code: "invalid_label",
          message: "Label is required.",
        });
      }
      patch.label = next;
    }
    if (args.color !== undefined) {
      patch.color = args.color ?? undefined;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.id, patch);
    }
  },
});

export const setActive = mutation({
  args: { id: v.id("taxonomies"), active: v.boolean() },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const row = await ctx.db.get(args.id);
    assertSameOrg(auth, row);
    if (!row) return;
    await ctx.db.patch(args.id, { active: args.active });
    // If this was the default and is being deactivated, clear the default flag.
    if (!args.active && row.isDefault) {
      await ctx.db.patch(args.id, { isDefault: false });
    }
  },
});

export const setDefault = mutation({
  args: { id: v.id("taxonomies") },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const row = await ctx.db.get(args.id);
    assertSameOrg(auth, row);
    if (!row) return;
    // Clear the existing default for this kind, then set this one.
    const peers = await ctx.db
      .query("taxonomies")
      .withIndex("by_org_kind_order", (q) =>
        q.eq("orgId", auth.org._id).eq("kind", row.kind),
      )
      .collect();
    for (const peer of peers) {
      if (peer.isDefault && peer._id !== args.id) {
        await ctx.db.patch(peer._id, { isDefault: false });
      }
    }
    await ctx.db.patch(args.id, { isDefault: true, active: true });
  },
});

export const reorder = mutation({
  args: {
    kind: taxonomyKindValidator,
    orderedIds: v.array(v.id("taxonomies")),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    let order = 0;
    for (const id of args.orderedIds) {
      const row = await ctx.db.get(id);
      assertSameOrg(auth, row);
      if (!row || row.kind !== args.kind) continue;
      await ctx.db.patch(id, { order: order++ });
    }
  },
});

/**
 * Lookup label by key. Useful for rendering historical records whose key
 * may have been soft-deleted (label still resolves).
 */
export async function lookupLabel(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  kind: Kind,
  key: string,
): Promise<string> {
  const row = await ctx.db
    .query("taxonomies")
    .withIndex("by_org_kind_key", (q) =>
      q.eq("orgId", orgId).eq("kind", kind).eq("key", key),
    )
    .first();
  return row?.label ?? key;
}

/**
 * Read-only catalogue, used by the Settings UI to render the editor for
 * every kind in one shot.
 */
export const listAllKinds = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const rows = await ctx.db
      .query("taxonomies")
      .withIndex("by_org_kind_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    rows.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.order - b.order;
    });
    return rows.map((r) => ({
      id: r._id,
      kind: r.kind,
      key: r.key,
      label: r.label,
      order: r.order,
      active: r.active,
      isDefault: r.isDefault ?? false,
      color: r.color,
    }));
  },
});
