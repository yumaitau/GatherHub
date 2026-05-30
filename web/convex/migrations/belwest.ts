import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { seedAllDefaultsForOrg } from "../taxonomies";

/**
 * One-shot migration helpers for importing data dumped from the legacy
 * Belwest soccer registration system into GatherHub. All entry points
 * are `internalMutation`s; run them from `tools/migrate-belwest.mjs`
 * with a Convex deploy key. Idempotent on the natural keys called out
 * in each function.
 */

/** Temp helper: list every users row's email + id so the operator can pick
 *  the right one when provisionOrg can't match an email. Remove with the
 *  rest of this module once import is done. */
export const whoami = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("users").collect();
    return rows.map((r) => ({
      id: r._id,
      email: r.email ?? null,
      firstName: r.firstName ?? null,
      lastName: r.lastName ?? null,
      clerkUserId: r.clerkUserId,
    }));
  },
});

// ---------- Provision target org -------------------------------------

export const provisionOrg = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    ownerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let user: Doc<"users"> | null = null;
    if (args.ownerUserId) {
      user = await ctx.db.get(args.ownerUserId);
    } else if (args.ownerEmail) {
      user = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), args.ownerEmail!.toLowerCase()))
        .first();
    }
    if (!user) {
      throw new ConvexError({
        code: "owner_user_missing",
        message: `No GatherHub user matched. Pass --owner-user-id or sign in first.`,
      });
    }

    let org: Doc<"organizations"> | null = null;
    if (args.slug) {
      org = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug))
        .unique();
    }
    if (!org) {
      const existing = await ctx.db.query("organizations").collect();
      org =
        existing.find(
          (o) =>
            o.name.toLowerCase() === args.name.toLowerCase() &&
            o.createdBy === user._id,
        ) ?? null;
    }

    let orgId: Id<"organizations">;
    if (org) {
      orgId = org._id;
      // Make sure soccer mode is on for the import.
      if (!org.soccerMode) {
        await ctx.db.patch(orgId, { soccerMode: true });
      }
    } else {
      orgId = await ctx.db.insert("organizations", {
        name: args.name,
        slug: args.slug,
        createdBy: user._id,
        inviteCode: undefined,
        soccerMode: true,
      });
    }

    // Membership (owner) + active org pointer.
    const member = await ctx.db
      .query("memberships")
      .withIndex("by_org_and_user", (q) =>
        q.eq("orgId", orgId).eq("userId", user._id),
      )
      .unique();
    if (!member) {
      await ctx.db.insert("memberships", {
        orgId,
        userId: user._id,
        role: "owner",
      });
    }
    if (user.activeOrgId !== orgId) {
      await ctx.db.patch(user._id, { activeOrgId: orgId });
    }

    await seedAllDefaultsForOrg(ctx, orgId);

    return { orgId, userId: user._id };
  },
});

// ---------- Taxonomies (competitions / age groups / divisions) -------

export const importCompetitions = mutation({
  args: {
    orgId: v.id("organizations"),
    rows: v.array(
      v.object({
        name: v.string(),
        season: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { orgId, rows }) => {
    let order = 0;
    let created = 0;
    for (const row of rows) {
      const existing = await ctx.db
        .query("soccerCompetitions")
        .withIndex("by_org_order", (q) => q.eq("orgId", orgId))
        .collect()
        .then((all) => all.find((r) => r.name === row.name));
      if (existing) {
        order = Math.max(order, existing.order + 1);
        continue;
      }
      await ctx.db.insert("soccerCompetitions", {
        orgId,
        name: row.name,
        season: row.season,
        order: order++,
        active: true,
      });
      created++;
    }
    return { created };
  },
});

export const importAgeGroups = mutation({
  args: {
    orgId: v.id("organizations"),
    rows: v.array(v.string()),
  },
  handler: async (ctx, { orgId, rows }) => {
    let created = 0;
    let order = 0;
    const existing = await ctx.db
      .query("taxonomies")
      .withIndex("by_org_kind_order", (q) =>
        q.eq("orgId", orgId).eq("kind", "team_age_group"),
      )
      .collect();
    const existingKeys = new Set(existing.map((r) => r.key));
    order = existing.reduce((m, r) => Math.max(m, r.order + 1), 0);
    for (const label of rows) {
      const key = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      if (!key || existingKeys.has(key)) continue;
      await ctx.db.insert("taxonomies", {
        orgId,
        kind: "team_age_group",
        key,
        label,
        order: order++,
        active: true,
      });
      existingKeys.add(key);
      created++;
    }
    return { created };
  },
});

export const importDivisions = mutation({
  args: {
    orgId: v.id("organizations"),
    rows: v.array(
      v.object({
        name: v.string(),
        minGrade: v.optional(v.number()),
        maxGrade: v.optional(v.number()),
        color: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { orgId, rows }) => {
    let created = 0;
    const existing = await ctx.db
      .query("soccerDivisions")
      .withIndex("by_org_order", (q) => q.eq("orgId", orgId))
      .collect();
    const existingNames = new Set(existing.map((r) => r.name));
    let order = existing.reduce((m, r) => Math.max(m, r.order + 1), 0);
    for (const row of rows) {
      if (existingNames.has(row.name)) continue;
      await ctx.db.insert("soccerDivisions", {
        orgId,
        name: row.name,
        minGrade: row.minGrade ?? 0,
        maxGrade: row.maxGrade ?? 100,
        color: row.color,
        order: order++,
        active: true,
      });
      existingNames.add(row.name);
      created++;
    }
    return { created };
  },
});

// ---------- Teams ----------------------------------------------------

export const importTeams = mutation({
  args: {
    orgId: v.id("organizations"),
    rows: v.array(
      v.object({
        name: v.string(),
        ageGroup: v.optional(v.string()),
        season: v.optional(v.string()),
        kitColour: v.optional(v.string()),
        kitBagNumber: v.optional(v.string()),
        isActive: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, { orgId, rows }) => {
    let created = 0;
    const existing = await ctx.db
      .query("teams")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t]));
    for (const row of rows) {
      if (byName.has(row.name.toLowerCase())) continue;
      const id = await ctx.db.insert("teams", {
        orgId,
        name: row.name,
        ageGroup: row.ageGroup,
        season: row.season,
        kitColour: row.kitColour,
        kitBagNumber: row.kitBagNumber,
        isActive: row.isActive ?? true,
      });
      const inserted = await ctx.db.get(id);
      if (inserted) byName.set(inserted.name.toLowerCase(), inserted);
      created++;
    }
    return { created };
  },
});

// ---------- Members + registrations ----------------------------------

export const importPlayers = mutation({
  args: {
    orgId: v.id("organizations"),
    rows: v.array(
      v.object({
        firstName: v.string(),
        lastName: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        dob: v.optional(v.string()),
        gender: v.optional(v.string()),
        schoolName: v.optional(v.string()),
        ffaNumber: v.optional(v.string()),
        teamName: v.optional(v.string()),
        competitionName: v.optional(v.string()),
        divisionName: v.optional(v.string()),
        ageGroup: v.optional(v.string()),
        registered: v.optional(v.boolean()),
        registeredAt: v.optional(v.number()),
        paid: v.optional(v.boolean()),
        paidAt: v.optional(v.number()),
        paymentPlan: v.optional(v.boolean()),
        paymentPlanStart: v.optional(v.string()),
        paymentPlanEnd: v.optional(v.string()),
        comments: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { orgId, rows }) => {
    const existingMembers = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const byEmail = new Map(
      existingMembers
        .filter((m) => m.email)
        .map((m) => [m.email!.toLowerCase(), m]),
    );
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const teamByName = new Map(teams.map((t) => [t.name.toLowerCase(), t]));
    const comps = await ctx.db
      .query("soccerCompetitions")
      .withIndex("by_org_order", (q) => q.eq("orgId", orgId))
      .collect();
    const compByName = new Map(comps.map((c) => [c.name.toLowerCase(), c]));
    const divs = await ctx.db
      .query("soccerDivisions")
      .withIndex("by_org_order", (q) => q.eq("orgId", orgId))
      .collect();
    const divByName = new Map(divs.map((d) => [d.name.toLowerCase(), d]));

    let createdMembers = 0;
    let createdRegs = 0;
    let updatedRegs = 0;
    let skipped = 0;

    for (const row of rows) {
      const emailKey = row.email?.trim().toLowerCase();
      let member = emailKey ? byEmail.get(emailKey) : undefined;
      if (!member) {
        const memberId = await ctx.db.insert("members", {
          orgId,
          firstName: row.firstName.trim(),
          lastName: row.lastName.trim(),
          email: emailKey,
          phone: row.phone,
          dateOfBirth: row.dob,
          status: "active",
          isVolunteer: false,
        });
        const m = await ctx.db.get(memberId);
        if (!m) continue;
        member = m;
        createdMembers++;
        if (emailKey) byEmail.set(emailKey, member);
      } else {
        skipped++;
      }

      const team = row.teamName && teamByName.get(row.teamName.toLowerCase());
      const comp =
        row.competitionName &&
        compByName.get(row.competitionName.toLowerCase());
      const div =
        row.divisionName && divByName.get(row.divisionName.toLowerCase());

      const existingReg = await ctx.db
        .query("soccerRegistrations")
        .withIndex("by_org_member", (q) =>
          q.eq("orgId", orgId).eq("memberId", member._id),
        )
        .first();

      const regFields = {
        teamId: team ? team._id : undefined,
        competitionId: comp ? comp._id : undefined,
        divisionId: div ? div._id : undefined,
        ageGroupKey: row.ageGroup
          ? row.ageGroup
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "")
          : undefined,
        ffaNumber: row.ffaNumber,
        gender: row.gender,
        schoolName: row.schoolName,
        registered: Boolean(row.registered),
        registeredAt: row.registered ? row.registeredAt : undefined,
        paid: Boolean(row.paid),
        paidAt: row.paid ? row.paidAt : undefined,
        paymentPlan: row.paymentPlan,
        paymentPlanStart: row.paymentPlanStart,
        paymentPlanEnd: row.paymentPlanEnd,
        comments: row.comments,
      };

      if (existingReg) {
        await ctx.db.patch(existingReg._id, regFields);
        updatedRegs++;
      } else {
        await ctx.db.insert("soccerRegistrations", {
          orgId,
          memberId: member._id,
          ...regFields,
        });
        createdRegs++;
      }
    }
    return { createdMembers, createdRegs, updatedRegs, skipped };
  },
});

// ---------- Club contacts (coaches/managers + WWVP) ------------------

export const importClubContacts = mutation({
  args: {
    orgId: v.id("organizations"),
    rows: v.array(
      v.object({
        firstName: v.string(),
        lastName: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        role: v.optional(v.string()), // "Coach" | "Manager"
        teamName: v.optional(v.string()),
        wwvpStatus: v.optional(v.string()),
        wwvpSightedDate: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { orgId, rows }) => {
    const existingMembers = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const byEmail = new Map(
      existingMembers
        .filter((m) => m.email)
        .map((m) => [m.email!.toLowerCase(), m]),
    );

    const userForActor = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("activeOrgId"), orgId))
      .first();
    if (!userForActor) {
      throw new ConvexError({
        code: "no_actor",
        message: "Provision the org first so we have an actor user.",
      });
    }

    let createdMembers = 0;
    let createdWwvp = 0;
    let updatedWwvp = 0;

    for (const row of rows) {
      const emailKey = row.email?.trim().toLowerCase();
      let member = emailKey ? byEmail.get(emailKey) : undefined;
      if (!member) {
        const note = row.role ? `Imported as ${row.role}.` : undefined;
        const id = await ctx.db.insert("members", {
          orgId,
          firstName: row.firstName.trim(),
          lastName: row.lastName.trim(),
          email: emailKey,
          phone: row.phone,
          status: "active",
          isVolunteer: true,
          volunteerNotes: note,
        });
        const m = await ctx.db.get(id);
        if (!m) continue;
        member = m;
        createdMembers++;
        if (emailKey) byEmail.set(emailKey, member);
      }

      const status = normaliseWwvp(row.wwvpStatus);
      const existing = await ctx.db
        .query("soccerWwvp")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          status,
          sightedAt: row.wwvpSightedDate ?? existing.sightedAt,
          updatedBy: userForActor._id,
          updatedAt: Date.now(),
        });
        updatedWwvp++;
      } else {
        await ctx.db.insert("soccerWwvp", {
          orgId,
          memberId: member._id,
          status,
          sightedAt: row.wwvpSightedDate,
          updatedBy: userForActor._id,
          updatedAt: Date.now(),
        });
        createdWwvp++;
      }
    }
    return { createdMembers, createdWwvp, updatedWwvp };
  },
});

function normaliseWwvp(raw: string | undefined): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (s.includes("approv")) return "approved";
  if (s.includes("sight")) return "sighted";
  if (s.includes("pend")) return "pending";
  return "not_provided";
}

// ---------- Lifetime members ----------------------------------------

export const importLifetimeMembers = mutation({
  args: {
    orgId: v.id("organizations"),
    rows: v.array(
      v.object({
        firstName: v.string(),
        lastName: v.string(),
        email: v.optional(v.string()),
        joinYear: v.optional(v.string()),
        firstAddedToClub: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { orgId, rows }) => {
    const existingMembers = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const byEmail = new Map(
      existingMembers
        .filter((m) => m.email)
        .map((m) => [m.email!.toLowerCase(), m]),
    );
    const byName = new Map(
      existingMembers.map((m) => [
        `${m.firstName.toLowerCase()}|${m.lastName.toLowerCase()}`,
        m,
      ]),
    );

    let created = 0;
    let flagged = 0;

    for (const row of rows) {
      const emailKey = row.email?.trim().toLowerCase();
      const nameKey = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}`;
      let member =
        (emailKey && byEmail.get(emailKey)) || byName.get(nameKey) || null;
      if (!member) {
        const id = await ctx.db.insert("members", {
          orgId,
          firstName: row.firstName.trim(),
          lastName: row.lastName.trim(),
          email: emailKey,
          status: "active",
          isVolunteer: false,
          isLifetimeMember: true,
          lifetimeMemberSince: row.joinYear ?? row.firstAddedToClub,
        });
        const m = await ctx.db.get(id);
        if (m) {
          if (emailKey) byEmail.set(emailKey, m);
          byName.set(nameKey, m);
          created++;
        }
      } else if (!member.isLifetimeMember) {
        await ctx.db.patch(member._id, {
          isLifetimeMember: true,
          lifetimeMemberSince:
            member.lifetimeMemberSince ?? row.joinYear ?? row.firstAddedToClub,
        });
        flagged++;
      }
    }

    return { created, flagged };
  },
});

// ---------- Inspection ----------------------------------------------

export const summary = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, { orgId }) => {
    const memberCount = (
      await ctx.db
        .query("members")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    ).length;
    const teamCount = (
      await ctx.db
        .query("teams")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    ).length;
    const regs = (
      await ctx.db
        .query("soccerRegistrations")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    ).length;
    const wwvp = (
      await ctx.db
        .query("soccerWwvp")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    ).length;
    const lifetime = (
      await ctx.db
        .query("members")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    ).filter((m) => m.isLifetimeMember).length;
    return {
      members: memberCount,
      teams: teamCount,
      registrations: regs,
      wwvp,
      lifetimeMembers: lifetime,
    };
  },
});
