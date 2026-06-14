import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { Role } from "./lib/auth";

const modules = import.meta.glob("./**/*.ts");

async function seedOrg(
  t: ReturnType<typeof convexTest>,
  opts: { role: Role; user: string },
) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: opts.user,
      email: `${opts.user}@example.test`,
      firstName: opts.user,
    });
    const orgId = await ctx.db.insert("organizations", {
      name: "Ops Co",
      slug: opts.user,
      createdBy: userId,
      kind: "logistics" as never,
    });
    await ctx.db.insert("memberships", { orgId, userId, role: opts.role });
    await ctx.db.patch(userId, { activeOrgId: orgId });
    return { orgId, userId };
  });
  return { ...ids, as: t.withIdentity({ subject: opts.user }) };
}

async function insertAsset(
  t: ReturnType<typeof convexTest>,
  orgId: Id<"organizations">,
  category: string,
  assetType?: string,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("assets", {
      orgId,
      name: "Truck 1",
      category,
      condition: "good",
      status: "available" as never,
      assetType: assetType as never,
    }),
  );
}

describe("asset custom fields", () => {
  test("resolve returns the union of category + assetType fields", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, { role: "owner", user: "cf_owner" });
    await owner.as.mutation(api.assetFields.upsertDef, {
      scope: "category",
      scopeKey: "Truck",
      label: "Axles",
      kind: "number",
      unit: "count",
    });
    await owner.as.mutation(api.assetFields.upsertDef, {
      scope: "assetType",
      scopeKey: "vehicle",
      label: "VIN",
      kind: "text",
    });

    const both = await owner.as.query(api.assetFields.resolveForAsset, {
      category: "Truck",
      assetType: "vehicle",
    });
    expect(both.map((d) => d.label).sort()).toEqual(["Axles", "VIN"]);

    const catOnly = await owner.as.query(api.assetFields.resolveForAsset, {
      category: "Truck",
    });
    expect(catOnly.map((d) => d.label)).toEqual(["Axles"]);
  });

  test("setAttributes validates kind, options, and required", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, { role: "owner", user: "cf_val" });
    const assetId = await insertAsset(t, owner.orgId, "Truck", "vehicle");
    const axlesId = await owner.as.mutation(api.assetFields.upsertDef, {
      scope: "category",
      scopeKey: "Truck",
      label: "Axles",
      kind: "number",
      required: true,
    });
    await owner.as.mutation(api.assetFields.upsertDef, {
      scope: "assetType",
      scopeKey: "vehicle",
      label: "Fuel",
      kind: "select",
      options: ["diesel", "petrol"],
    });
    const axlesKey = (await t.run((ctx) => ctx.db.get(axlesId)))!.key;

    // Non-numeric → rejected.
    await expect(
      owner.as.mutation(api.assetFields.setAttributes, {
        assetId,
        attributes: [{ key: axlesKey, value: "three" }],
      }),
    ).rejects.toThrow(/number/i);

    // Missing required → rejected.
    await expect(
      owner.as.mutation(api.assetFields.setAttributes, {
        assetId,
        attributes: [],
      }),
    ).rejects.toThrow(/required/i);

    // Valid → stored.
    await owner.as.mutation(api.assetFields.setAttributes, {
      assetId,
      attributes: [{ key: axlesKey, value: "3" }],
    });
    const stored = await t.run((ctx) => ctx.db.get(assetId));
    expect(stored!.attributes).toEqual([{ key: axlesKey, value: "3" }]);
  });

  test("only assets.admin can define fields", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, { role: "owner", user: "cf_admin" });
    await t.run(async (ctx) => {
      const uid = await ctx.db.insert("users", {
        clerkUserId: "cf_player",
        email: "cf_player@example.test",
        firstName: "Pat",
        activeOrgId: owner.orgId,
      });
      await ctx.db.insert("memberships", {
        orgId: owner.orgId,
        userId: uid,
        role: "player",
      });
    });
    const player = t.withIdentity({ subject: "cf_player" });
    await expect(
      player.mutation(api.assetFields.upsertDef, {
        scope: "category",
        scopeKey: "Truck",
        label: "X",
        kind: "text",
      }),
    ).rejects.toThrow(/permission|assets\.admin/i);
  });
});
