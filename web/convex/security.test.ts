import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { Role } from "./lib/auth";

// Vite-style module discovery for convex-test.
const modules = import.meta.glob("./**/*.ts");

/** Seed an org + user + membership and return an authed test client. */
async function seedOrg(
  t: ReturnType<typeof convexTest>,
  opts: { clerkOrg: string; clerkUser: string; role: Role },
) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: opts.clerkUser,
      email: `${opts.clerkUser}@example.test`,
    });
    const orgId = await ctx.db.insert("organizations", {
      name: opts.clerkOrg,
      slug: opts.clerkOrg,
      createdBy: userId,
    });
    await ctx.db.insert("memberships", {
      orgId,
      userId,
      role: opts.role,
    });
    await ctx.db.patch(userId, { activeOrgId: orgId });
    return { orgId, userId };
  });
  const as = t.withIdentity({ subject: opts.clerkUser });
  return { ...ids, as };
}

describe("organisation isolation", () => {
  test("a member created in org A is invisible to org B", async () => {
    const t = convexTest(schema, modules);
    const a = await seedOrg(t, {
      clerkOrg: "org_a",
      clerkUser: "user_a",
      role: "owner",
    });
    const b = await seedOrg(t, {
      clerkOrg: "org_b",
      clerkUser: "user_b",
      role: "owner",
    });

    const memberId = await a.as.mutation(api.members.create, {
      firstName: "Jordan",
      lastName: "Smith",
    });

    // Org A sees the member.
    const listA = await a.as.query(api.members.list, {});
    expect(listA).toHaveLength(1);

    // Org B sees nothing and cannot fetch the member by id.
    const listB = await b.as.query(api.members.list, {});
    expect(listB).toHaveLength(0);
    await expect(b.as.query(api.members.get, { memberId })).rejects.toThrow(
      /not found/i,
    );
  });
});

describe("role-based permissions", () => {
  test("a player cannot create members but a coach can", async () => {
    const t = convexTest(schema, modules);
    const player = await seedOrg(t, {
      clerkOrg: "org_c",
      clerkUser: "user_player",
      role: "player",
    });
    await expect(
      player.as.mutation(api.members.create, {
        firstName: "No",
        lastName: "Way",
      }),
    ).rejects.toThrow(/permission/i);

    const coach = t.withIdentity({ subject: "user_coach" });
    await t.run(async (ctx) => {
      const org = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", "org_c"))
        .unique();
      const userId = await ctx.db.insert("users", {
        clerkUserId: "user_coach",
        email: "coach@example.test",
        activeOrgId: org!._id,
      });
      await ctx.db.insert("memberships", {
        orgId: org!._id,
        userId,
        role: "coach",
      });
    });
    const id = await coach.mutation(api.members.create, {
      firstName: "Sam",
      lastName: "Coach",
    });
    expect(id).toBeDefined();
  });

  test("anonymous callers are rejected", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.members.list, {})).rejects.toThrow();
  });
});

describe("organisation lifecycle (Convex-native)", () => {
  test("signed-in user with no active org gets no_active_org", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkUserId: "user_lonely",
        email: "lonely@example.test",
      });
    });
    const as = t.withIdentity({ subject: "user_lonely" });
    await expect(as.query(api.members.list, {})).rejects.toThrow(
      /no_active_org|Select or create/i,
    );
  });

  test("create + joinByCode + setActive + leave round-trip", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkUserId: "user_owner",
        email: "owner@example.test",
      });
      await ctx.db.insert("users", {
        clerkUserId: "user_joiner",
        email: "joiner@example.test",
      });
    });
    const owner = t.withIdentity({ subject: "user_owner" });
    const joiner = t.withIdentity({ subject: "user_joiner" });

    const { orgId } = await owner.mutation(api.organizations.create, {
      name: "Test FC",
    });
    // Owner can read their own club immediately (active org was set).
    const ctx1 = await owner.query(api.sync.currentContext);
    expect(ctx1?.org.id).toBe(orgId);
    expect(ctx1?.role).toBe("owner");

    // Rotate invite code, then have a second user join.
    const { code } = await owner.mutation(
      api.organizations.rotateInviteCode,
      {},
    );
    await joiner.mutation(api.organizations.joinByCode, { code });
    const ctx2 = await joiner.query(api.sync.currentContext);
    expect(ctx2?.org.id).toBe(orgId);
    expect(ctx2?.role).toBe("player");

    // Bad codes are rejected.
    await expect(
      joiner.mutation(api.organizations.joinByCode, { code: "ZZZZZZZZZZ" }),
    ).rejects.toThrow(/Invalid invite code/i);

    // The last owner cannot leave their only-owner club.
    await expect(
      owner.mutation(api.organizations.leave, { orgId }),
    ).rejects.toThrow(/last owner/i);

    // Joiner leaves cleanly; their active org clears.
    await joiner.mutation(api.organizations.leave, { orgId });
    expect(await joiner.query(api.sync.currentContext)).toBeNull();
  });

  test("setActive denies switching to a club the user is not in", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkUserId: "user_a",
        email: "a@example.test",
      });
      await ctx.db.insert("users", {
        clerkUserId: "user_b",
        email: "b@example.test",
      });
    });
    const a = t.withIdentity({ subject: "user_a" });
    const b = t.withIdentity({ subject: "user_b" });
    const { orgId } = await a.mutation(api.organizations.create, {
      name: "Private FC",
    });
    await expect(
      b.mutation(api.organizations.setActive, { orgId }),
    ).rejects.toThrow(/Not a member/i);
  });
});

describe("asset operations & audit log", () => {
  test("create → check out → check in writes an immutable audit trail", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_kit",
      clerkUser: "user_admin",
      role: "admin",
    });

    const memberId = await club.as.mutation(api.members.create, {
      firstName: "Pat",
      lastName: "Custodian",
    });

    const assetId = await club.as.mutation(api.assets.create, {
      name: "Match Ball Bag",
      category: "kit_bag",
    });

    // Creation logged + a QR tag minted.
    let detail = await club.as.query(api.assets.get, { assetId });
    expect(detail.asset.status).toBe("available");
    expect(detail.asset.qrTagId).toBeTruthy();
    expect(detail.tags).toHaveLength(1);

    // Check out.
    await club.as.mutation(api.assetOps.checkOut, {
      assetId,
      custodianMemberId: memberId,
      location: "Coach's car",
    });
    detail = await club.as.query(api.assets.get, { assetId });
    expect(detail.asset.status).toBe("checked_out");
    expect(detail.asset.custodianMemberId).toBe(memberId);

    // Check in.
    await club.as.mutation(api.assetOps.checkIn, { assetId });
    detail = await club.as.query(api.assets.get, { assetId });
    expect(detail.asset.status).toBe("available");
    expect(detail.asset.custodianMemberId).toBeUndefined();

    // Audit trail contains created → checked_out → checked_in, newest first.
    const history = await club.as.query(api.assets.history, { assetId });
    const actions = history.map((h) => h.action);
    expect(actions).toContain("created");
    expect(actions).toContain("checked_out");
    expect(actions).toContain("checked_in");
    expect(history.length).toBeGreaterThanOrEqual(3);
  });

  test("public tag lookup never leaks private data", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_pub",
      clerkUser: "user_pub",
      role: "admin",
    });
    const assetId = await club.as.mutation(api.assets.create, {
      name: "Clubhouse Key",
      category: "key",
      serialNumber: "SECRET-123",
    });
    const detail = await club.as.query(api.assets.get, { assetId });
    const tagId = detail.asset.qrTagId!;

    // Unauthenticated public lookup.
    const pub = await t.query(api.tags.lookupPublic, { tagId });
    expect(pub.found).toBe(true);
    if (pub.found) {
      expect(pub.assetName).toBe("Clubhouse Key");
      // No serial number, custodian, or value exposed.
      expect(JSON.stringify(pub)).not.toContain("SECRET-123");
      expect(pub).not.toHaveProperty("serialNumber");
      expect(pub).not.toHaveProperty("custodianMemberId");
    }
  });
});
