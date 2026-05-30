import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireOrgMember,
  requireRole,
  assertSameOrg,
  canViewRestricted,
} from "./lib/auth";
import { memberStatusValidator } from "./schema";

/** List members in the caller's organisation. */
export const list = query({
  args: {
    status: v.optional(memberStatusValidator),
    search: v.optional(v.string()),
    lifetimeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);

    const rows = args.status
      ? await ctx.db
          .query("members")
          .withIndex("by_org_and_status", (q) =>
            q.eq("orgId", auth.org._id).eq("status", args.status!),
          )
          .collect()
      : await ctx.db
          .query("members")
          .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
          .collect();

    const search = args.search?.trim().toLowerCase();
    let filtered = search
      ? rows.filter((m) =>
          `${m.firstName} ${m.lastName} ${m.email ?? ""}`
            .toLowerCase()
            .includes(search),
        )
      : rows;
    if (args.lifetimeOnly) {
      filtered = filtered.filter((m) => m.isLifetimeMember);
    }

    return filtered.sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(
        `${b.lastName} ${b.firstName}`,
      ),
    );
  },
});

export const setLifetimeMember = mutation({
  args: {
    memberId: v.id("members"),
    isLifetimeMember: v.boolean(),
    lifetimeMemberSince: v.optional(v.string()),
    lifetimeMemberNotes: v.optional(v.string()),
    lifetimeMemberFirstAddedToClub: v.optional(v.string()),
    lifetimeMemberAddedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
    if (!member) return;
    await ctx.db.patch(args.memberId, {
      isLifetimeMember: args.isLifetimeMember,
      lifetimeMemberSince: args.isLifetimeMember
        ? (args.lifetimeMemberSince ?? member.lifetimeMemberSince)
        : undefined,
      lifetimeMemberNotes: args.isLifetimeMember
        ? (args.lifetimeMemberNotes ?? member.lifetimeMemberNotes)
        : undefined,
      lifetimeMemberFirstAddedToClub: args.isLifetimeMember
        ? (args.lifetimeMemberFirstAddedToClub ??
          member.lifetimeMemberFirstAddedToClub)
        : undefined,
      lifetimeMemberAddedBy: args.isLifetimeMember
        ? (args.lifetimeMemberAddedBy ?? member.lifetimeMemberAddedBy)
        : undefined,
    });
  },
});

/** Full member detail incl. relations. Medical notes gated by role. */
export const get = query({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
    if (!member) throw new Error("Not found.");

    const [guardianLinks, dependents, emergencyContacts, teamLinks] =
      await Promise.all([
        ctx.db
          .query("guardians")
          .withIndex("by_member", (q) => q.eq("memberId", member._id))
          .collect(),
        ctx.db
          .query("guardians")
          .withIndex("by_guardian", (q) => q.eq("guardianMemberId", member._id))
          .collect(),
        ctx.db
          .query("emergencyContacts")
          .withIndex("by_member", (q) => q.eq("memberId", member._id))
          .collect(),
        ctx.db
          .query("teamMembers")
          .withIndex("by_member", (q) => q.eq("memberId", member._id))
          .collect(),
      ]);

    const guardians = await Promise.all(
      guardianLinks.map(async (g) => ({
        link: g,
        guardian: await ctx.db.get(g.guardianMemberId),
      })),
    );
    const dependentMembers = await Promise.all(
      dependents.map(async (g) => ({
        link: g,
        member: await ctx.db.get(g.memberId),
      })),
    );
    const teams = await Promise.all(
      teamLinks.map(async (t) => ({
        link: t,
        team: await ctx.db.get(t.teamId),
      })),
    );

    // Medical notes — restricted visibility.
    let medicalNotes: string | null = null;
    const canSeeMedical = canViewRestricted(auth.role);
    if (canSeeMedical) {
      const note = await ctx.db
        .query("medicalNotes")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .unique();
      medicalNotes = note?.notes ?? null;
    }

    const certifications = await ctx.db
      .query("volunteerCertifications")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .collect();

    return {
      member,
      guardians,
      dependents: dependentMembers,
      emergencyContacts,
      teams,
      medicalNotes,
      canSeeMedical,
      certifications,
    };
  },
});

export const create = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    status: v.optional(memberStatusValidator),
    notes: v.optional(v.string()),
    isVolunteer: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
    return await ctx.db.insert("members", {
      orgId: auth.org._id,
      firstName: args.firstName.trim(),
      lastName: args.lastName.trim(),
      email: args.email,
      phone: args.phone,
      dateOfBirth: args.dateOfBirth,
      status: args.status ?? "active",
      notes: args.notes,
      isVolunteer: args.isVolunteer ?? false,
    });
  },
});

export const update = mutation({
  args: {
    memberId: v.id("members"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    status: v.optional(memberStatusValidator),
    notes: v.optional(v.string()),
    isVolunteer: v.optional(v.boolean()),
    volunteerSkills: v.optional(v.array(v.string())),
    volunteerAvailability: v.optional(v.string()),
    volunteerNotes: v.optional(v.string()),
    clubRole: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
    const { memberId, clubRole, ...rest } = args;
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    );
    if (clubRole !== undefined) {
      patch.clubRole = clubRole ?? undefined;
    }
    await ctx.db.patch(memberId, patch);
  },
});

export const remove = mutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "admin");
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);

    // Cascade cleanup of dependent rows.
    for (const table of [
      "guardians",
      "emergencyContacts",
      "medicalNotes",
      "teamMembers",
      "rsvps",
      "attendance",
      "volunteerCertifications",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
        .collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    await ctx.db.delete(args.memberId);
  },
});

// --- Guardians ---------------------------------------------------------------

export const addGuardian = mutation({
  args: {
    memberId: v.id("members"),
    guardianMemberId: v.id("members"),
    relationship: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
    const member = await ctx.db.get(args.memberId);
    const guardian = await ctx.db.get(args.guardianMemberId);
    assertSameOrg(auth, member);
    assertSameOrg(auth, guardian);
    return await ctx.db.insert("guardians", {
      orgId: auth.org._id,
      memberId: args.memberId,
      guardianMemberId: args.guardianMemberId,
      relationship: args.relationship,
    });
  },
});

export const removeGuardian = mutation({
  args: { linkId: v.id("guardians") },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
    const link = await ctx.db.get(args.linkId);
    assertSameOrg(auth, link);
    await ctx.db.delete(args.linkId);
  },
});

// --- Emergency contacts ------------------------------------------------------

export const addEmergencyContact = mutation({
  args: {
    memberId: v.id("members"),
    name: v.string(),
    relationship: v.optional(v.string()),
    phone: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
    return await ctx.db.insert("emergencyContacts", {
      orgId: auth.org._id,
      memberId: args.memberId,
      name: args.name,
      relationship: args.relationship,
      phone: args.phone,
      email: args.email,
    });
  },
});

export const removeEmergencyContact = mutation({
  args: { contactId: v.id("emergencyContacts") },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
    const contact = await ctx.db.get(args.contactId);
    assertSameOrg(auth, contact);
    await ctx.db.delete(args.contactId);
  },
});

// --- Medical notes (restricted) ----------------------------------------------

export const setMedicalNotes = mutation({
  args: { memberId: v.id("members"), notes: v.string() },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
    if (!canViewRestricted(auth.role)) {
      throw new Error("Not permitted to edit medical notes.");
    }
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
    const existing = await ctx.db
      .query("medicalNotes")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        notes: args.notes,
        updatedBy: auth.user._id,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("medicalNotes", {
        orgId: auth.org._id,
        memberId: args.memberId,
        notes: args.notes,
        updatedBy: auth.user._id,
        updatedAt: Date.now(),
      });
    }
  },
});
