import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { Role } from "./lib/auth";
import {
  canTransition,
  detectDiscrepancies,
  DEFAULT_WASTE_CONFIG,
  parseWasteConfig,
} from "./lib/wasteLogic";

const modules = import.meta.glob("./**/*.ts");

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
      name: "Waste Co",
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

async function seedMember(
  t: ReturnType<typeof convexTest>,
  orgId: Id<"organizations">,
  opts: { role: Role; user: string },
) {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: opts.user,
      email: `${opts.user}@example.test`,
      firstName: opts.user,
    });
    await ctx.db.insert("memberships", { orgId, userId, role: opts.role });
    await ctx.db.patch(userId, { activeOrgId: orgId });
  });
  return { as: t.withIdentity({ subject: opts.user }) };
}

/** Seed a stream and the three party roles via the public mutations. */
async function seedWaste(owner: Awaited<ReturnType<typeof seedOrg>>) {
  const streamId = (await owner.as.mutation(api.waste.upsertStream, {
    name: "General waste",
    classification: "general",
    hazardous: false,
    defaultUnit: "kg",
  })) as Id<"wasteStreams">;
  const consignorId = (await owner.as.mutation(api.waste.upsertParty, {
    name: "Acme Site",
    consignor: true,
    transporter: false,
    receiver: false,
  })) as Id<"wasteParties">;
  const transporterId = (await owner.as.mutation(api.waste.upsertParty, {
    name: "Haul Co",
    consignor: false,
    transporter: true,
    receiver: false,
  })) as Id<"wasteParties">;
  const receiverId = (await owner.as.mutation(api.waste.upsertParty, {
    name: "Tip Facility",
    consignor: false,
    transporter: false,
    receiver: true,
  })) as Id<"wasteParties">;
  return { streamId, consignorId, transporterId, receiverId };
}

describe("waste: pure logic", () => {
  test("canTransition enforces the lifecycle", () => {
    expect(canTransition("scheduled", "picked_up")).toBe(true);
    expect(canTransition("picked_up", "arrived")).toBe(true);
    expect(canTransition("arrived", "accepted")).toBe(true);
    expect(canTransition("accepted", "processed")).toBe(true);
    expect(canTransition("arrived", "rejected")).toBe(true);
    expect(canTransition("rejected", "redirected")).toBe(true);
    // Illegal: skipping or rewinding.
    expect(canTransition("scheduled", "arrived")).toBe(false);
    expect(canTransition("processed", "accepted")).toBe(false);
    expect(canTransition("cancelled", "picked_up")).toBe(false);
  });

  test("detectDiscrepancies finds each failure mode", () => {
    const base = {
      status: "arrived" as const,
      plannedReceiverPartyId: "p1" as Id<"wasteParties">,
      manifestNumber: "M-1",
    };
    // Quantity mismatch beyond tolerance.
    expect(
      detectDiscrepancies(
        { ...base, pickupAmount: 1000, arrivalAmount: 700 },
        DEFAULT_WASTE_CONFIG,
      ),
    ).toContain("quantity_mismatch");
    // Within tolerance → no flag.
    expect(
      detectDiscrepancies(
        { ...base, pickupAmount: 1000, arrivalAmount: 950 },
        DEFAULT_WASTE_CONFIG,
      ),
    ).not.toContain("quantity_mismatch");
    // Missing document once arrived.
    expect(
      detectDiscrepancies(
        { ...base, manifestNumber: undefined },
        DEFAULT_WASTE_CONFIG,
      ),
    ).toContain("missing_document");
    // Late delivery.
    expect(
      detectDiscrepancies(
        {
          ...base,
          scheduledArrivalAt: 1000,
          arrivedAt: 1000 + 1000 * 60 * 60 * 1000,
        },
        DEFAULT_WASTE_CONFIG,
      ),
    ).toContain("late_delivery");
    // Wrong party.
    expect(
      detectDiscrepancies(
        { ...base, actualReceiverPartyId: "p2" as Id<"wasteParties"> },
        DEFAULT_WASTE_CONFIG,
      ),
    ).toContain("wrong_party");
    // Rejected load.
    expect(
      detectDiscrepancies(
        { ...base, status: "rejected" },
        DEFAULT_WASTE_CONFIG,
      ),
    ).toContain("rejected_load");
  });

  test("parseWasteConfig falls back to defaults on bad input", () => {
    expect(parseWasteConfig(undefined)).toEqual(DEFAULT_WASTE_CONFIG);
    expect(parseWasteConfig("not json")).toEqual(DEFAULT_WASTE_CONFIG);
    expect(
      parseWasteConfig('{"quantityTolerancePct":5}').quantityTolerancePct,
    ).toBe(5);
  });
});

describe("waste: lifecycle", () => {
  test("a load moves scheduled -> picked_up -> arrived -> accepted -> processed", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "waste_operator",
      role: "owner",
      user: "waste_owner",
    });
    const { streamId, consignorId, transporterId, receiverId } =
      await seedWaste(owner);

    const loadId = await owner.as.mutation(api.waste.createLoad, {
      reference: "L-001",
      streamId,
      consignorPartyId: consignorId,
      plannedReceiverPartyId: receiverId,
      transporterPartyId: transporterId,
      manifestNumber: "TC-001",
    });

    await owner.as.mutation(api.waste.recordPickup, {
      loadId,
      pickupAmount: 1000,
      pickupUnit: "kg",
    });
    await owner.as.mutation(api.waste.recordArrival, {
      loadId,
      arrivalAmount: 980,
      arrivalUnit: "kg",
    });
    await owner.as.mutation(api.waste.acceptLoad, { loadId });
    await owner.as.mutation(api.waste.processLoad, { loadId });

    const detail = await owner.as.query(api.waste.getLoad, { loadId });
    expect(detail.load.status).toBe("processed");
    expect(detail.load.hasDiscrepancy).toBe(false);
    // scheduled, picked_up, arrived, accepted, processed.
    const types = detail.events.map((e) => e.type);
    expect(types).toEqual([
      "scheduled",
      "picked_up",
      "arrived",
      "accepted",
      "processed",
    ]);
  });

  test("rejected load can be redirected", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "waste_operator",
      role: "owner",
      user: "waste_reject",
    });
    const { streamId, consignorId, receiverId } = await seedWaste(owner);
    const altReceiver = (await owner.as.mutation(api.waste.upsertParty, {
      name: "Backup Facility",
      consignor: false,
      transporter: false,
      receiver: true,
    })) as Id<"wasteParties">;

    const loadId = await owner.as.mutation(api.waste.createLoad, {
      reference: "L-002",
      streamId,
      consignorPartyId: consignorId,
      plannedReceiverPartyId: receiverId,
      manifestNumber: "TC-002",
    });
    await owner.as.mutation(api.waste.recordPickup, { loadId });
    await owner.as.mutation(api.waste.recordArrival, { loadId });
    await owner.as.mutation(api.waste.rejectLoad, {
      loadId,
      reason: "Contaminated load",
    });
    let detail = await owner.as.query(api.waste.getLoad, { loadId });
    expect(detail.load.status).toBe("rejected");
    expect(detail.load.discrepancyFlags).toContain("rejected_load");

    await owner.as.mutation(api.waste.redirectLoad, {
      loadId,
      redirectedToPartyId: altReceiver,
    });
    detail = await owner.as.query(api.waste.getLoad, { loadId });
    expect(detail.load.status).toBe("redirected");
    expect(detail.load.redirectedTo).toBe("Backup Facility");
  });

  test("illegal transition is rejected", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "waste_operator",
      role: "owner",
      user: "waste_illegal",
    });
    const { streamId, consignorId, receiverId } = await seedWaste(owner);
    const loadId = await owner.as.mutation(api.waste.createLoad, {
      reference: "L-003",
      streamId,
      consignorPartyId: consignorId,
      plannedReceiverPartyId: receiverId,
    });
    // Cannot accept a load that was never picked up / arrived.
    await expect(
      owner.as.mutation(api.waste.acceptLoad, { loadId }),
    ).rejects.toThrow(/cannot move/i);
  });
});

describe("waste: discrepancies", () => {
  test("quantity mismatch + missing document are flagged on arrival", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "waste_operator",
      role: "owner",
      user: "waste_disc",
    });
    const { streamId, consignorId, receiverId } = await seedWaste(owner);
    // No manifest number anywhere → missing_document once arrived.
    const loadId = await owner.as.mutation(api.waste.createLoad, {
      reference: "L-004",
      streamId,
      consignorPartyId: consignorId,
      plannedReceiverPartyId: receiverId,
    });
    await owner.as.mutation(api.waste.recordPickup, {
      loadId,
      pickupAmount: 1000,
      pickupUnit: "kg",
    });
    await owner.as.mutation(api.waste.recordArrival, {
      loadId,
      arrivalAmount: 600,
      arrivalUnit: "kg",
    });
    const detail = await owner.as.query(api.waste.getLoad, { loadId });
    expect(detail.load.hasDiscrepancy).toBe(true);
    expect(detail.load.discrepancyFlags).toEqual(
      expect.arrayContaining(["quantity_mismatch", "missing_document"]),
    );
    // A distinct immutable discrepancy event was appended.
    expect(detail.events.some((e) => e.type === "discrepancy_flagged")).toBe(
      true,
    );
  });

  test("wrong party flagged when actual receiver differs", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "waste_operator",
      role: "owner",
      user: "waste_wrong",
    });
    const { streamId, consignorId, receiverId } = await seedWaste(owner);
    const other = (await owner.as.mutation(api.waste.upsertParty, {
      name: "Other Facility",
      consignor: false,
      transporter: false,
      receiver: true,
    })) as Id<"wasteParties">;
    const loadId = await owner.as.mutation(api.waste.createLoad, {
      reference: "L-005",
      streamId,
      consignorPartyId: consignorId,
      plannedReceiverPartyId: receiverId,
      manifestNumber: "TC-005",
    });
    await owner.as.mutation(api.waste.recordPickup, { loadId });
    await owner.as.mutation(api.waste.recordArrival, {
      loadId,
      actualReceiverPartyId: other,
    });
    const detail = await owner.as.query(api.waste.getLoad, { loadId });
    expect(detail.load.discrepancyFlags).toContain("wrong_party");
  });

  test("resolveDiscrepancy clears the open flag", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "waste_operator",
      role: "owner",
      user: "waste_resolve",
    });
    const { streamId, consignorId, receiverId } = await seedWaste(owner);
    const loadId = await owner.as.mutation(api.waste.createLoad, {
      reference: "L-006",
      streamId,
      consignorPartyId: consignorId,
      plannedReceiverPartyId: receiverId,
    });
    await owner.as.mutation(api.waste.recordPickup, { loadId });
    await owner.as.mutation(api.waste.recordArrival, { loadId });
    await owner.as.mutation(api.waste.resolveDiscrepancy, {
      loadId,
      resolutionNotes: "Paperwork supplied later",
    });
    const detail = await owner.as.query(api.waste.getLoad, { loadId });
    expect(detail.load.hasDiscrepancy).toBe(false);
    expect(detail.load.discrepancyResolutionNotes).toBe(
      "Paperwork supplied later",
    );
  });
});

describe("waste: idempotency", () => {
  test("replaying a pickup with the same clientMutationId is a no-op", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "waste_operator",
      role: "owner",
      user: "waste_idem",
    });
    const { streamId, consignorId, receiverId } = await seedWaste(owner);
    const loadId = await owner.as.mutation(api.waste.createLoad, {
      reference: "L-007",
      streamId,
      consignorPartyId: consignorId,
      plannedReceiverPartyId: receiverId,
      manifestNumber: "TC-007",
    });
    const cmid = "pickup-007";
    const first = await owner.as.mutation(api.waste.recordPickup, {
      loadId,
      pickupAmount: 500,
      pickupUnit: "kg",
      clientMutationId: cmid,
    });
    const second = await owner.as.mutation(api.waste.recordPickup, {
      loadId,
      pickupAmount: 500,
      pickupUnit: "kg",
      clientMutationId: cmid,
    });
    expect(second).toBe(first);
    const detail = await owner.as.query(api.waste.getLoad, { loadId });
    // Exactly one picked_up event despite the retry.
    expect(detail.events.filter((e) => e.type === "picked_up")).toHaveLength(1);
    expect(detail.load.status).toBe("picked_up");
  });
});

describe("waste: access control", () => {
  test("waste module must be enabled (off for sports clubs)", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "sports_club",
      role: "owner",
      user: "waste_sports",
    });
    await expect(owner.as.query(api.waste.dashboard, {})).rejects.toThrow(
      /waste|module|disabled/i,
    );
  });

  test("operate role cannot dispatch but can record field events", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "waste_operator",
      role: "owner",
      user: "waste_mgr",
    });
    const { streamId, consignorId, receiverId } = await seedWaste(owner);
    const loadId = await owner.as.mutation(api.waste.createLoad, {
      reference: "L-008",
      streamId,
      consignorPartyId: consignorId,
      plannedReceiverPartyId: receiverId,
      manifestNumber: "TC-008",
    });

    const volunteer = await seedMember(t, owner.orgId, {
      role: "volunteer",
      user: "waste_driver",
    });
    // Volunteer has waste.operate but not waste.manage.
    await expect(
      volunteer.as.mutation(api.waste.createLoad, {
        reference: "L-009",
        streamId,
        consignorPartyId: consignorId,
        plannedReceiverPartyId: receiverId,
      }),
    ).rejects.toThrow(/permission|waste\.manage/i);
    // …but can record a pickup.
    await volunteer.as.mutation(api.waste.recordPickup, {
      loadId,
      pickupAmount: 200,
      pickupUnit: "kg",
    });
    const detail = await owner.as.query(api.waste.getLoad, { loadId });
    expect(detail.load.status).toBe("picked_up");
  });

  test("family role cannot read waste data", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      kind: "waste_operator",
      role: "owner",
      user: "waste_owner2",
    });
    const player = await seedMember(t, owner.orgId, {
      role: "player",
      user: "waste_player",
    });
    await expect(player.as.query(api.waste.dashboard, {})).rejects.toThrow(
      /permission|waste\.view/i,
    );
  });
});
