import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
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

describe("R2 image uploads", () => {
  function withR2Env(fn: () => Promise<void>) {
    const previous = {
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
      R2_BUCKET: process.env.R2_BUCKET,
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
      R2_ENDPOINT: process.env.R2_ENDPOINT,
    };
    process.env.R2_ACCOUNT_ID = "test-account";
    process.env.R2_BUCKET = "gatherhub-test";
    process.env.R2_ACCESS_KEY_ID = "test-access-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
    delete process.env.R2_ENDPOINT;
    return fn().finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
  }

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function safePathSegmentForTest(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96);
  }

  test("issued upload URLs use org-scoped canonical R2 keys", async () => {
    await withR2Env(async () => {
      const t = convexTest(schema, modules);
      const club = await seedOrg(t, {
        clerkOrg: "org_r2_paths",
        clerkUser: "user_r2_paths",
        role: "owner",
      });
      const sponsorId = await club.as.mutation(api.sponsors.create, {
        name: "Path Sponsor",
      });

      const upload = await club.as.mutation(api.files.generateUploadUrl, {
        ownerType: "sponsors",
        ownerId: sponsorId,
        purpose: "logo",
        fileName: "Main Logo.PNG",
        contentType: "image/png",
        size: 1234,
      });

      expect(upload.storageId).toMatch(
        new RegExp(
          `^orgs/${escapeRegExp(club.orgId)}/sponsors/${safePathSegmentForTest(sponsorId)}/logo/[a-f0-9-]+-main-logo\\.png$`,
        ),
      );
      expect(upload.uploadUrl).toContain("X-Amz-Signature=");
      expect(upload.headers).toMatchObject({
        "content-type": "image/png",
        "x-amz-meta-declared-size": "1234",
      });

      const row = await t.run(async (ctx) => {
        return await ctx.db
          .query("uploadedFiles")
          .withIndex("by_storage", (q) => q.eq("storageId", upload.storageId))
          .first();
      });
      expect(row).toMatchObject({
        orgId: club.orgId,
        ownerType: "sponsors",
        ownerId: sponsorId,
        purpose: "logo",
        contentType: "image/png",
        size: 1234,
      });
    });
  });

  test("HTTP upload URL helper issues scoped R2 keys from Clerk identity", async () => {
    await withR2Env(async () => {
      const t = convexTest(schema, modules);
      const club = await seedOrg(t, {
        clerkOrg: "org_r2_http_paths",
        clerkUser: "user_r2_http_paths",
        role: "owner",
      });
      const sponsorId = await club.as.mutation(api.sponsors.create, {
        name: "HTTP Path Sponsor",
      });

      const upload = await t.mutation(internal.files.generateUploadUrlForHttp, {
        clerkUserId: "user_r2_http_paths",
        ownerType: "sponsors",
        ownerId: sponsorId,
        purpose: "logo",
        fileName: "HTTP Logo.PNG",
        contentType: "image/png",
        size: 2048,
      });

      expect(upload.storageId).toMatch(
        new RegExp(
          `^orgs/${escapeRegExp(club.orgId)}/sponsors/${safePathSegmentForTest(sponsorId)}/logo/[a-f0-9-]+-http-logo\\.png$`,
        ),
      );
      const row = await t.run(async (ctx) => {
        return await ctx.db
          .query("uploadedFiles")
          .withIndex("by_storage", (q) => q.eq("storageId", upload.storageId))
          .first();
      });
      expect(row).toMatchObject({
        orgId: club.orgId,
        uploadedBy: club.userId,
        ownerType: "sponsors",
        ownerId: sponsorId,
        purpose: "logo",
        contentType: "image/png",
        size: 2048,
      });
    });
  });

  test("an org cannot attach another org's R2 key", async () => {
    const t = convexTest(schema, modules);
    const a = await seedOrg(t, {
      clerkOrg: "org_r2_a",
      clerkUser: "user_r2_a",
      role: "owner",
    });
    const b = await seedOrg(t, {
      clerkOrg: "org_r2_b",
      clerkUser: "user_r2_b",
      role: "owner",
    });
    const sponsorA = await a.as.mutation(api.sponsors.create, {
      name: "A Sponsor",
    });
    const sponsorB = await b.as.mutation(api.sponsors.create, {
      name: "B Sponsor",
    });
    const key = `orgs/${a.orgId}/sponsors/${sponsorA}/logo/logo.png`;
    await t.run(async (ctx) => {
      await ctx.db.insert("uploadedFiles", {
        orgId: a.orgId,
        storageId: key,
        path: key,
        ownerType: "sponsors",
        ownerId: sponsorA,
        purpose: "logo",
        fileName: "logo.png",
        contentType: "image/png",
        size: 100,
        uploadedBy: a.userId,
        verifiedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      b.as.mutation(api.sponsors.update, {
        sponsorId: sponsorB,
        logoStorageId: key,
        logoFileName: "logo.png",
      }),
    ).rejects.toThrow(/organisation/i);
  });

  test("attach rejects invalid declared R2 image metadata", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_r2_validation",
      clerkUser: "user_r2_validation",
      role: "owner",
    });
    const sponsorId = await club.as.mutation(api.sponsors.create, {
      name: "Validation Sponsor",
    });
    const key = `orgs/${club.orgId}/sponsors/${sponsorId}/logo/logo.txt`;
    await t.run(async (ctx) => {
      await ctx.db.insert("uploadedFiles", {
        orgId: club.orgId,
        storageId: key,
        path: key,
        ownerType: "sponsors",
        ownerId: sponsorId,
        purpose: "logo",
        fileName: "logo.txt",
        contentType: "text/plain",
        size: 100,
        uploadedBy: club.userId,
        verifiedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      club.as.mutation(api.sponsors.update, {
        sponsorId,
        logoStorageId: key,
        logoFileName: "logo.txt",
      }),
    ).rejects.toThrow(/png, jpeg, webp, or gif/i);
  });

  test("attach rejects R2 keys before upload completion verifies the object", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_r2_unverified",
      clerkUser: "user_r2_unverified",
      role: "owner",
    });
    const sponsorId = await club.as.mutation(api.sponsors.create, {
      name: "Unverified Sponsor",
    });
    const key = `orgs/${club.orgId}/sponsors/${sponsorId}/logo/logo.png`;
    await t.run(async (ctx) => {
      await ctx.db.insert("uploadedFiles", {
        orgId: club.orgId,
        storageId: key,
        path: key,
        ownerType: "sponsors",
        ownerId: sponsorId,
        purpose: "logo",
        fileName: "logo.png",
        contentType: "image/png",
        size: 100,
        uploadedBy: club.userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      club.as.mutation(api.sponsors.update, {
        sponsorId,
        logoStorageId: key,
        logoFileName: "logo.png",
      }),
    ).rejects.toThrow(/not been verified/i);
  });

  test("upload completion HEAD-verifies R2 before attachment", async () => {
    await withR2Env(async () => {
      const t = convexTest(schema, modules);
      const club = await seedOrg(t, {
        clerkOrg: "org_r2_complete",
        clerkUser: "user_r2_complete",
        role: "owner",
      });
      const sponsorId = await club.as.mutation(api.sponsors.create, {
        name: "Complete Sponsor",
      });
      const upload = await club.as.mutation(api.files.generateUploadUrl, {
        ownerType: "sponsors",
        ownerId: sponsorId,
        purpose: "logo",
        fileName: "logo.png",
        contentType: "image/png",
        size: 100,
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (_url, init) => {
        expect(init?.method).toBe("HEAD");
        return new Response(null, {
          status: 200,
          headers: {
            "content-length": "100",
            "content-type": "image/png",
          },
        });
      }) as typeof fetch;
      try {
        await club.as.action(api.files.completeUpload, {
          storageId: upload.storageId,
        });
      } finally {
        globalThis.fetch = originalFetch;
      }

      await club.as.mutation(api.sponsors.update, {
        sponsorId,
        logoStorageId: upload.storageId,
        logoFileName: "logo.png",
      });
      const row = await t.run(async (ctx) => {
        return await ctx.db
          .query("uploadedFiles")
          .withIndex("by_storage", (q) => q.eq("storageId", upload.storageId))
          .first();
      });
      expect(row?.verifiedAt).toEqual(expect.any(Number));
      expect(row?.attachedAt).toEqual(expect.any(Number));
    });
  });

  test("upload URL issuance requires the matching owner and purpose permission", async () => {
    await withR2Env(async () => {
      const t = convexTest(schema, modules);
      const owner = await seedOrg(t, {
        clerkOrg: "org_r2_cap_owner",
        clerkUser: "user_r2_cap_owner",
        role: "owner",
      });
      await expect(
        owner.as.mutation(api.files.generateUploadUrl, {
          ownerType: "sponsors",
          ownerId: "sponsor-id",
          purpose: "coverImage",
          fileName: "bad.png",
          contentType: "image/png",
          size: 100,
        }),
      ).rejects.toThrow(/unsupported upload destination/i);

      const coach = await seedOrg(t, {
        clerkOrg: "org_r2_cap_coach",
        clerkUser: "user_r2_cap_coach",
        role: "coach",
      });
      await expect(
        coach.as.mutation(api.files.generateUploadUrl, {
          ownerType: "sponsors",
          ownerId: "sponsor-id",
          purpose: "logo",
          fileName: "logo.png",
          contentType: "image/png",
          size: 100,
        }),
      ).rejects.toThrow(/sponsors\.manage|permission/i);
    });
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

  test("committee can manage formerly admin-only workspace objects", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_committee_crud",
      clerkUser: "user_committee_crud",
      role: "committee",
    });

    await club.as.mutation(api.organizations.updateLocationSettings, {
      defaultAddress: "Committee Clubhouse",
    });
    await expect(
      club.as.mutation(api.organizations.rotateInviteCode, {}),
    ).resolves.toHaveProperty("code");
    await club.as.mutation(api.publicSite.upsertSettings, {
      enabled: true,
      tagline: "Committee managed.",
    });
    expect(await club.as.query(api.publicSite.getSettings, {})).toMatchObject({
      enabled: true,
    });
    await club.as.mutation(api.qrSettings.upsert, {
      fgColor: "#111111",
      bgColor: "#ffffff",
      dotStyle: "square",
      cornerSquareStyle: "square",
      margin: 4,
      logoSize: "medium",
      borderEnabled: false,
      borderColor: "#111111",
      borderWidth: 1,
      borderRadius: 4,
    });
    await club.as.mutation(api.soccer.setSoccerMode, { enabled: true });

    const memberId = await club.as.mutation(api.members.create, {
      firstName: "Committee",
      lastName: "Delete",
    });
    await club.as.mutation(api.members.remove, { memberId });
    expect(await club.as.query(api.members.list, {})).toHaveLength(0);

    const teamId = await club.as.mutation(api.teams.create, {
      name: "Committee Team",
    });
    await club.as.mutation(api.teams.remove, { teamId });
    expect(
      await club.as.query(api.teams.list, { includeInactive: true }),
    ).toHaveLength(0);

    const assetId = await club.as.mutation(api.assets.create, {
      name: "Committee Asset",
      category: "equipment",
    });
    await club.as.mutation(api.assets.remove, { assetId });
    expect(await club.as.query(api.assets.list, {})).toHaveLength(0);

    const sponsorId = await club.as.mutation(api.sponsors.create, {
      name: "Committee Sponsor",
    });
    await club.as.mutation(api.sponsors.remove, { sponsorId });
    expect(await club.as.query(api.sponsors.list, {})).toHaveLength(0);

    const targetMembershipId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "user_role_target",
        email: "role-target@example.test",
        activeOrgId: club.orgId,
      });
      return await ctx.db.insert("memberships", {
        orgId: club.orgId,
        userId,
        role: "player",
      });
    });
    await club.as.mutation(api.roles.updateRole, {
      membershipId: targetMembershipId,
      role: "volunteer",
    });
    const memberships = await club.as.query(api.roles.listMembers, {});
    expect(
      memberships.find((row) => row.membershipId === targetMembershipId)?.role,
    ).toBe("volunteer");
  });

  test("parent and player roles cannot use committee object mutations", async () => {
    const t = convexTest(schema, modules);
    const parent = await seedOrg(t, {
      clerkOrg: "org_parent_blocked",
      clerkUser: "user_parent_blocked",
      role: "parent",
    });
    const player = await seedOrg(t, {
      clerkOrg: "org_player_blocked",
      clerkUser: "user_player_blocked",
      role: "player",
    });

    await expect(
      parent.as.mutation(api.sponsors.create, { name: "Parent Sponsor" }),
    ).rejects.toThrow(/permission/i);
    await expect(
      player.as.mutation(api.publicSite.upsertSettings, { enabled: true }),
    ).rejects.toThrow(/permission/i);
    await expect(
      player.as.mutation(api.organizations.rotateInviteCode, {}),
    ).rejects.toThrow(/permission/i);
  });

  test("training certifications are generic member records", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_training_certs",
      clerkUser: "user_training_certs",
      role: "committee",
    });
    const memberId = await club.as.mutation(api.members.create, {
      firstName: "Taylor",
      lastName: "Qualified",
      email: "taylor@example.test",
    });

    const certId = await club.as.mutation(api.certifications.create, {
      memberId,
      name: "Forklift licence",
      issuer: "SafeWork",
      issuedDate: "2026-01-01",
      expiryDate: "2026-12-31",
    });
    const memberDetail = await club.as.query(api.members.get, { memberId });
    expect(memberDetail.member.isVolunteer).toBe(false);

    await club.as.mutation(api.certifications.update, {
      certId,
      name: "Forklift licence updated",
      expiryDate: null,
    });
    const certs = await club.as.query(api.certifications.list, {});
    const cert = certs.find((row) => row.cert._id === certId);
    expect(cert?.member?._id).toBe(memberId);
    expect(cert?.cert.name).toBe("Forklift licence updated");
    expect(cert?.cert.expiryDate ?? null).toBeNull();

    await club.as.mutation(api.certifications.remove, { certId });
    expect(await club.as.query(api.certifications.list, {})).toHaveLength(0);
  });

  test("committee can manage tasks and overdue reminder queueing", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_task_board",
      clerkUser: "user_task_board",
      role: "committee",
    });
    const assigneeMemberId = await club.as.mutation(api.members.create, {
      firstName: "Ari",
      lastName: "Assignee",
      email: "ari@example.test",
    });
    const playerMemberId = await club.as.mutation(api.members.create, {
      firstName: "Pat",
      lastName: "Player",
      clubRole: "player",
    });
    const parentMemberId = await club.as.mutation(api.members.create, {
      firstName: "Penny",
      lastName: "Parent",
      clubRole: "parent",
    });
    const linkedParentMemberId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "user_task_parent",
        email: "linked-parent@example.test",
        activeOrgId: club.orgId,
      });
      await ctx.db.insert("memberships", {
        orgId: club.orgId,
        userId,
        role: "parent",
      });
      return await ctx.db.insert("members", {
        orgId: club.orgId,
        userId,
        firstName: "Linked",
        lastName: "Parent",
        status: "active",
        isVolunteer: false,
      });
    });
    const yesterday = new Date(Date.now() - 86_400_000)
      .toISOString()
      .slice(0, 10);

    const listedMembers = await club.as.query(api.members.list, {});
    expect(
      listedMembers.find((member) => member._id === linkedParentMemberId)
        ?.membershipRole,
    ).toBe("parent");
    await expect(
      club.as.mutation(api.tasks.create, {
        title: "Do not assign to player",
        assigneeMemberId: playerMemberId,
      }),
    ).rejects.toThrow(/parents or players/i);
    await expect(
      club.as.mutation(api.tasks.create, {
        title: "Do not assign to parent",
        assigneeMemberId: parentMemberId,
      }),
    ).rejects.toThrow(/parents or players/i);
    await expect(
      club.as.mutation(api.tasks.create, {
        title: "Do not assign to linked parent",
        assigneeMemberId: linkedParentMemberId,
      }),
    ).rejects.toThrow(/parents or players/i);

    const taskId = await club.as.mutation(api.tasks.create, {
      title: "Submit venue risk assessment",
      assigneeMemberId,
      dueDate: yesterday,
    });
    let tasks = await club.as.query(api.tasks.list, {});
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.reminderEnabled).toBe(true);
    expect(tasks[0]?.reminderEveryDays).toBe(3);
    expect(tasks[0]?.assignee?._id).toBe(assigneeMemberId);

    await expect(
      club.as.mutation(api.tasks.update, {
        taskId,
        assigneeMemberId: playerMemberId,
      }),
    ).rejects.toThrow(/parents or players/i);

    await club.as.mutation(api.tasks.move, {
      taskId,
      status: "in_progress",
    });
    tasks = await club.as.query(api.tasks.list, {});
    expect(tasks[0]?.status).toBe("in_progress");

    const firstQueue = await t.mutation(internal.tasks.queueDueReminders, {});
    expect(firstQueue.queued).toBe(1);
    const queuedAfterFirst = await t.run(async (ctx) => {
      return await ctx.db
        .query("taskReminderEmails")
        .withIndex("by_task", (q) => q.eq("taskId", taskId))
        .collect();
    });
    expect(queuedAfterFirst).toHaveLength(1);
    expect(queuedAfterFirst[0]?.email).toBe("ari@example.test");

    const secondQueue = await t.mutation(internal.tasks.queueDueReminders, {});
    expect(secondQueue.queued).toBe(0);

    await club.as.mutation(api.tasks.move, { taskId, status: "done" });
    const thirdQueue = await t.mutation(internal.tasks.queueDueReminders, {});
    expect(thirdQueue.queued).toBe(0);

    await club.as.mutation(api.tasks.remove, { taskId });
    expect(await club.as.query(api.tasks.list, {})).toHaveLength(0);
  });

  test("organisation profiles expose defaults and gate disabled module writes", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_vertical_defaults",
      clerkUser: "user_vertical_defaults",
      role: "committee",
    });

    const context = await club.as.query(api.sync.currentContext, {});
    expect(context?.org.kind).toBe("sports_club");
    expect(
      context?.org.modules.some((m) => m.key === "tasks" && m.enabled),
    ).toBe(true);

    await club.as.mutation(api.organizations.setModule, {
      key: "tasks",
      enabled: false,
    });
    await expect(
      club.as.mutation(api.tasks.create, { title: "Blocked task" }),
    ).rejects.toThrow(/module.*disabled|disabled/i);

    await club.as.mutation(api.organizations.setModule, {
      key: "tasks",
      enabled: true,
    });
    const taskId = await club.as.mutation(api.tasks.create, {
      title: "Allowed task",
    });
    expect(taskId).toBeDefined();
  });

  test("configured capabilities drive access without trusting legacy role rank", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      clerkOrg: "org_custom_roles",
      clerkUser: "user_custom_role_owner",
      role: "owner",
    });

    await owner.as.mutation(api.roles.upsertConfigured, {
      key: "field_supervisor",
      displayName: "Field supervisor",
      description: "Can manage field tasks without committee rank.",
      legacyRole: "volunteer",
      capabilities: ["tasks.manage", "members.read", "mobile.offline_sync"],
      active: true,
    });

    const targetMembershipId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "user_custom_field_supervisor",
        email: "field-supervisor@example.test",
        activeOrgId: owner.orgId,
      });
      return await ctx.db.insert("memberships", {
        orgId: owner.orgId,
        userId,
        role: "volunteer",
      });
    });

    await owner.as.mutation(api.roles.updateRole, {
      membershipId: targetMembershipId,
      role: "volunteer",
      roleKey: "field_supervisor",
    });

    const fieldSupervisor = t.withIdentity({
      subject: "user_custom_field_supervisor",
    });
    const context = await fieldSupervisor.query(api.sync.currentContext, {});
    expect(context?.role).toBe("volunteer");
    expect(context?.roleKey).toBe("field_supervisor");
    expect(context?.capabilities).toContain("tasks.manage");

    const taskId = await fieldSupervisor.mutation(api.tasks.create, {
      title: "Queue field setup",
    });
    expect(taskId).toBeDefined();
  });

  test("configured role management remains owner-scoped and org-scoped", async () => {
    const t = convexTest(schema, modules);
    const ownerA = await seedOrg(t, {
      clerkOrg: "org_role_scope_a",
      clerkUser: "user_role_scope_owner_a",
      role: "owner",
    });
    const committeeB = await seedOrg(t, {
      clerkOrg: "org_role_scope_b",
      clerkUser: "user_role_scope_committee_b",
      role: "committee",
    });

    await expect(
      committeeB.as.mutation(api.roles.upsertConfigured, {
        key: "self_granted_admin",
        displayName: "Self granted admin",
        legacyRole: "admin",
        capabilities: ["settings.admin"],
        active: true,
      }),
    ).rejects.toThrow(/permission|requires owner/i);

    await ownerA.as.mutation(api.roles.upsertConfigured, {
      key: "org_a_only",
      displayName: "Org A only",
      legacyRole: "volunteer",
      capabilities: ["tasks.manage"],
      active: true,
    });

    const targetMembershipId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "user_role_scope_target_b",
        email: "scope-target@example.test",
        activeOrgId: committeeB.orgId,
      });
      return await ctx.db.insert("memberships", {
        orgId: committeeB.orgId,
        userId,
        role: "player",
      });
    });

    await expect(
      committeeB.as.mutation(api.roles.updateRole, {
        membershipId: targetMembershipId,
        role: "volunteer",
        roleKey: "org_a_only",
      }),
    ).rejects.toThrow(/configured/i);

    await expect(
      committeeB.as.mutation(api.roles.updateRole, {
        membershipId: targetMembershipId,
        role: "owner",
      }),
    ).rejects.toThrow(/owner/i);
  });

  test("new organisations can choose a non-sport vertical template", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkUserId: "user_waste_owner",
        email: "waste-owner@example.test",
      });
    });
    const owner = t.withIdentity({ subject: "user_waste_owner" });

    await owner.mutation(api.organizations.create, {
      name: "Northside Waste",
      kind: "waste_operator",
      templateKey: "waste_operator",
    });
    const context = await owner.query(api.sync.currentContext, {});
    expect(context?.org.kind).toBe("waste_operator");
    expect(context?.org.terminology.eventSingular).toBe("job");
    expect(context?.org.terminology.assetPlural).toBe("vehicles and bins");
    expect(
      context?.org.modules.some((m) => m.key === "waste" && m.enabled),
    ).toBe(true);
    expect(
      context?.org.modules.some((m) => m.key === "soccer" && m.enabled),
    ).toBe(false);
  });

  test("sport templates expose sport packs without enabling soccer storage", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkUserId: "user_rugby_owner",
        email: "rugby-owner@example.test",
      });
    });
    const owner = t.withIdentity({ subject: "user_rugby_owner" });

    await owner.mutation(api.organizations.create, {
      name: "Harbour Rugby",
      kind: "sports_club",
      templateKey: "rugby_union_club",
      sportKey: "rugby_union",
    });

    const context = await owner.query(api.sync.currentContext, {});
    expect(context?.org.kind).toBe("sports_club");
    expect(context?.org.templateKey).toBe("rugby_union_club");
    expect(context?.org.sportKey).toBe("rugby_union");
    expect(context?.org.soccerMode).toBe(false);
    expect(context?.org.terminology.sportSingular).toBe("rugby union");
    expect(
      context?.org.modules.some((m) => m.key === "sport" && m.enabled),
    ).toBe(true);
    expect(
      context?.org.modules.some((m) => m.key === "soccer" && m.enabled),
    ).toBe(false);

    const seasons = await owner.query(api.fixtures.listSeasons, {});
    const competitions = await owner.query(api.fixtures.listCompetitions, {});
    const divisions = await owner.query(api.fixtures.listDivisions, {});
    expect(seasons[0]?.name).toMatch(/\d{4} season/);
    expect(competitions.map((row) => row.name)).toContain("Junior rugby");
    expect(divisions.map((row) => row.name)).toContain("Junior");
  });

  test("multi-sport fixtures are CRUDable, scoped, and capability checked", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkUserId: "user_fixture_owner",
        email: "fixture-owner@example.test",
      });
      await ctx.db.insert("users", {
        clerkUserId: "user_fixture_other",
        email: "fixture-other@example.test",
      });
      await ctx.db.insert("users", {
        clerkUserId: "user_fixture_parent",
        email: "fixture-parent@example.test",
      });
    });
    const owner = t.withIdentity({ subject: "user_fixture_owner" });
    const other = t.withIdentity({ subject: "user_fixture_other" });

    const { orgId } = await owner.mutation(api.organizations.create, {
      name: "Rugby Fixtures",
      kind: "sports_club",
      templateKey: "rugby_union_club",
      sportKey: "rugby_union",
    });
    await other.mutation(api.organizations.create, {
      name: "Other Fixtures",
      kind: "sports_club",
      templateKey: "cricket_club",
      sportKey: "cricket",
    });
    await t.run(async (ctx) => {
      const parent = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) =>
          q.eq("clerkUserId", "user_fixture_parent"),
        )
        .unique();
      await ctx.db.patch(parent!._id, { activeOrgId: orgId });
      await ctx.db.insert("memberships", {
        orgId,
        userId: parent!._id,
        role: "parent",
      });
    });
    const parent = t.withIdentity({ subject: "user_fixture_parent" });

    const [season] = await owner.query(api.fixtures.listSeasons, {});
    const [competition] = await owner.query(api.fixtures.listCompetitions, {});
    const [division] = await owner.query(api.fixtures.listDivisions, {});
    const venueId = await owner.mutation(api.fixtures.upsertVenue, {
      name: "Main field",
      fieldName: "Field 1",
    });
    const homeTeamId = await owner.mutation(api.teams.create, {
      name: "First XV",
    });
    const awayTeamId = await owner.mutation(api.teams.create, {
      name: "Harbour Away",
    });

    const fixtureId = await owner.mutation(api.fixtures.upsertFixture, {
      title: "Round 1",
      seasonId: season!._id,
      competitionId: competition!._id,
      divisionId: division!._id,
      venueId,
      startTime: Date.now() + 86_400_000,
      status: "scheduled",
    });
    await owner.mutation(api.fixtures.upsertFixtureTeam, {
      fixtureId,
      side: "home",
      teamId: homeTeamId,
      order: 1,
    });
    await owner.mutation(api.fixtures.upsertFixtureTeam, {
      fixtureId,
      side: "away",
      teamId: awayTeamId,
      order: 2,
    });

    const detail = await owner.query(api.fixtures.getFixture, { fixtureId });
    const homeRow = detail.teams.find((row) => row.side === "home");
    await owner.mutation(api.fixtures.upsertFixtureTeam, {
      id: homeRow!._id,
      fixtureId,
      side: "home",
      teamId: null,
      displayName: "First XV external",
      order: 1,
    });
    const edited = await owner.query(api.fixtures.getFixture, { fixtureId });
    expect(edited.teams.filter((row) => row.side === "home")).toHaveLength(1);
    expect(edited.venueName).toBe("Main field");

    const filtered = await owner.query(api.fixtures.listFixtures, {
      teamId: awayTeamId,
      status: "scheduled",
    });
    expect(filtered.map((row) => row._id)).toContain(fixtureId);

    await owner.mutation(api.fixtures.upsertStanding, {
      seasonId: season!._id,
      teamId: homeTeamId,
      played: 1,
      wins: 1,
      pointsFor: 24,
      pointsAgainst: 12,
      points: 4,
      rank: 1,
    });
    const standings = await owner.query(api.fixtures.listStandings, {
      seasonId: season!._id,
    });
    expect(standings[0]).toMatchObject({ teamName: "First XV", points: 4 });

    await expect(
      other.query(api.fixtures.getFixture, { fixtureId }),
    ).rejects.toThrow(/not found/i);
    await expect(
      parent.mutation(api.fixtures.upsertFixture, {
        title: "Parent write",
        startTime: Date.now(),
      }),
    ).rejects.toThrow(/permission/i);

    await owner.mutation(api.fixtures.removeFixture, { fixtureId });
    const afterDelete = await owner.query(api.fixtures.listFixtures, {});
    expect(afterDelete.map((row) => row._id)).not.toContain(fixtureId);
  });

  test("match squads validate sport positions and isolate participation", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkUserId: "user_roster_owner",
        email: "roster-owner@example.test",
      });
      await ctx.db.insert("users", {
        clerkUserId: "user_roster_other",
        email: "roster-other@example.test",
      });
      await ctx.db.insert("users", {
        clerkUserId: "user_roster_parent",
        email: "roster-parent@example.test",
      });
    });
    const owner = t.withIdentity({ subject: "user_roster_owner" });
    const other = t.withIdentity({ subject: "user_roster_other" });

    const { orgId } = await owner.mutation(api.organizations.create, {
      name: "Roster Rugby",
      kind: "sports_club",
      templateKey: "rugby_union_club",
      sportKey: "rugby_union",
    });
    await other.mutation(api.organizations.create, {
      name: "Roster Cricket",
      kind: "sports_club",
      templateKey: "cricket_club",
      sportKey: "cricket",
    });
    await t.run(async (ctx) => {
      const parent = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) =>
          q.eq("clerkUserId", "user_roster_parent"),
        )
        .unique();
      await ctx.db.patch(parent!._id, { activeOrgId: orgId });
      await ctx.db.insert("memberships", {
        orgId,
        userId: parent!._id,
        role: "parent",
      });
    });
    const parent = t.withIdentity({ subject: "user_roster_parent" });

    const templates = await owner.query(api.matchRosters.templates, {});
    expect(Object.keys(templates)).toEqual(
      expect.arrayContaining([
        "soccer",
        "rugby_league",
        "rugby_union",
        "cricket",
        "hockey",
        "netball",
        "basketball",
      ]),
    );
    expect(templates.rugby_union.onFieldPlayers).toBe(15);
    expect(templates.netball.positions.map((row) => row.key)).toContain("gs");

    const teamId = await owner.mutation(api.teams.create, {
      name: "First XV",
    });
    const playerA = await owner.mutation(api.members.create, {
      firstName: "Alex",
      lastName: "Prop",
    });
    const playerB = await owner.mutation(api.members.create, {
      firstName: "Blair",
      lastName: "Lock",
    });
    await owner.mutation(api.teams.assignMember, {
      teamId,
      memberId: playerA,
      role: "player",
    });
    await owner.mutation(api.teams.assignMember, {
      teamId,
      memberId: playerB,
      role: "player",
    });

    const fixtureId = await owner.mutation(api.fixtures.upsertFixture, {
      title: "Roster Round 1",
      startTime: Date.now() + 86_400_000,
      status: "scheduled",
    });
    await owner.mutation(api.fixtures.upsertFixtureTeam, {
      fixtureId,
      teamId,
      side: "home",
    });
    const squadId = await owner.mutation(api.matchRosters.seedFromTeam, {
      fixtureId,
      teamId,
    });
    const [squad] = await owner.query(api.matchRosters.listForFixture, {
      fixtureId,
    });
    expect(squad?.members).toHaveLength(2);
    expect(squad?.template.positions.map((row) => row.key)).toContain("lock");

    const squadMember = squad!.members.find((row) => row.memberId === playerB)!;
    await owner.mutation(api.matchRosters.updateParticipation, {
      squadMemberId: squadMember._id,
      participationStatus: "arrived",
      positionKey: "lock",
      jerseyNumber: "4",
      isCaptain: true,
    });
    const [updated] = await owner.query(api.matchRosters.listMatchDay, {
      fixtureId,
    });
    const updatedMember = updated!.members.find(
      (row) => row.memberId === playerB,
    );
    expect(updatedMember).toMatchObject({
      positionKey: "lock",
      positionLabel: "Lock",
      jerseyNumber: "4",
      participationStatus: "arrived",
      isCaptain: true,
    });
    expect(updated!.events[0]).toMatchObject({ eventType: "position_change" });

    await expect(
      owner.mutation(api.matchRosters.updateParticipation, {
        squadMemberId: squadMember._id,
        positionKey: "goal_attack",
      }),
    ).rejects.toThrow(/not valid/i);
    await expect(
      other.query(api.matchRosters.listForFixture, { fixtureId }),
    ).rejects.toThrow(/not found/i);
    await expect(
      parent.mutation(api.matchRosters.seedFromTeam, {
        fixtureId,
        teamId,
      }),
    ).rejects.toThrow(/permission/i);

    await owner.mutation(api.matchRosters.removeSquadMember, {
      squadMemberId: squadMember._id,
    });
    const [afterRemove] = await owner.query(api.matchRosters.listMatchDay, {
      fixtureId,
    });
    expect(afterRemove!.members.map((row) => row.memberId)).not.toContain(
      playerB,
    );
    expect(squadId).toBeDefined();
  });

  test("legacy soccerMode organisations resolve to the soccer sport pack", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_legacy_soccer_pack",
      clerkUser: "user_legacy_soccer_pack",
      role: "owner",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(club.orgId, { soccerMode: true });
    });

    const context = await club.as.query(api.sync.currentContext, {});
    expect(context?.org.sportKey).toBe("soccer");
    expect(context?.org.terminology.sportSingular).toBe("soccer");
    expect(
      context?.org.modules.some((m) => m.key === "soccer" && m.enabled),
    ).toBe(true);
  });

  test("missing legacy organisation profile rows are migratable", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_legacy_profile",
      clerkUser: "user_legacy_profile",
      role: "owner",
    });

    const before = await t.run(async (ctx) => await ctx.db.get(club.orgId));
    expect(before?.kind).toBeUndefined();

    const result = await t.mutation(
      internal.organizations.migrateMissingProfiles,
      {},
    );
    expect(result.migrated).toBeGreaterThan(0);

    const after = await t.run(async (ctx) => {
      const org = await ctx.db.get(club.orgId);
      const modules = await ctx.db
        .query("organizationModules")
        .withIndex("by_org", (q) => q.eq("orgId", club.orgId))
        .collect();
      return { org, modules };
    });
    expect(after.org?.kind).toBe("sports_club");
    expect(after.modules.some((m) => m.key === "people" && m.enabled)).toBe(
      true,
    );
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
  test("admin location defaults are used by asset and event writes", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_defaults",
      clerkUser: "user_location_admin",
      role: "admin",
    });
    const defaultAddress = "1 Clubhouse Lane, Sydney NSW";

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "user_location_player",
        email: "player@example.test",
        activeOrgId: club.orgId,
      });
      await ctx.db.insert("memberships", {
        orgId: club.orgId,
        userId,
        role: "player",
      });
    });
    const player = t.withIdentity({ subject: "user_location_player" });

    await club.as.mutation(api.organizations.updateLocationSettings, {
      defaultAddress: `  ${defaultAddress}  `,
    });
    await expect(
      player.mutation(api.organizations.updateLocationSettings, {
        defaultAddress: "Player House",
      }),
    ).rejects.toThrow(/permission/i);
    await expect(
      player.query(api.organizations.locationDefaults, {}),
    ).resolves.toEqual({ defaultAddress });

    const assetId = await club.as.mutation(api.assets.create, {
      name: "Defaulted Asset",
      category: "equipment",
    });
    const assetDetail = await club.as.query(api.assets.get, { assetId });
    expect(assetDetail.asset.location).toBe(defaultAddress);

    const eventId = await club.as.mutation(api.events.create, {
      type: "training",
      title: "Defaulted Training",
      startTime: Date.now(),
    });
    const eventDetail = await club.as.query(api.events.get, { eventId });
    expect(eventDetail.event.location).toBe(defaultAddress);
  });

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
      category: "equipment",
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

  test("asset creation can bind a scanned NFC tag while minting QR", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_nfc_create",
      clerkUser: "user_nfc_admin",
      role: "admin",
    });

    const nfcTagId = "04AABBCCDDEE";
    const assetId = await club.as.mutation(api.assets.create, {
      name: "Scanned Training Bibs",
      category: "equipment",
      nfcTagId,
    });

    const detail = await club.as.query(api.assets.get, { assetId });
    expect(detail.asset.qrTagId).toBeTruthy();
    expect(detail.asset.nfcTagId).toBe(nfcTagId);
    expect(detail.tags.map((t) => t.type).sort()).toEqual(["nfc", "qr"]);

    const lookup = await club.as.query(api.tags.lookupAuthed, {
      tagId: nfcTagId,
    });
    expect(lookup.found).toBe(true);
    expect(lookup.asset?.name).toBe("Scanned Training Bibs");

    await expect(
      club.as.mutation(api.assets.create, {
        name: "Duplicate NFC",
        category: "equipment",
        nfcTagId,
      }),
    ).rejects.toThrow(/not available/i);
  });

  test("mobile client mutation ids make queued retries idempotent", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_mobile_retry",
      clerkUser: "user_mobile_retry_admin",
      role: "admin",
    });

    const memberId = await club.as.mutation(api.members.create, {
      firstName: "Retry",
      lastName: "Coach",
    });
    const nfcTagId = "04RETRY0001";
    const firstAssetId = await club.as.mutation(api.assets.create, {
      name: "Retry Bibs",
      category: "equipment",
      nfcTagId,
      clientMutationId: "mobile-create-1",
    });
    const secondAssetId = await club.as.mutation(api.assets.create, {
      name: "Retry Bibs",
      category: "equipment",
      nfcTagId,
      clientMutationId: "mobile-create-1",
    });
    expect(secondAssetId).toBe(firstAssetId);

    await club.as.mutation(api.assetOps.checkOut, {
      assetId: firstAssetId,
      custodianMemberId: memberId,
      clientMutationId: "mobile-checkout-1",
    });
    await club.as.mutation(api.assetOps.checkOut, {
      assetId: firstAssetId,
      custodianMemberId: memberId,
      clientMutationId: "mobile-checkout-1",
    });

    await club.as.mutation(api.assetOps.recordScan, {
      assetId: firstAssetId,
      clientMutationId: "mobile-scan-1",
    });
    await club.as.mutation(api.assetOps.recordScan, {
      assetId: firstAssetId,
      clientMutationId: "mobile-scan-1",
    });

    const history = await club.as.query(api.assets.history, {
      assetId: firstAssetId,
    });
    expect(history.filter((h) => h.action === "created")).toHaveLength(1);
    expect(history.filter((h) => h.action === "checked_out")).toHaveLength(1);
    expect(history.filter((h) => h.action === "scanned")).toHaveLength(1);
  });

  test("every native queued mutation is idempotent on retry", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_mobile_all_retry",
      clerkUser: "user_mobile_all_retry_admin",
      role: "admin",
    });

    await club.as.mutation(api.soccer.setSoccerMode, { enabled: true });
    const memberId = await club.as.mutation(api.members.create, {
      firstName: "All",
      lastName: "Retry",
      email: "all-retry@example.test",
    });
    const eventId = await club.as.mutation(api.events.create, {
      type: "training",
      title: "Retry Training",
      startTime: Date.now(),
    });
    const announcementId = await club.as.mutation(api.announcements.create, {
      title: "Retry Notice",
      body: "Read once.",
    });
    const assetId = await club.as.mutation(api.assets.create, {
      name: "Retry Cones",
      category: "equipment",
      clientMutationId: "mobile-all-create-1",
    });
    const duplicateAssetId = await club.as.mutation(api.assets.create, {
      name: "Retry Cones Duplicate",
      category: "equipment",
      clientMutationId: "mobile-all-create-1",
    });
    expect(duplicateAssetId).toBe(assetId);

    await club.as.mutation(api.events.setRsvp, {
      eventId,
      memberId,
      status: "going",
      clientMutationId: "mobile-rsvp-1",
    });
    await club.as.mutation(api.events.setRsvp, {
      eventId,
      memberId,
      status: "not_going",
      clientMutationId: "mobile-rsvp-1",
    });

    await club.as.mutation(api.announcements.markRead, {
      announcementId,
      clientMutationId: "mobile-announcement-1",
    });
    await club.as.mutation(api.announcements.markRead, {
      announcementId,
      clientMutationId: "mobile-announcement-1",
    });

    await club.as.mutation(api.assetOps.checkOut, {
      assetId,
      custodianMemberId: memberId,
      clientMutationId: "mobile-all-checkout-1",
    });
    await club.as.mutation(api.assetOps.checkOut, {
      assetId,
      custodianMemberId: memberId,
      clientMutationId: "mobile-all-checkout-1",
    });
    await club.as.mutation(api.assetOps.checkIn, {
      assetId,
      clientMutationId: "mobile-checkin-1",
    });
    await club.as.mutation(api.assetOps.checkIn, {
      assetId,
      clientMutationId: "mobile-checkin-1",
    });
    await club.as.mutation(api.assets.registerNfc, {
      assetId,
      nfcTagId: "04ALLRETRY01",
      clientMutationId: "mobile-register-nfc-1",
    });
    await club.as.mutation(api.assetOps.recordScan, {
      assetId,
      clientMutationId: "mobile-all-scan-1",
    });
    await club.as.mutation(api.assetOps.recordScan, {
      assetId,
      clientMutationId: "mobile-all-scan-1",
    });
    await club.as.mutation(api.assets.registerNfc, {
      assetId,
      nfcTagId: "04ALLRETRY01",
      clientMutationId: "mobile-register-nfc-1",
    });

    await club.as.mutation(api.organizations.updateLocationSettings, {
      defaultAddress: "First Clubhouse",
      clientMutationId: "mobile-org-address-1",
    });
    await club.as.mutation(api.organizations.updateLocationSettings, {
      defaultAddress: "Second Clubhouse",
      clientMutationId: "mobile-org-address-1",
    });

    const teamId = await club.as.mutation(api.teams.create, {
      name: "Retry U10",
    });
    const [division] = await club.as.query(api.soccer.listDivisions, {});
    if (!division) throw new Error("Expected soccer mode to seed divisions.");
    await club.as.mutation(api.soccer.upsertRegistration, {
      memberId,
      teamId,
      divisionId: division._id,
      kitColour: "Home",
      clientMutationId: "mobile-assignment-1",
    });
    await club.as.mutation(api.soccer.upsertRegistration, {
      memberId,
      clearTeam: true,
      clearDivision: true,
      kitColour: "Away",
      clientMutationId: "mobile-assignment-1",
    });

    const [skill] = await club.as.query(api.soccer.listSkills, {});
    if (!skill) throw new Error("Expected soccer mode to seed skills.");
    await club.as.mutation(api.soccer.upsertEvaluation, {
      memberId,
      skillId: skill._id,
      score: 4,
      clientMutationId: "mobile-evaluation-1",
    });
    await club.as.mutation(api.soccer.upsertEvaluation, {
      memberId,
      skillId: skill._id,
      score: 8,
      clientMutationId: "mobile-evaluation-1",
    });

    const counts = await t.run(async (ctx) => {
      const rsvps = await ctx.db
        .query("rsvps")
        .withIndex("by_event_and_member", (q) =>
          q.eq("eventId", eventId).eq("memberId", memberId),
        )
        .collect();
      const reads = await ctx.db
        .query("announcementReads")
        .withIndex("by_announcement_and_user", (q) =>
          q.eq("announcementId", announcementId).eq("userId", club.userId),
        )
        .collect();
      const clientMutations = await ctx.db
        .query("clientMutations")
        .withIndex("by_org", (q) => q.eq("orgId", club.orgId))
        .collect();
      return { rsvps, reads, clientMutations };
    });
    expect(counts.rsvps).toHaveLength(1);
    const [rsvp] = counts.rsvps;
    if (!rsvp) throw new Error("Expected exactly one RSVP.");
    expect(rsvp.status).toBe("going");
    expect(counts.reads).toHaveLength(1);
    expect(counts.clientMutations).toHaveLength(10);

    const history = await club.as.query(api.assets.history, { assetId });
    expect(history.filter((h) => h.action === "created")).toHaveLength(1);
    expect(history.filter((h) => h.action === "checked_out")).toHaveLength(1);
    expect(history.filter((h) => h.action === "checked_in")).toHaveLength(1);
    expect(history.filter((h) => h.action === "scanned")).toHaveLength(1);
    expect(history.filter((h) => h.action === "tag_registered")).toHaveLength(
      1,
    );

    const defaults = await club.as.query(
      api.organizations.locationDefaults,
      {},
    );
    expect(defaults.defaultAddress).toBe("First Clubhouse");

    const registration = await club.as.query(api.soccer.getRegistration, {
      memberId,
    });
    expect(registration?.teamId).toBe(teamId);
    expect(registration?.divisionId).toBe(division._id);
    expect(registration?.kitColour).toBe("Home");

    const grade = await club.as.query(api.soccer.playerGrade, { memberId });
    expect(grade.evaluations).toHaveLength(1);
    const [evaluation] = grade.evaluations;
    if (!evaluation) throw new Error("Expected exactly one evaluation.");
    expect(evaluation.score).toBe(4);
  });

  test("offline CRUD mutations are idempotent and clear optional fields", async () => {
    const t = convexTest(schema, modules);
    const club = await seedOrg(t, {
      clerkOrg: "org_mobile_crud_retry",
      clerkUser: "user_mobile_crud_retry_admin",
      role: "admin",
    });

    await club.as.mutation(api.soccer.setSoccerMode, { enabled: true });

    const memberId = await club.as.mutation(api.members.create, {
      firstName: "Offline",
      lastName: "Member",
      email: "offline-member@example.test",
      phone: "0400000000",
      dateOfBirth: "2012-01-02",
      notes: "Captured on field",
      isVolunteer: true,
      clientMutationId: "crud-member-create-1",
    });
    const replayedMemberId = await club.as.mutation(api.members.create, {
      firstName: "Duplicate",
      lastName: "Member",
      clientMutationId: "crud-member-create-1",
    });
    expect(replayedMemberId).toBe(memberId);

    await club.as.mutation(api.members.update, {
      memberId,
      email: null,
      phone: null,
      dateOfBirth: null,
      notes: null,
      clubRole: null,
      clientMutationId: "crud-member-clear-1",
    });
    await club.as.mutation(api.members.update, {
      memberId,
      email: "ignored@example.test",
      phone: "ignored",
      notes: "ignored",
      clientMutationId: "crud-member-clear-1",
    });
    const memberDetail = await club.as.query(api.members.get, { memberId });
    expect(memberDetail.member.email ?? null).toBeNull();
    expect(memberDetail.member.phone ?? null).toBeNull();
    expect(memberDetail.member.dateOfBirth ?? null).toBeNull();
    expect(memberDetail.member.notes ?? null).toBeNull();

    const ageGroupId = await club.as.mutation(api.taxonomies.create, {
      kind: "team_age_group",
      label: "U21",
      clientMutationId: "crud-age-create-1",
    });
    const replayedAgeGroupId = await club.as.mutation(api.taxonomies.create, {
      kind: "team_age_group",
      label: "U21 duplicate",
      clientMutationId: "crud-age-create-1",
    });
    expect(replayedAgeGroupId).toBe(ageGroupId);
    await club.as.mutation(api.taxonomies.update, {
      id: ageGroupId,
      label: "U22",
      clientMutationId: "crud-age-update-1",
    });
    await club.as.mutation(api.taxonomies.update, {
      id: ageGroupId,
      label: "Ignored",
      clientMutationId: "crud-age-update-1",
    });
    await club.as.mutation(api.taxonomies.setActive, {
      id: ageGroupId,
      active: false,
      clientMutationId: "crud-age-active-1",
    });
    await club.as.mutation(api.taxonomies.setActive, {
      id: ageGroupId,
      active: true,
      clientMutationId: "crud-age-active-1",
    });
    const ageGroups = await club.as.query(api.taxonomies.list, {
      kind: "team_age_group",
      includeInactive: true,
    });
    const editedAgeGroup = ageGroups.find((row) => row.id === ageGroupId);
    expect(editedAgeGroup?.label).toBe("U22");
    expect(editedAgeGroup?.active).toBe(false);

    const divisionId = await club.as.mutation(api.soccer.upsertDivision, {
      name: "Offline Division",
      minGrade: 0,
      maxGrade: 50,
      color: "#111111",
      active: true,
      clientMutationId: "crud-division-create-1",
    });
    const replayedDivisionId = await club.as.mutation(
      api.soccer.upsertDivision,
      {
        name: "Duplicate Division",
        minGrade: 51,
        maxGrade: 100,
        color: "#222222",
        active: false,
        clientMutationId: "crud-division-create-1",
      },
    );
    expect(replayedDivisionId).toBe(divisionId);
    if (!divisionId) throw new Error("Expected division id.");

    await club.as.mutation(api.soccer.upsertDivision, {
      id: divisionId,
      name: "Offline Division Updated",
      minGrade: 5,
      maxGrade: 55,
      color: "#333333",
      active: false,
      clientMutationId: "crud-division-update-1",
    });
    await club.as.mutation(api.soccer.upsertDivision, {
      id: divisionId,
      name: "Ignored Division",
      minGrade: 10,
      maxGrade: 20,
      color: "#444444",
      active: true,
      clientMutationId: "crud-division-update-1",
    });
    const divisions = await club.as.query(api.soccer.listDivisions, {});
    const editedDivision = divisions.find((row) => row._id === divisionId);
    expect(editedDivision?.name).toBe("Offline Division Updated");
    expect(editedDivision?.minGrade).toBe(5);
    expect(editedDivision?.maxGrade).toBe(55);
    expect(editedDivision?.color).toBe("#333333");
    expect(editedDivision?.active).toBe(false);

    const competitionId = await club.as.mutation(api.soccer.upsertCompetition, {
      name: "Offline Competition",
      season: "2026",
      active: true,
      clientMutationId: "crud-competition-create-1",
    });
    const replayedCompetitionId = await club.as.mutation(
      api.soccer.upsertCompetition,
      {
        name: "Duplicate Competition",
        season: "2027",
        active: false,
        clientMutationId: "crud-competition-create-1",
      },
    );
    expect(replayedCompetitionId).toBe(competitionId);
    if (!competitionId) throw new Error("Expected competition id.");

    await club.as.mutation(api.soccer.upsertCompetition, {
      id: competitionId,
      name: "Offline Competition Updated",
      season: null,
      active: false,
      clientMutationId: "crud-competition-update-1",
    });
    await club.as.mutation(api.soccer.upsertCompetition, {
      id: competitionId,
      name: "Ignored Competition",
      season: "Ignored",
      active: true,
      clientMutationId: "crud-competition-update-1",
    });
    const competitions = await club.as.query(api.soccer.listCompetitions, {});
    const editedCompetition = competitions.find(
      (row) => row._id === competitionId,
    );
    expect(editedCompetition?.name).toBe("Offline Competition Updated");
    expect(editedCompetition?.season ?? null).toBeNull();
    expect(editedCompetition?.active).toBe(false);

    const teamId = await club.as.mutation(api.teams.create, {
      name: "Offline Team",
      ageGroup: "u22",
      season: "2026",
      description: "Field capture",
      kitColour: "Red",
      kitBagNumber: "12",
      divisionId,
      coach: "Casey Coach",
      manager: "Morgan Manager",
      teamRegistered: true,
      teamRegisteredDate: "2026-02-01",
      teamRegistrationPaid: true,
      clientMutationId: "crud-team-create-1",
    });
    const replayedTeamId = await club.as.mutation(api.teams.create, {
      name: "Duplicate Team",
      clientMutationId: "crud-team-create-1",
    });
    expect(replayedTeamId).toBe(teamId);
    await club.as.mutation(api.teams.update, {
      teamId,
      ageGroup: null,
      season: null,
      description: null,
      kitColour: null,
      kitBagNumber: null,
      divisionId: null,
      coach: null,
      manager: null,
      teamRegisteredDate: null,
      clientMutationId: "crud-team-clear-1",
    });
    await club.as.mutation(api.teams.update, {
      teamId,
      ageGroup: "ignored",
      kitColour: "ignored",
      clientMutationId: "crud-team-clear-1",
    });
    const teams = await club.as.query(api.teams.list, {
      includeInactive: true,
    });
    const team = teams.find((row) => row._id === teamId);
    expect(team?.ageGroup ?? null).toBeNull();
    expect(team?.season ?? null).toBeNull();
    expect(team?.description ?? null).toBeNull();
    expect(team?.kitColour ?? null).toBeNull();
    expect(team?.kitBagNumber ?? null).toBeNull();
    expect(team?.divisionId ?? null).toBeNull();
    expect(team?.coach ?? null).toBeNull();
    expect(team?.manager ?? null).toBeNull();
    expect(team?.teamRegisteredDate ?? null).toBeNull();

    const fieldPlayerId = await club.as.mutation(
      api.soccer.createFieldRegistration,
      {
        firstName: "Pitch",
        lastName: "Player",
        email: "pitch-player@example.test",
        guardianFirstName: "Pat",
        guardianLastName: "Parent",
        guardianRelationship: "Guardian",
        emergencyName: "Emergency Contact",
        emergencyPhone: "0499999999",
        teamId,
        registered: true,
        paid: false,
        paymentPlan: true,
        paymentPlanStart: "2026-03-01",
        paymentPlanEnd: "2026-08-01",
        comments: "Captured beside field",
        kitColour: "Blue",
        clientMutationId: "crud-field-registration-1",
      },
    );
    const replayedFieldPlayerId = await club.as.mutation(
      api.soccer.createFieldRegistration,
      {
        firstName: "Duplicate",
        lastName: "Player",
        clientMutationId: "crud-field-registration-1",
      },
    );
    expect(replayedFieldPlayerId).toBe(fieldPlayerId);

    await club.as.mutation(api.soccer.upsertRegistration, {
      memberId: fieldPlayerId,
      ffaNumber: null,
      schoolName: null,
      paymentPlanStart: null,
      paymentPlanEnd: null,
      comments: null,
      kitColour: null,
      clientMutationId: "crud-registration-clear-1",
    });
    await club.as.mutation(api.soccer.upsertRegistration, {
      memberId: fieldPlayerId,
      comments: "ignored",
      kitColour: "ignored",
      clientMutationId: "crud-registration-clear-1",
    });

    const fieldRegistration = await club.as.query(api.soccer.getRegistration, {
      memberId: fieldPlayerId,
    });
    expect(fieldRegistration?.comments ?? null).toBeNull();
    expect(fieldRegistration?.kitColour ?? null).toBeNull();
    expect(fieldRegistration?.paymentPlanStart ?? null).toBeNull();
    expect(fieldRegistration?.paymentPlanEnd ?? null).toBeNull();

    const counts = await t.run(async (ctx) => {
      const players = await ctx.db
        .query("members")
        .withIndex("by_org", (q) => q.eq("orgId", club.orgId))
        .collect();
      const guardians = await ctx.db
        .query("guardians")
        .withIndex("by_member", (q) => q.eq("memberId", fieldPlayerId))
        .collect();
      const emergencyContacts = await ctx.db
        .query("emergencyContacts")
        .withIndex("by_member", (q) => q.eq("memberId", fieldPlayerId))
        .collect();
      return { players, guardians, emergencyContacts };
    });
    expect(
      counts.players.filter((row) => row.firstName === "Pitch"),
    ).toHaveLength(1);
    expect(counts.guardians).toHaveLength(1);
    expect(counts.emergencyContacts).toHaveLength(1);
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
