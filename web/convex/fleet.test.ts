import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { Role } from "./lib/auth";

const modules = import.meta.glob("./**/*.ts");

/** Seed an org (of a given kind) + an owner/role membership; return a client. */
async function seedOrg(
  t: ReturnType<typeof convexTest>,
  opts: { kind: string; role: Role; user: string },
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
      kind: opts.kind as never,
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
  fields: Partial<{
    assetType: string;
    odometer: number;
    status: string;
  }> = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("assets", {
      orgId,
      name: "Truck 1",
      category: "vehicle",
      condition: "good",
      status: (fields.status ?? "available") as never,
      assetType: fields.assetType as never,
      odometer: fields.odometer,
    }),
  );
}

describe("fleet: lifecycle", () => {
  test("inspection with a major defect takes the asset out of service; resolving restores it", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "logistics",
      role: "owner",
      user: "fleet_owner",
    });
    const assetId = await insertAsset(t, owner.orgId);

    // Mark it as a fleet vehicle.
    await owner.as.mutation(api.fleet.setFleetMeta, {
      assetId,
      assetType: "vehicle",
      registration: "ABC123",
    });

    let board = await owner.as.query(api.fleet.dashboard, {});
    expect(board.counts.total).toBe(1);
    expect(board.assets[0]!.flag).toBe("ok");

    // Pre-start inspection flags a major brake defect.
    await owner.as.mutation(api.fleet.recordInspection, {
      assetId,
      type: "pre_start",
      result: "pass_with_defects",
      odometer: 1200,
      defects: [{ title: "Brake light out", severity: "major" }],
    });

    const block = await owner.as.query(api.fleet.assignmentBlock, { assetId });
    expect(block.blocked).toBe(true);

    board = await owner.as.query(api.fleet.dashboard, {});
    expect(board.assets[0]!.flag).toBe("out_of_service");
    expect(board.assets[0]!.openDefectCount).toBe(1);

    const detail = await owner.as.query(api.fleet.vehicle, { assetId });
    expect(detail.inspections).toHaveLength(1);
    expect(detail.defects).toHaveLength(1);
    expect(detail.asset.status).toBe("maintenance");
    expect(detail.asset.odometer).toBe(1200);

    // Resolve the defect → asset comes back into service.
    await owner.as.mutation(api.fleet.resolveDefect, {
      defectId: detail.defects[0]!._id,
    });
    const after = await owner.as.query(api.fleet.vehicle, { assetId });
    expect(after.asset.status).toBe("available");
    expect(
      (await owner.as.query(api.fleet.assignmentBlock, { assetId })).blocked,
    ).toBe(false);
  });

  test("minor defects do not block assignment", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "logistics",
      role: "owner",
      user: "fleet_minor",
    });
    const assetId = await insertAsset(t, owner.orgId, { assetType: "vehicle" });
    await owner.as.mutation(api.fleet.reportDefect, {
      assetId,
      severity: "minor",
      title: "Scratched paint",
    });
    const block = await owner.as.query(api.fleet.assignmentBlock, { assetId });
    expect(block.blocked).toBe(false);
    const detail = await owner.as.query(api.fleet.vehicle, { assetId });
    expect(detail.asset.status).toBe("available");
  });

  test("service rule by distance flags an overdue service", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "logistics",
      role: "owner",
      user: "fleet_service",
    });
    const assetId = await insertAsset(t, owner.orgId, {
      assetType: "vehicle",
      odometer: 10000,
    });
    await owner.as.mutation(api.fleet.upsertServiceRule, {
      assetId,
      label: "Oil change",
      intervalKm: 5000,
      lastServiceOdometer: 4000, // next due at 9000, we're at 10000
    });
    const board = await owner.as.query(api.fleet.dashboard, {});
    expect(board.assets[0]!.flag).toBe("overdue_service");
    expect(board.counts.overdueService).toBe(1);
  });
});

describe("fleet: gating", () => {
  test("players cannot inspect or manage fleet", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "logistics",
      role: "owner",
      user: "fleet_g_owner",
    });
    const assetId = await insertAsset(t, owner.orgId, { assetType: "vehicle" });
    const player = await seedOrgMember(t, owner.orgId, {
      role: "player",
      user: "fleet_player",
    });

    await expect(
      player.as.mutation(api.fleet.setFleetMeta, {
        assetId,
        registration: "X",
      }),
    ).rejects.toThrow(/permission|fleet\.manage/i);
    await expect(
      player.as.mutation(api.fleet.recordInspection, {
        assetId,
        type: "pre_start",
        result: "pass",
      }),
    ).rejects.toThrow(/permission|fleet\.inspect/i);
  });

  test("the fleet module must be enabled (off for plain sports clubs)", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "sports_club",
      role: "owner",
      user: "fleet_sports",
    });
    await expect(owner.as.query(api.fleet.dashboard, {})).rejects.toThrow(
      /fleet|module|disabled/i,
    );
  });
});

/** Add another user to an existing org. */
async function seedOrgMember(
  t: ReturnType<typeof convexTest>,
  orgId: Id<"organizations">,
  opts: { role: Role; user: string },
) {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: opts.user,
      email: `${opts.user}@example.test`,
      firstName: opts.user,
      activeOrgId: orgId,
    });
    await ctx.db.insert("memberships", { orgId, userId, role: opts.role });
  });
  return { as: t.withIdentity({ subject: opts.user }) };
}
