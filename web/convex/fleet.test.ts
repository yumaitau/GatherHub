import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { Role } from "./lib/auth";
import {
  aggregateCosts,
  computeServiceDue,
  driverApprovedForVehicle,
  renewalState,
} from "./lib/fleetLogic";

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

describe("fleet operations: business rules", () => {
  test("service due calculation works by date, odometer, and overdue state", () => {
    const now = Date.parse("2026-06-14T00:00:00.000Z");
    const byDate = computeServiceDue(
      {
        currentOdometer: 10000,
        lastServiceDate: "2025-12-01",
        serviceIntervalMonths: 6,
      },
      now,
    );
    expect(byDate.state).toBe("overdue");
    expect(byDate.dueByDate).toBe(true);

    const byOdometer = computeServiceDue(
      {
        currentOdometer: 15200,
        lastServiceOdometer: 10000,
        serviceIntervalKm: 5000,
      },
      now,
    );
    expect(byOdometer.state).toBe("overdue");
    expect(byOdometer.dueByOdometer).toBe(true);

    const soon = computeServiceDue(
      {
        currentOdometer: 14050,
        lastServiceOdometer: 10000,
        serviceIntervalKm: 5000,
      },
      now,
    );
    expect(soon.state).toBe("due_soon");
    expect(soon.distanceUntilNextService).toBe(950);
  });

  test("expiry and approved vehicle type helpers are deterministic", () => {
    const now = Date.parse("2026-06-14T00:00:00.000Z");
    expect(renewalState("2026-06-10", now)).toBe("expired");
    expect(renewalState("2026-06-25", now)).toBe("due_soon");
    expect(renewalState("2026-09-25", now)).toBe("current");
    expect(driverApprovedForVehicle(["van", "bus"], "bus")).toBe(true);
    expect(driverApprovedForVehicle(["van"], "truck")).toBe(false);
  });

  test("reminders are generated for rego, insurance, licence, and WWCC expiries", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "logistics",
      role: "owner",
      user: "fleet_ops_reminders",
    });
    const vehicleId = await owner.as.mutation(api.fleet.createVehicle, {
      name: "Reminder Van",
      registrationNumber: "REM123",
      vehicleType: "van",
      regoExpiry: "2026-07-01",
      insuranceExpiry: "2026-07-02",
    });
    const driverId = await owner.as.mutation(api.fleet.createDriver, {
      name: "Reminder Driver",
      licenceExpiry: "2026-07-03",
      workingWithChildrenCheckExpiry: "2026-07-04",
      approvedVehicleTypes: ["van"],
    });
    expect(vehicleId).toBeTruthy();
    expect(driverId).toBeTruthy();
    await owner.as.mutation(api.fleet.generateReminders, {});
    const exported = await owner.as.query(api.fleet.exportData, {});
    const types = new Set(exported.reminders.map((r) => r.type));
    expect(types.has("rego_expiry")).toBe(true);
    expect(types.has("insurance_expiry")).toBe(true);
    expect(types.has("licence_expiry")).toBe(true);
    expect(types.has("wwcc_expiry")).toBe(true);
  });

  test("job assignment detects vehicle and driver overlaps", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "logistics",
      role: "owner",
      user: "fleet_ops_overlap",
    });
    const vehicleId = await owner.as.mutation(api.fleet.createVehicle, {
      name: "Overlap Van",
      registrationNumber: "OVR123",
      vehicleType: "van",
      regoExpiry: "2027-01-01",
      insuranceExpiry: "2027-01-01",
    });
    const driverId = await owner.as.mutation(api.fleet.createDriver, {
      name: "Overlap Driver",
      licenceExpiry: "2027-01-01",
      approvedVehicleTypes: ["van"],
    });
    await owner.as.mutation(api.fleet.createJob, {
      title: "Morning run",
      assignedVehicleId: vehicleId,
      assignedDriverId: driverId,
      startDateTime: 1_800_000_000_000,
      endDateTime: 1_800_003_600_000,
    });
    const check = await owner.as.query(api.fleet.checkJobAssignment, {
      vehicleId,
      driverId,
      startDateTime: 1_800_001_000_000,
      endDateTime: 1_800_002_000_000,
    });
    expect(check.blocked).toBe(true);
    expect(check.issues.map((i) => i.code)).toContain("vehicle_overlap");
    expect(check.issues.map((i) => i.code)).toContain("driver_overlap");
  });

  test("driver approved vehicle type validation blocks assignment", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "logistics",
      role: "owner",
      user: "fleet_ops_vehicle_type",
    });
    const vehicleId = await owner.as.mutation(api.fleet.createVehicle, {
      name: "Rigid Truck",
      registrationNumber: "TRK999",
      vehicleType: "truck",
      regoExpiry: "2027-01-01",
      insuranceExpiry: "2027-01-01",
    });
    const driverId = await owner.as.mutation(api.fleet.createDriver, {
      name: "Van Only",
      licenceExpiry: "2027-01-01",
      approvedVehicleTypes: ["van"],
    });
    const check = await owner.as.query(api.fleet.checkJobAssignment, {
      vehicleId,
      driverId,
      startDateTime: 1_800_010_000_000,
      endDateTime: 1_800_011_000_000,
    });
    expect(check.blocked).toBe(true);
    expect(check.issues.map((i) => i.code)).toContain("driver_vehicle_type");
  });

  test("critical defect makes vehicle unavailable and creates maintenance", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "logistics",
      role: "owner",
      user: "fleet_ops_defect",
    });
    const vehicleId = await owner.as.mutation(api.fleet.createVehicle, {
      name: "Unsafe Van",
      registrationNumber: "BAD123",
      vehicleType: "van",
    });
    await owner.as.mutation(api.fleet.submitDefect, {
      vehicleId,
      severity: "critical",
      safeToOperate: false,
      category: "Brakes",
      notes: "Brake pedal soft",
    });
    const detail = await owner.as.query(api.fleet.getVehicle, { vehicleId });
    expect(detail.vehicle.status).toBe("unavailable");
    expect(detail.defects[0]!.severity).toBe("critical");
    expect(
      detail.maintenance.some((m) => m.maintenanceType === "defect_repair"),
    ).toBe(true);
  });

  test("cost aggregation works by vehicle and project", async () => {
    const grouped = aggregateCosts([
      { key: "vehicle-a", amount: 100 },
      { key: "vehicle-a", amount: 50 },
      { key: "project-b", amount: 25 },
    ]);
    expect(grouped["vehicle-a"]).toBe(150);
    expect(grouped["project-b"]).toBe(25);

    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "logistics",
      role: "owner",
      user: "fleet_ops_costs",
    });
    const vehicleId = await owner.as.mutation(api.fleet.createVehicle, {
      name: "Cost Van",
      registrationNumber: "CST123",
      vehicleType: "van",
    });
    const projectId = await owner.as.mutation(api.fleet.createProject, {
      name: "Cost Project",
      budget: 1000,
    });
    await owner.as.mutation(api.fleet.createCostEntry, {
      category: "maintenance",
      amount: 250,
      vehicleId,
      projectId,
    });
    await owner.as.mutation(api.fleet.createCostEntry, {
      category: "fuel",
      amount: 75,
      vehicleId,
      projectId,
    });
    const exported = await owner.as.query(api.fleet.exportData, {});
    expect(
      exported.costs
        .filter((c) => c.vehicleId === vehicleId)
        .reduce((sum, c) => sum + c.amount, 0),
    ).toBe(325);
    expect(
      exported.costs
        .filter((c) => c.projectId === projectId)
        .reduce((sum, c) => sum + c.amount, 0),
    ).toBe(325);
  });
});

describe("fleet operations: security", () => {
  test("records are scoped to the active organisation", async () => {
    const t = convexTest(schema, modules);
    const orgA = await seedOrg(t, {
      kind: "logistics",
      role: "owner",
      user: "fleet_scope_a",
    });
    const orgB = await seedOrg(t, {
      kind: "logistics",
      role: "owner",
      user: "fleet_scope_b",
    });
    const vehicleId = await orgA.as.mutation(api.fleet.createVehicle, {
      name: "Scoped Van",
      registrationNumber: "SCP123",
      vehicleType: "van",
    });
    await expect(
      orgB.as.query(api.fleet.getVehicle, { vehicleId }),
    ).rejects.toThrow(/not found/i);
  });

  test("players cannot manage fleet operations", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "logistics",
      role: "owner",
      user: "fleet_perm_owner",
    });
    const player = await seedOrgMember(t, owner.orgId, {
      role: "player",
      user: "fleet_perm_player",
    });
    await expect(
      player.as.mutation(api.fleet.createVehicle, {
        name: "Nope",
        registrationNumber: "NOPE",
        vehicleType: "van",
      }),
    ).rejects.toThrow(/permission|Missing/i);
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
