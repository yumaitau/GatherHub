import { mutation, query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { requireOrgMember, assertSameOrg } from "./lib/auth";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";
import { requireCapability } from "./lib/capabilities";
import { assetFieldScopeValidator, assetFieldKindValidator } from "./schema";

/**
 * Configurable custom fields for assets (GX-12 follow-up). An `assetFieldDefs`
 * row declares a field bound to a Category (taxonomy) or a fleet assetType; an
 * asset renders the union of fields for its category + its type, and stores the
 * values in `assets.attributes` (string-encoded, parsed per `kind`).
 */

type FieldKind = Doc<"assetFieldDefs">["kind"];

/** Stable machine key from a human label. */
function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "field"
  );
}

/** Validate a string value against a field kind. Returns the cleaned value. */
function validateValue(def: Doc<"assetFieldDefs">, raw: string): string {
  const value = raw.trim();
  if (value === "") return "";
  switch (def.kind) {
    case "number":
      if (!Number.isFinite(Number(value)))
        throw new ConvexError(`"${def.label}" must be a number.`);
      return value;
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new ConvexError(`"${def.label}" must be a date.`);
      return value;
    case "boolean":
      if (value !== "true" && value !== "false")
        throw new ConvexError(`"${def.label}" must be true or false.`);
      return value;
    case "select":
      if (!(def.options ?? []).includes(value))
        throw new ConvexError(`"${value}" is not an option for ${def.label}.`);
      return value;
    case "text":
    default:
      return value;
  }
}

/** Active defs that apply to an asset with the given category + fleet type. */
async function resolveDefs(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  category: string | undefined,
  assetType: string | undefined,
): Promise<Doc<"assetFieldDefs">[]> {
  const all = await ctx.db
    .query("assetFieldDefs")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const defs = all.filter(
    (d) =>
      d.active &&
      ((d.scope === "category" &&
        category !== undefined &&
        d.scopeKey === category) ||
        (d.scope === "assetType" &&
          assetType !== undefined &&
          d.scopeKey === assetType)),
  );
  defs.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  return defs;
}

// --- Queries ----------------------------------------------------------------

/** All custom field definitions for the org (for the Settings manager). */
export const listDefs = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "assets.read");
    const defs = await ctx.db
      .query("assetFieldDefs")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    defs.sort(
      (a, b) =>
        a.scope.localeCompare(b.scope) ||
        a.scopeKey.localeCompare(b.scopeKey) ||
        a.order - b.order,
    );
    return defs;
  },
});

/** Resolve the applicable fields for a category + assetType (for forms). */
export const resolveForAsset = query({
  args: {
    category: v.optional(v.string()),
    assetType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "assets.read");
    return await resolveDefs(ctx, auth.org._id, args.category, args.assetType);
  },
});

// --- Mutations --------------------------------------------------------------

/** Create or update a custom field definition. */
export const upsertDef = mutation({
  args: {
    defId: v.optional(v.id("assetFieldDefs")),
    scope: assetFieldScopeValidator,
    scopeKey: v.string(),
    key: v.optional(v.string()),
    label: v.string(),
    kind: assetFieldKindValidator,
    options: v.optional(v.array(v.string())),
    unit: v.optional(v.string()),
    required: v.optional(v.boolean()),
    order: v.optional(v.number()),
    active: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "assets.admin");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const id = ctx.db.normalizeId("assetFieldDefs", replay.resultId);
      if (id) return id;
    }
    if (replay) throw new ConvexError("Field already saved.");

    const label = args.label.trim();
    if (!label) throw new ConvexError("Label is required.");
    const kind: FieldKind = args.kind;
    const options =
      kind === "select"
        ? (args.options ?? []).map((o) => o.trim()).filter((o) => o.length > 0)
        : undefined;
    if (kind === "select" && (!options || options.length === 0))
      throw new ConvexError("A select field needs at least one option.");

    const now = Date.now();
    let defId: Id<"assetFieldDefs">;
    if (args.defId) {
      const existing = await ctx.db.get(args.defId);
      assertSameOrg(auth, existing);
      await ctx.db.patch(existing!._id, {
        scope: args.scope,
        scopeKey: args.scopeKey,
        label,
        kind,
        options,
        unit: args.unit?.trim() || undefined,
        required: args.required ?? existing!.required,
        order: args.order ?? existing!.order,
        active: args.active ?? existing!.active,
        updatedAt: now,
      });
      defId = existing!._id;
    } else {
      // Ensure a unique key within the org.
      const base = args.key?.trim() ? slugify(args.key) : slugify(label);
      let key = base;
      let n = 1;
      while (
        await ctx.db
          .query("assetFieldDefs")
          .withIndex("by_org_and_key", (q) =>
            q.eq("orgId", auth.org._id).eq("key", key),
          )
          .first()
      ) {
        key = `${base}_${n++}`;
      }
      defId = await ctx.db.insert("assetFieldDefs", {
        orgId: auth.org._id,
        scope: args.scope,
        scopeKey: args.scopeKey,
        key,
        label,
        kind,
        options,
        unit: args.unit?.trim() || undefined,
        required: args.required ?? false,
        order: args.order ?? now,
        active: args.active ?? true,
        createdBy: auth.user._id,
        createdAt: now,
        updatedAt: now,
      });
    }
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "assetFields:upsertDef",
      String(defId),
    );
    return defId;
  },
});

/** Delete a custom field definition. (Stored values are left untouched.) */
export const removeDef = mutation({
  args: {
    defId: v.id("assetFieldDefs"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "assets.admin");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return null;
    const def = await ctx.db.get(args.defId);
    assertSameOrg(auth, def);
    await ctx.db.delete(def!._id);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "assetFields:removeDef",
      String(args.defId),
    );
    return null;
  },
});

/** Set an asset's custom field values, validated against the active defs. */
export const setAttributes = mutation({
  args: {
    assetId: v.id("assets"),
    attributes: v.array(v.object({ key: v.string(), value: v.string() })),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "assets.admin");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return args.assetId;
    const asset = await ctx.db.get(args.assetId);
    assertSameOrg(auth, asset);

    const defs = await resolveDefs(
      ctx,
      auth.org._id,
      asset!.category,
      asset!.assetType,
    );
    const byKey = new Map(defs.map((d) => [d.key, d]));
    const incoming = new Map(args.attributes.map((a) => [a.key, a.value]));

    const cleaned: { key: string; value: string }[] = [];
    for (const def of defs) {
      const raw = incoming.get(def.key) ?? "";
      const value = validateValue(def, raw);
      if (def.required && value === "")
        throw new ConvexError(`"${def.label}" is required.`);
      if (value !== "") cleaned.push({ key: def.key, value });
    }
    // Preserve values for keys that still exist but weren't in this submit only
    // when caller omitted them entirely is intentional replacement, so we don't
    // merge — the form always submits the full active set.
    void byKey;

    await ctx.db.patch(asset!._id, { attributes: cleaned });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "assetFields:setAttributes",
      String(asset!._id),
    );
    return asset!._id;
  },
});
