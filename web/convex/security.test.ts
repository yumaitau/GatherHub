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
