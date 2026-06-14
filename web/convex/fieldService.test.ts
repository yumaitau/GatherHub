import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { Role } from "./lib/auth";

const modules = import.meta.glob("./**/*.ts");

/** Seed a field-service org (module enabled) + an owner, return an authed client. */
async function seedFieldOrg(
  t: ReturnType<typeof convexTest>,
  opts: { clerkOrg: string; clerkUser: string; role: Role },
) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: opts.clerkUser,
      email: `${opts.clerkUser}@example.test`,
      firstName: opts.clerkUser,
    });
    const orgId = await ctx.db.insert("organizations", {
      name: opts.clerkOrg,
      slug: opts.clerkOrg,
      createdBy: userId,
      kind: "field_service",
    });
    await ctx.db.insert("memberships", { orgId, userId, role: opts.role });
    await ctx.db.patch(userId, { activeOrgId: orgId });
    await ctx.db.insert("organizationModules", {
      orgId,
      key: "field_service",
      enabled: true,
      updatedAt: Date.now(),
    });
    return { orgId, userId };
  });
  return { ...ids, as: t.withIdentity({ subject: opts.clerkUser }) };
}

/** Add a driver: custom role granting jobs.complete only (no dispatch). */
async function addDriver(
  t: ReturnType<typeof convexTest>,
  orgId: Awaited<ReturnType<typeof seedFieldOrg>>["orgId"],
  clerkUser: string,
) {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: clerkUser,
      email: `${clerkUser}@example.test`,
      firstName: clerkUser,
      activeOrgId: orgId,
    });
    await ctx.db.insert("organizationRoles", {
      orgId,
      key: "driver",
      displayName: "Driver",
      legacyRole: "volunteer",
      capabilities: ["jobs.complete", "mobile.offline_sync", "events.read"],
      active: true,
      order: 50,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("memberships", {
      orgId,
      userId,
      role: "volunteer",
      roleKey: "driver",
    });
    return userId;
  });
  return { userId, as: t.withIdentity({ subject: clerkUser }) };
}

describe("fieldService: organisation isolation", () => {
  test("a job in org A is invisible to org B", async () => {
    const t = convexTest(schema, modules);
    const a = await seedFieldOrg(t, {
      clerkOrg: "fs_a",
      clerkUser: "fs_owner_a",
      role: "owner",
    });
    const b = await seedFieldOrg(t, {
      clerkOrg: "fs_b",
      clerkUser: "fs_owner_b",
      role: "owner",
    });
    const jobId = await a.as.mutation(api.fieldService.createJob, {
      title: "Bin swap",
    });
    expect(await a.as.query(api.fieldService.dispatchBoard, {})).toHaveLength(
      1,
    );
    expect(await b.as.query(api.fieldService.dispatchBoard, {})).toHaveLength(
      0,
    );
    await expect(
      b.as.query(api.fieldService.getJob, { jobId }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("fieldService: dispatch + driver run", () => {
  test("a dispatcher builds an ordered route and the assigned driver sees it", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedFieldOrg(t, {
      clerkOrg: "fs_run",
      clerkUser: "fs_run_owner",
      role: "owner",
    });
    const driver = await addDriver(t, owner.orgId, "fs_run_driver");

    const jobA = await owner.as.mutation(api.fieldService.createJob, {
      title: "Stop A",
    });
    const jobB = await owner.as.mutation(api.fieldService.createJob, {
      title: "Stop B",
    });
    const routeId = await owner.as.mutation(api.fieldService.createRoute, {
      name: "Monday North",
      date: "2026-06-15",
    });
    // Order them B then A.
    await owner.as.mutation(api.fieldService.setRouteJobs, {
      routeId,
      jobIds: [jobB, jobA],
    });
    await owner.as.mutation(api.fieldService.assignRoute, {
      routeId,
      assignedUserId: driver.userId,
    });

    const runs = await driver.as.query(api.fieldService.myRuns, {});
    expect(runs).toHaveLength(1);
    expect(runs[0]!.stops.map((s) => s.title)).toEqual(["Stop B", "Stop A"]);
    expect(runs[0]!.stops[0]!.status).toBe("scheduled");
    expect(runs[0]!.stops[0]!.assignedUserId).toBe(driver.userId);
  });
});

describe("fieldService: offline completion is idempotent", () => {
  test("replaying a completion with the same key applies once", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedFieldOrg(t, {
      clerkOrg: "fs_idem",
      clerkUser: "fs_idem_owner",
      role: "owner",
    });
    const driver = await addDriver(t, owner.orgId, "fs_idem_driver");
    const jobId = await owner.as.mutation(api.fieldService.createJob, {
      title: "Deliver pallet",
    });

    await driver.as.mutation(api.fieldService.completeJob, {
      jobId,
      signatureName: "Jane Smith",
      notes: "Left at dock",
      clientMutationId: "offline-1",
    });
    // Same offline op replays after a flaky reconnect — must be a no-op.
    await driver.as.mutation(api.fieldService.completeJob, {
      jobId,
      signatureName: "Jane Smith",
      clientMutationId: "offline-1",
    });

    const job = await owner.as.query(api.fieldService.getJob, { jobId });
    expect(job!.status).toBe("completed");
    const completions = job!.history.filter((h) => h.action === "completed");
    expect(completions).toHaveLength(1);
    expect(completions[0]!.signatureName).toBe("Jane Smith");
  });
});

describe("fieldService: proof immutability + correction", () => {
  test("a completed job is read-only and amends only via audited correction", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedFieldOrg(t, {
      clerkOrg: "fs_imm",
      clerkUser: "fs_imm_owner",
      role: "owner",
    });
    const driver = await addDriver(t, owner.orgId, "fs_imm_driver");
    const jobId = await owner.as.mutation(api.fieldService.createJob, {
      title: "Service unit",
    });
    await driver.as.mutation(api.fieldService.completeJob, {
      jobId,
      signatureName: "Original Name",
    });

    // No second completion, and no edit, on a closed job.
    await expect(
      driver.as.mutation(api.fieldService.completeJob, {
        jobId,
        signatureName: "Sneaky",
        clientMutationId: "different-key",
      }),
    ).rejects.toThrow(/closed/i);
    await expect(
      owner.as.mutation(api.fieldService.updateJob, {
        jobId,
        title: "Renamed",
      }),
    ).rejects.toThrow(/read-only/i);

    // Correction appends a new row; the original completion is untouched.
    await owner.as.mutation(api.fieldService.correctJobCompletion, {
      jobId,
      reason: "Wrong signatory captured",
      signatureName: "Corrected Name",
    });

    const job = await owner.as.query(api.fieldService.getJob, { jobId });
    const completed = job!.history.find((h) => h.action === "completed")!;
    const corrected = job!.history.find((h) => h.action === "corrected")!;
    expect(completed.signatureName).toBe("Original Name");
    expect(corrected.signatureName).toBe("Corrected Name");
    expect(corrected.correctsEventId).toBe(completed._id);
  });
});

describe("fieldService: proof requirements + permissions", () => {
  test("config can require a signature; drivers cannot dispatch", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedFieldOrg(t, {
      clerkOrg: "fs_cfg",
      clerkUser: "fs_cfg_owner",
      role: "owner",
    });
    const driver = await addDriver(t, owner.orgId, "fs_cfg_driver");

    await owner.as.mutation(api.fieldService.updateConfig, {
      requireSignature: true,
    });
    const jobId = await owner.as.mutation(api.fieldService.createJob, {
      title: "Signed delivery",
    });
    await expect(
      driver.as.mutation(api.fieldService.completeJob, { jobId }),
    ).rejects.toThrow(/signature/i);
    await driver.as.mutation(api.fieldService.completeJob, {
      jobId,
      signatureName: "Recipient",
    });

    // A driver (jobs.complete only) cannot create/dispatch jobs.
    await expect(
      driver.as.mutation(api.fieldService.createJob, { title: "Nope" }),
    ).rejects.toThrow(/permission|jobs\.dispatch/i);
  });
});
