import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireOrgMember, requireRole, assertSameOrg } from "./lib/auth";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";
import { assertTaxonomyKey } from "./taxonomies";

const nullableString = v.union(v.string(), v.null());

/**
 * Soccer-mode features: configurable skill rubric, weighted evaluations,
 * grade-band divisions, registrations with payment + payment-plan
 * tracking, and WWVP background-check status. Only meaningful when
 * `organizations.soccerMode === true`.
 */

// ---------- Org-level toggle ----------------------------------------

export const setSoccerMode = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "admin");
    await ctx.db.patch(auth.org._id, { soccerMode: args.enabled });
    if (args.enabled) {
      await ensureSkillDefaults(ctx, auth.org._id);
      await ensureDivisionDefaults(ctx, auth.org._id);
    }
  },
});

export async function isSoccerMode(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
): Promise<boolean> {
  const org = await ctx.db.get(orgId);
  return Boolean(org?.soccerMode);
}

async function assertSoccerMode(ctx: MutationCtx, orgId: Id<"organizations">) {
  if (!(await isSoccerMode(ctx, orgId))) {
    throw new ConvexError({
      code: "soccer_mode_disabled",
      message: "Enable soccer club mode in Settings first.",
    });
  }
}

// ---------- Defaults -----------------------------------------------

const DEFAULT_SKILLS: Array<{
  name: string;
  description: string;
  weight: number;
}> = [
  {
    name: "Ball Handling",
    description: "Dribbling, first touch, ball control.",
    weight: 0.2,
  },
  {
    name: "Passing",
    description: "Short and long pass accuracy and decision making.",
    weight: 0.15,
  },
  {
    name: "Shooting",
    description: "Finishing, technique, composure in front of goal.",
    weight: 0.15,
  },
  {
    name: "Defense",
    description: "Tackling, positioning, anticipation.",
    weight: 0.15,
  },
  {
    name: "Speed & Agility",
    description: "Acceleration, change of direction, sprint speed.",
    weight: 0.1,
  },
  {
    name: "Physical Strength",
    description: "Power in challenges, holding the ball, aerial ability.",
    weight: 0.1,
  },
  {
    name: "Game Intelligence",
    description: "Reading the game, positioning off the ball, decisions.",
    weight: 0.15,
  },
];

// Bands mirror the Belwest grading system 1:1. Five divisions, banded
// in 15-point increments from 85 down. The lowest band catches anything
// not graded yet (default placement). Customise in Settings → Soccer.
const DEFAULT_DIVISIONS: Array<{
  name: string;
  minGrade: number;
  maxGrade: number;
  color: string;
}> = [
  { name: "Division 1", minGrade: 85, maxGrade: 100, color: "#bf0000" },
  { name: "Division 2", minGrade: 70, maxGrade: 84.99, color: "#dc2626" },
  { name: "Division 3", minGrade: 55, maxGrade: 69.99, color: "#ef4444" },
  { name: "Division 4", minGrade: 40, maxGrade: 54.99, color: "#f87171" },
  { name: "Division 5", minGrade: 0, maxGrade: 39.99, color: "#fca5a5" },
];

async function ensureSkillDefaults(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
): Promise<void> {
  const existing = await ctx.db
    .query("soccerSkills")
    .withIndex("by_org_order", (q) => q.eq("orgId", orgId))
    .first();
  if (existing) return;
  let order = 0;
  for (const s of DEFAULT_SKILLS) {
    await ctx.db.insert("soccerSkills", {
      orgId,
      name: s.name,
      description: s.description,
      maxScore: 10,
      weight: s.weight,
      order: order++,
      active: true,
    });
  }
}

async function ensureDivisionDefaults(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
): Promise<void> {
  const existing = await ctx.db
    .query("soccerDivisions")
    .withIndex("by_org_order", (q) => q.eq("orgId", orgId))
    .first();
  if (existing) return;
  let order = 0;
  for (const d of DEFAULT_DIVISIONS) {
    await ctx.db.insert("soccerDivisions", {
      orgId,
      name: d.name,
      minGrade: d.minGrade,
      maxGrade: d.maxGrade,
      color: d.color,
      order: order++,
      active: true,
    });
  }
}

/**
 * Insert any missing default skills / divisions for the active org.
 * Existing rows (custom or already-seeded) are left untouched — this
 * top-ups the catalogue without overwriting committee customisations.
 * Admin+. Returns counts of what was added.
 */
export const restoreGradingDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const auth = await requireRole(ctx, "admin");
    await assertSoccerMode(ctx, auth.org._id);

    const existingSkills = await ctx.db
      .query("soccerSkills")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const existingSkillNames = new Set(
      existingSkills.map((s) => s.name.toLowerCase()),
    );
    const lastSkillOrder = existingSkills.reduce(
      (m, r) => (r.order > m ? r.order : m),
      -1,
    );
    let skillsAdded = 0;
    let nextSkillOrder = lastSkillOrder + 1;
    for (const s of DEFAULT_SKILLS) {
      if (existingSkillNames.has(s.name.toLowerCase())) continue;
      await ctx.db.insert("soccerSkills", {
        orgId: auth.org._id,
        name: s.name,
        description: s.description,
        maxScore: 10,
        weight: s.weight,
        order: nextSkillOrder++,
        active: true,
      });
      skillsAdded++;
    }

    const existingDivisions = await ctx.db
      .query("soccerDivisions")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const existingDivisionNames = new Set(
      existingDivisions.map((d) => d.name.toLowerCase()),
    );
    const lastDivisionOrder = existingDivisions.reduce(
      (m, r) => (r.order > m ? r.order : m),
      -1,
    );
    let divisionsAdded = 0;
    let nextDivisionOrder = lastDivisionOrder + 1;
    for (const d of DEFAULT_DIVISIONS) {
      if (existingDivisionNames.has(d.name.toLowerCase())) continue;
      await ctx.db.insert("soccerDivisions", {
        orgId: auth.org._id,
        name: d.name,
        minGrade: d.minGrade,
        maxGrade: d.maxGrade,
        color: d.color,
        order: nextDivisionOrder++,
        active: true,
      });
      divisionsAdded++;
    }

    return { skillsAdded, divisionsAdded };
  },
});

/**
 * Backfill: walk every soccer-mode organisation and ensure the Belwest
 * defaults (DEFAULT_SKILLS + DEFAULT_DIVISIONS) exist for each. Tops up
 * only what's missing — never overwrites a committee's custom skills,
 * weights, divisions, or band edges. Idempotent.
 *
 * Internal: callable from `npx convex run soccer:applyBelwestDefaultsToAllSoccerOrgs`
 * with the deploy key, not from the public client surface.
 *
 * Returns per-org counts so the operator can see what changed.
 */
export const applyBelwestDefaultsToAllSoccerOrgs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    const results: Array<{
      orgId: string;
      orgName: string;
      skillsAdded: number;
      divisionsAdded: number;
    }> = [];
    let orgsTouched = 0;

    for (const org of orgs) {
      if (!org.soccerMode) continue;
      orgsTouched++;

      // Skills top-up.
      const existingSkills = await ctx.db
        .query("soccerSkills")
        .withIndex("by_org_order", (q) => q.eq("orgId", org._id))
        .collect();
      const existingSkillNames = new Set(
        existingSkills.map((s) => s.name.toLowerCase()),
      );
      const lastSkillOrder = existingSkills.reduce(
        (m, r) => (r.order > m ? r.order : m),
        -1,
      );
      let nextSkillOrder = lastSkillOrder + 1;
      let skillsAdded = 0;
      for (const s of DEFAULT_SKILLS) {
        if (existingSkillNames.has(s.name.toLowerCase())) continue;
        await ctx.db.insert("soccerSkills", {
          orgId: org._id,
          name: s.name,
          description: s.description,
          maxScore: 10,
          weight: s.weight,
          order: nextSkillOrder++,
          active: true,
        });
        skillsAdded++;
      }

      // Divisions top-up.
      const existingDivisions = await ctx.db
        .query("soccerDivisions")
        .withIndex("by_org_order", (q) => q.eq("orgId", org._id))
        .collect();
      const existingDivisionNames = new Set(
        existingDivisions.map((d) => d.name.toLowerCase()),
      );
      const lastDivisionOrder = existingDivisions.reduce(
        (m, r) => (r.order > m ? r.order : m),
        -1,
      );
      let nextDivisionOrder = lastDivisionOrder + 1;
      let divisionsAdded = 0;
      for (const d of DEFAULT_DIVISIONS) {
        if (existingDivisionNames.has(d.name.toLowerCase())) continue;
        await ctx.db.insert("soccerDivisions", {
          orgId: org._id,
          name: d.name,
          minGrade: d.minGrade,
          maxGrade: d.maxGrade,
          color: d.color,
          order: nextDivisionOrder++,
          active: true,
        });
        divisionsAdded++;
      }

      results.push({
        orgId: String(org._id),
        orgName: org.name,
        skillsAdded,
        divisionsAdded,
      });
    }

    return {
      orgsScanned: orgs.length,
      orgsTouched,
      results,
    };
  },
});

// ---------- Skills (rubric) ----------------------------------------

export const listSkills = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const rows = await ctx.db
      .query("soccerSkills")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const filtered = args.includeInactive ? rows : rows.filter((r) => r.active);
    filtered.sort((a, b) => a.order - b.order);
    return filtered;
  },
});

export const createSkill = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    weight: v.number(),
    maxScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    await assertSoccerMode(ctx, auth.org._id);
    const last = await ctx.db
      .query("soccerSkills")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .order("desc")
      .first();
    return await ctx.db.insert("soccerSkills", {
      orgId: auth.org._id,
      name: args.name.trim(),
      description: args.description,
      maxScore: args.maxScore ?? 10,
      weight: args.weight,
      order: last ? last.order + 1 : 0,
      active: true,
    });
  },
});

export const updateSkill = mutation({
  args: {
    id: v.id("soccerSkills"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    weight: v.optional(v.number()),
    maxScore: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const row = await ctx.db.get(args.id);
    assertSameOrg(auth, row);
    if (!row) return;
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.weight !== undefined) patch.weight = args.weight;
    if (args.maxScore !== undefined) patch.maxScore = args.maxScore;
    if (args.active !== undefined) patch.active = args.active;
    await ctx.db.patch(args.id, patch);
  },
});

// ---------- Divisions ----------------------------------------------

export const listDivisions = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const rows = await ctx.db
      .query("soccerDivisions")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    rows.sort((a, b) => a.order - b.order);
    return rows;
  },
});

export const upsertDivision = mutation({
  args: {
    id: v.optional(v.id("soccerDivisions")),
    name: v.string(),
    minGrade: v.number(),
    maxGrade: v.number(),
    color: v.optional(v.string()),
    active: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const divisionId = ctx.db.normalizeId("soccerDivisions", replay.resultId);
      if (!divisionId) throw new Error("Invalid division idempotency result.");
      return divisionId;
    }
    if (replay) throw new Error("Missing division idempotency result.");
    await assertSoccerMode(ctx, auth.org._id);
    if (args.minGrade > args.maxGrade) {
      throw new ConvexError({
        code: "invalid_band",
        message: "Min grade must be at or below max grade.",
      });
    }
    if (args.id) {
      const row = await ctx.db.get(args.id);
      assertSameOrg(auth, row);
      if (!row) return;
      await ctx.db.patch(args.id, {
        name: args.name.trim(),
        minGrade: args.minGrade,
        maxGrade: args.maxGrade,
        color: args.color,
        active: args.active ?? row.active,
      });
      await recordClientMutation(
        ctx,
        auth,
        args.clientMutationId,
        "soccer:upsertDivision",
        String(args.id),
      );
      return args.id;
    }
    const last = await ctx.db
      .query("soccerDivisions")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .order("desc")
      .first();
    const divisionId = await ctx.db.insert("soccerDivisions", {
      orgId: auth.org._id,
      name: args.name.trim(),
      minGrade: args.minGrade,
      maxGrade: args.maxGrade,
      color: args.color,
      order: last ? last.order + 1 : 0,
      active: true,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "soccer:upsertDivision",
      String(divisionId),
    );
    return divisionId;
  },
});

// ---------- Competitions -------------------------------------------

export const listCompetitions = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const rows = await ctx.db
      .query("soccerCompetitions")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    rows.sort((a, b) => a.order - b.order);
    return rows;
  },
});

export const upsertCompetition = mutation({
  args: {
    id: v.optional(v.id("soccerCompetitions")),
    name: v.string(),
    season: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    await assertSoccerMode(ctx, auth.org._id);
    if (args.id) {
      const row = await ctx.db.get(args.id);
      assertSameOrg(auth, row);
      if (!row) return;
      await ctx.db.patch(args.id, {
        name: args.name.trim(),
        season: args.season,
        active: args.active ?? row.active,
      });
      return args.id;
    }
    const last = await ctx.db
      .query("soccerCompetitions")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .order("desc")
      .first();
    return await ctx.db.insert("soccerCompetitions", {
      orgId: auth.org._id,
      name: args.name.trim(),
      season: args.season,
      order: last ? last.order + 1 : 0,
      active: true,
    });
  },
});

// ---------- Registrations ------------------------------------------

export const listRegistrations = query({
  args: { teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const rows = args.teamId
      ? await ctx.db
          .query("soccerRegistrations")
          .withIndex("by_org_team", (q) =>
            q.eq("orgId", auth.org._id).eq("teamId", args.teamId),
          )
          .collect()
      : await ctx.db
          .query("soccerRegistrations")
          .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
          .collect();
    // Denormalise member + team for display.
    return await Promise.all(
      rows.map(async (r) => {
        const member = await ctx.db.get(r.memberId);
        const team = r.teamId ? await ctx.db.get(r.teamId) : null;
        const division = r.divisionId ? await ctx.db.get(r.divisionId) : null;
        return {
          ...r,
          memberName: member
            ? `${member.firstName} ${member.lastName}`
            : "Unknown",
          memberEmail: member?.email,
          teamName: team?.name ?? null,
          divisionName: division?.name ?? null,
        };
      }),
    );
  },
});

export const getRegistration = query({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
    const reg = await ctx.db
      .query("soccerRegistrations")
      .withIndex("by_org_member", (q) =>
        q.eq("orgId", auth.org._id).eq("memberId", args.memberId),
      )
      .first();
    return reg;
  },
});

export const upsertRegistration = mutation({
  args: {
    memberId: v.id("members"),
    competitionId: v.optional(v.union(v.id("soccerCompetitions"), v.null())),
    ageGroupKey: v.optional(nullableString),
    divisionId: v.optional(v.union(v.id("soccerDivisions"), v.null())),
    teamId: v.optional(v.union(v.id("teams"), v.null())),
    ffaNumber: v.optional(nullableString),
    gender: v.optional(nullableString),
    schoolName: v.optional(nullableString),
    registered: v.optional(v.boolean()),
    paid: v.optional(v.boolean()),
    paymentPlan: v.optional(v.boolean()),
    paymentPlanStart: v.optional(nullableString),
    paymentPlanEnd: v.optional(nullableString),
    comments: v.optional(nullableString),
    kitColour: v.optional(nullableString),
    /// Pass `true` to explicitly clear divisionId (so the auto
    /// grade-banding takes over). `divisionId` alone is treated as
    /// "leave unchanged" when undefined, so we need a separate flag.
    clearDivision: v.optional(v.boolean()),
    clearTeam: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const registrationId = ctx.db.normalizeId(
        "soccerRegistrations",
        replay.resultId,
      );
      if (!registrationId) {
        throw new Error("Invalid registration idempotency result.");
      }
      return registrationId;
    }
    if (replay) throw new Error("Missing registration idempotency result.");
    await assertSoccerMode(ctx, auth.org._id);
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
    // Each FK must resolve to a record in the caller's org. Otherwise a
    // committee member could write cross-org references and violate the
    // tenant-isolation invariant.
    if (args.competitionId !== undefined && args.competitionId !== null) {
      const comp = await ctx.db.get(args.competitionId);
      assertSameOrg(auth, comp);
    }
    if (args.divisionId !== undefined && args.divisionId !== null) {
      const div = await ctx.db.get(args.divisionId);
      assertSameOrg(auth, div);
    }
    if (args.teamId !== undefined && args.teamId !== null) {
      const team = await ctx.db.get(args.teamId);
      assertSameOrg(auth, team);
    }
    const existing = await ctx.db
      .query("soccerRegistrations")
      .withIndex("by_org_member", (q) =>
        q.eq("orgId", auth.org._id).eq("memberId", args.memberId),
      )
      .first();
    const now = Date.now();
    if (existing) {
      const patch: Record<string, unknown> = {};
      const k = <K extends keyof typeof args>(key: K) => {
        const value = args[key];
        if (value !== undefined)
          patch[key] = value === null ? undefined : value;
      };
      k("competitionId");
      k("ageGroupKey");
      k("divisionId");
      k("teamId");
      k("ffaNumber");
      k("gender");
      k("schoolName");
      k("paymentPlan");
      k("paymentPlanStart");
      k("paymentPlanEnd");
      k("comments");
      k("kitColour");
      if (args.clearDivision) patch.divisionId = undefined;
      if (args.clearTeam) patch.teamId = undefined;
      if (args.registered !== undefined) {
        patch.registered = args.registered;
        if (args.registered && !existing.registeredAt) {
          patch.registeredAt = now;
        }
      }
      if (args.paid !== undefined) {
        patch.paid = args.paid;
        if (args.paid && !existing.paidAt) {
          patch.paidAt = now;
        }
      }
      await ctx.db.patch(existing._id, patch);
      await recordClientMutation(
        ctx,
        auth,
        args.clientMutationId,
        "soccer:upsertRegistration",
        String(existing._id),
      );
      return existing._id;
    }
    const registrationId = await ctx.db.insert("soccerRegistrations", {
      orgId: auth.org._id,
      memberId: args.memberId,
      competitionId: args.competitionId ?? undefined,
      ageGroupKey: args.ageGroupKey ?? undefined,
      divisionId: args.clearDivision
        ? undefined
        : (args.divisionId ?? undefined),
      teamId: args.clearTeam ? undefined : (args.teamId ?? undefined),
      ffaNumber: args.ffaNumber ?? undefined,
      gender: args.gender ?? undefined,
      schoolName: args.schoolName ?? undefined,
      registered: args.registered ?? false,
      registeredAt: args.registered ? now : undefined,
      paid: args.paid ?? false,
      paidAt: args.paid ? now : undefined,
      paymentPlan: args.paymentPlan,
      paymentPlanStart: args.paymentPlanStart ?? undefined,
      paymentPlanEnd: args.paymentPlanEnd ?? undefined,
      comments: args.comments ?? undefined,
      kitColour: args.kitColour ?? undefined,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "soccer:upsertRegistration",
      String(registrationId),
    );
    return registrationId;
  },
});

export const createFieldRegistration = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    notes: v.optional(v.string()),
    guardianFirstName: v.optional(v.string()),
    guardianLastName: v.optional(v.string()),
    guardianEmail: v.optional(v.string()),
    guardianPhone: v.optional(v.string()),
    guardianRelationship: v.optional(v.string()),
    emergencyName: v.optional(v.string()),
    emergencyRelationship: v.optional(v.string()),
    emergencyPhone: v.optional(v.string()),
    emergencyEmail: v.optional(v.string()),
    competitionId: v.optional(v.id("soccerCompetitions")),
    ageGroupKey: v.optional(v.string()),
    divisionId: v.optional(v.id("soccerDivisions")),
    teamId: v.optional(v.id("teams")),
    ffaNumber: v.optional(v.string()),
    gender: v.optional(v.string()),
    schoolName: v.optional(v.string()),
    registered: v.optional(v.boolean()),
    paid: v.optional(v.boolean()),
    paymentPlan: v.optional(v.boolean()),
    paymentPlanStart: v.optional(v.string()),
    paymentPlanEnd: v.optional(v.string()),
    comments: v.optional(v.string()),
    kitColour: v.optional(v.string()),
    clearDivision: v.optional(v.boolean()),
    clearTeam: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const memberId = ctx.db.normalizeId("members", replay.resultId);
      if (!memberId) throw new Error("Invalid member idempotency result.");
      return memberId;
    }
    if (replay) throw new Error("Missing member idempotency result.");

    await assertSoccerMode(ctx, auth.org._id);
    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    if (!firstName || !lastName) {
      throw new ConvexError({
        code: "invalid_member_name",
        message: "Player first and last name are required.",
      });
    }

    if (args.competitionId !== undefined) {
      const comp = await ctx.db.get(args.competitionId);
      assertSameOrg(auth, comp);
    }
    if (args.divisionId !== undefined) {
      const div = await ctx.db.get(args.divisionId);
      assertSameOrg(auth, div);
    }
    if (args.teamId !== undefined) {
      const team = await ctx.db.get(args.teamId);
      assertSameOrg(auth, team);
    }
    if (args.ageGroupKey !== undefined) {
      await assertTaxonomyKey(
        ctx,
        auth.org._id,
        "team_age_group",
        args.ageGroupKey,
      );
    }

    const guardianFirstName = args.guardianFirstName?.trim();
    const guardianLastName = args.guardianLastName?.trim();
    const hasGuardian =
      Boolean(guardianFirstName) ||
      Boolean(guardianLastName) ||
      Boolean(args.guardianEmail?.trim()) ||
      Boolean(args.guardianPhone?.trim());
    if (hasGuardian && (!guardianFirstName || !guardianLastName)) {
      throw new ConvexError({
        code: "invalid_guardian",
        message: "Guardian first and last name are required.",
      });
    }

    const emergencyName = args.emergencyName?.trim();
    const emergencyPhone = args.emergencyPhone?.trim();
    const hasEmergency =
      Boolean(emergencyName) ||
      Boolean(emergencyPhone) ||
      Boolean(args.emergencyEmail?.trim()) ||
      Boolean(args.emergencyRelationship?.trim());
    if (hasEmergency && (!emergencyName || !emergencyPhone)) {
      throw new ConvexError({
        code: "invalid_emergency_contact",
        message: "Emergency contact name and phone are required.",
      });
    }

    const now = Date.now();
    const playerId = await ctx.db.insert("members", {
      orgId: auth.org._id,
      firstName,
      lastName,
      email: args.email?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      dateOfBirth: args.dateOfBirth,
      status: "active",
      notes: args.notes?.trim() || undefined,
      isVolunteer: false,
      clubRole: "player",
    });

    if (hasGuardian && guardianFirstName && guardianLastName) {
      const guardianId = await ctx.db.insert("members", {
        orgId: auth.org._id,
        firstName: guardianFirstName,
        lastName: guardianLastName,
        email: args.guardianEmail?.trim() || undefined,
        phone: args.guardianPhone?.trim() || undefined,
        status: "active",
        isVolunteer: false,
        clubRole: "parent",
      });
      await ctx.db.insert("guardians", {
        orgId: auth.org._id,
        memberId: playerId,
        guardianMemberId: guardianId,
        relationship: args.guardianRelationship?.trim() || undefined,
      });
    }

    if (hasEmergency && emergencyName && emergencyPhone) {
      await ctx.db.insert("emergencyContacts", {
        orgId: auth.org._id,
        memberId: playerId,
        name: emergencyName,
        relationship: args.emergencyRelationship?.trim() || undefined,
        phone: emergencyPhone,
        email: args.emergencyEmail?.trim() || undefined,
      });
    }

    await ctx.db.insert("soccerRegistrations", {
      orgId: auth.org._id,
      memberId: playerId,
      competitionId: args.competitionId,
      ageGroupKey: args.ageGroupKey,
      divisionId: args.clearDivision ? undefined : args.divisionId,
      teamId: args.clearTeam ? undefined : args.teamId,
      ffaNumber: args.ffaNumber?.trim() || undefined,
      gender: args.gender?.trim() || undefined,
      schoolName: args.schoolName?.trim() || undefined,
      registered: args.registered ?? false,
      registeredAt: args.registered ? now : undefined,
      paid: args.paid ?? false,
      paidAt: args.paid ? now : undefined,
      paymentPlan: args.paymentPlan,
      paymentPlanStart: args.paymentPlanStart,
      paymentPlanEnd: args.paymentPlanEnd,
      comments: args.comments?.trim() || undefined,
      kitColour: args.kitColour?.trim() || undefined,
    });

    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "soccer:createFieldRegistration",
      String(playerId),
    );
    return playerId;
  },
});

// ---------- WWVP ---------------------------------------------------

export const listWwvp = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const rows = await ctx.db
      .query("soccerWwvp")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    return await Promise.all(
      rows.map(async (r) => {
        const member = await ctx.db.get(r.memberId);
        return {
          ...r,
          memberName: member
            ? `${member.firstName} ${member.lastName}`
            : "Unknown",
        };
      }),
    );
  },
});

export const upsertWwvp = mutation({
  args: {
    memberId: v.id("members"),
    status: v.string(),
    sightedAt: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
    notes: v.optional(v.string()),
    registered: v.optional(v.boolean()),
    registeredDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    await assertSoccerMode(ctx, auth.org._id);
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
    const existing = await ctx.db
      .query("soccerWwvp")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        sightedAt: args.sightedAt,
        expiresAt: args.expiresAt,
        notes: args.notes,
        registered: args.registered,
        registeredDate: args.registeredDate,
        updatedBy: auth.user._id,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("soccerWwvp", {
      orgId: auth.org._id,
      memberId: args.memberId,
      status: args.status,
      sightedAt: args.sightedAt,
      expiresAt: args.expiresAt,
      notes: args.notes,
      registered: args.registered,
      registeredDate: args.registeredDate,
      updatedBy: auth.user._id,
      updatedAt: Date.now(),
    });
  },
});

// ---------- Evaluations + grading -------------------------------------

interface SkillRow {
  _id: Id<"soccerSkills">;
  name: string;
  weight: number;
  maxScore: number;
  active: boolean;
}

/**
 * Weighted average across active skills with a score, expressed 0..100.
 * Skills without a score are simply omitted from both numerator and
 * denominator. Returns 0 if no skills have been scored yet.
 */
function computeGrade(
  skills: SkillRow[],
  evals: Map<Id<"soccerSkills">, number>,
): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const skill of skills) {
    if (!skill.active) continue;
    const score = evals.get(skill._id);
    if (score === undefined) continue;
    weighted += (score / skill.maxScore) * skill.weight * 100;
    totalWeight += skill.weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round((weighted / totalWeight) * 10) / 10;
}

async function divisionForGrade(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  grade: number,
): Promise<{ id: Id<"soccerDivisions">; name: string; color?: string } | null> {
  const rows = await ctx.db
    .query("soccerDivisions")
    .withIndex("by_org_active", (q) => q.eq("orgId", orgId).eq("active", true))
    .collect();
  for (const r of rows) {
    if (grade >= r.minGrade && grade <= r.maxGrade) {
      return { id: r._id, name: r.name, color: r.color };
    }
  }
  return null;
}

export const playerGrade = query({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
    const skills = await ctx.db
      .query("soccerSkills")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const evals = await ctx.db
      .query("soccerEvaluations")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();
    const evalMap = new Map(evals.map((e) => [e.skillId, e.score]));
    const grade = computeGrade(skills, evalMap);
    const division = await divisionForGrade(ctx, auth.org._id, grade);
    return {
      grade,
      division,
      scoredCount: evals.length,
      totalSkills: skills.filter((s) => s.active).length,
      evaluations: evals,
    };
  },
});

export const playerEvaluations = query({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
    return await ctx.db
      .query("soccerEvaluations")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();
  },
});

export const upsertEvaluation = mutation({
  args: {
    memberId: v.id("members"),
    skillId: v.id("soccerSkills"),
    score: v.number(),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const evaluationId = ctx.db.normalizeId(
        "soccerEvaluations",
        replay.resultId,
      );
      if (!evaluationId) {
        throw new Error("Invalid evaluation idempotency result.");
      }
      return evaluationId;
    }
    if (replay) throw new Error("Missing evaluation idempotency result.");
    await assertSoccerMode(ctx, auth.org._id);
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
    const skill = await ctx.db.get(args.skillId);
    assertSameOrg(auth, skill);
    if (!skill) throw new Error("Skill not found.");
    if (args.score < 0 || args.score > skill.maxScore) {
      throw new ConvexError({
        code: "invalid_score",
        message: `Score must be between 0 and ${skill.maxScore}.`,
      });
    }
    const existing = await ctx.db
      .query("soccerEvaluations")
      .withIndex("by_member_skill", (q) =>
        q.eq("memberId", args.memberId).eq("skillId", args.skillId),
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        score: args.score,
        notes: args.notes,
        evaluatedBy: auth.user._id,
        evaluatedAt: now,
      });
      await recordClientMutation(
        ctx,
        auth,
        args.clientMutationId,
        "soccer:upsertEvaluation",
        String(existing._id),
      );
      return existing._id;
    }
    const evaluationId = await ctx.db.insert("soccerEvaluations", {
      orgId: auth.org._id,
      memberId: args.memberId,
      skillId: args.skillId,
      score: args.score,
      notes: args.notes,
      evaluatedBy: auth.user._id,
      evaluatedAt: now,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "soccer:upsertEvaluation",
      String(evaluationId),
    );
    return evaluationId;
  },
});

/**
 * Coaches and managers list. Members whose clubRole is "coach" or
 * "manager" plus their WWVP status and any team links. Used by
 * /soccer/coaches-managers.
 */
export const coachesAndManagers = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const relevant = members.filter(
      (m) => m.clubRole === "coach" || m.clubRole === "manager",
    );
    const wwvpRows = await ctx.db
      .query("soccerWwvp")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const wwvpByMember = new Map(wwvpRows.map((r) => [String(r.memberId), r]));
    return await Promise.all(
      relevant.map(async (m) => {
        const teamLinks = await ctx.db
          .query("teamMembers")
          .withIndex("by_member", (q) => q.eq("memberId", m._id))
          .collect();
        const teams = await Promise.all(
          teamLinks.map(async (l) => {
            const t = await ctx.db.get(l.teamId);
            return t
              ? {
                  id: t._id,
                  name: t.name,
                  role: l.role,
                  ageGroup: t.ageGroup ?? null,
                }
              : null;
          }),
        );
        const wwvp = wwvpByMember.get(String(m._id));
        return {
          memberId: m._id,
          firstName: m.firstName,
          lastName: m.lastName,
          email: m.email,
          phone: m.phone,
          clubRole: m.clubRole ?? "coach",
          teams: teams.filter((t): t is NonNullable<typeof t> => Boolean(t)),
          wwvpStatus: wwvp?.status ?? "not_provided",
          wwvpSightedAt: wwvp?.sightedAt,
          wwvpExpiresAt: wwvp?.expiresAt,
          wwvpNotes: wwvp?.notes,
          registered: wwvp?.registered ?? false,
          registeredDate: wwvp?.registeredDate,
        };
      }),
    );
  },
});

/** Divisions with the members assigned to each (by registration or by
 *  computed grade band). Used by /soccer/divisions. */
export const divisionRoster = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const divisions = await ctx.db
      .query("soccerDivisions")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    divisions.sort((a, b) => a.order - b.order);
    const regs = await ctx.db
      .query("soccerRegistrations")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const skills = await ctx.db
      .query("soccerSkills")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const matchDivision = (grade: number) => {
      for (const d of divisions) {
        if (d.active && grade >= d.minGrade && grade <= d.maxGrade) return d;
      }
      return null;
    };
    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const byMember = new Map(members.map((m) => [m._id, m]));

    const memberToDivision = new Map<string, string>();
    for (const r of regs) {
      if (r.divisionId) memberToDivision.set(r.memberId, String(r.divisionId));
    }
    // Fall back to graded division for members without explicit
    // registration link.
    for (const m of members) {
      if (memberToDivision.has(m._id)) continue;
      const evs = await ctx.db
        .query("soccerEvaluations")
        .withIndex("by_member", (q) => q.eq("memberId", m._id))
        .collect();
      if (evs.length === 0) continue;
      const map = new Map(evs.map((e) => [e.skillId, e.score]));
      const grade = computeGrade(skills, map);
      const d = matchDivision(grade);
      if (d) memberToDivision.set(m._id, String(d._id));
    }

    return divisions.map((d) => {
      const memberIds = [...memberToDivision.entries()]
        .filter(([, divId]) => divId === String(d._id))
        .map(([mid]) => mid);
      const rosterMembers = memberIds
        .map((id) => byMember.get(id as Id<"members">))
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(
            `${b.lastName} ${b.firstName}`,
          ),
        );
      return {
        id: d._id,
        name: d.name,
        color: d.color,
        minGrade: d.minGrade,
        maxGrade: d.maxGrade,
        active: d.active,
        memberCount: rosterMembers.length,
        members: rosterMembers.map((m) => ({
          id: m._id,
          name: `${m.firstName} ${m.lastName}`.trim(),
        })),
      };
    });
  },
});

/** Combined player listing for /soccer/players. */
export const playerListing = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const regs = await ctx.db
      .query("soccerRegistrations")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const skills = await ctx.db
      .query("soccerSkills")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const divisions = await ctx.db
      .query("soccerDivisions")
      .withIndex("by_org_active", (q) =>
        q.eq("orgId", auth.org._id).eq("active", true),
      )
      .collect();
    const matchDivision = (grade: number) => {
      for (const d of divisions) {
        if (grade >= d.minGrade && grade <= d.maxGrade) return d;
      }
      return null;
    };

    const byMemberId = new Map(regs.map((r) => [String(r.memberId), r]));
    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();

    return await Promise.all(
      members.map(async (m) => {
        const reg = byMemberId.get(String(m._id));
        const team = reg?.teamId ? await ctx.db.get(reg.teamId) : null;
        const evs = await ctx.db
          .query("soccerEvaluations")
          .withIndex("by_member", (q) => q.eq("memberId", m._id))
          .collect();
        const evalMap = new Map(evs.map((e) => [e.skillId, e.score]));
        const grade = computeGrade(skills, evalMap);
        const division = reg?.divisionId
          ? await ctx.db.get(reg.divisionId)
          : matchDivision(grade);
        return {
          memberId: m._id,
          name: `${m.firstName} ${m.lastName}`.trim(),
          email: m.email,
          dateOfBirth: m.dateOfBirth,
          hasRegistration: Boolean(reg),
          registered: reg?.registered ?? false,
          registeredAt: reg?.registeredAt,
          paid: reg?.paid ?? false,
          paidAt: reg?.paidAt,
          paymentPlan: reg?.paymentPlan ?? false,
          ffaNumber: reg?.ffaNumber ?? null,
          gender: reg?.gender ?? null,
          schoolName: reg?.schoolName ?? null,
          comments: reg?.comments ?? null,
          competitionId: reg?.competitionId ?? null,
          teamId: reg?.teamId ?? null,
          teamName: team?.name ?? null,
          divisionId: reg?.divisionId ?? null,
          divisionName: division?.name ?? null,
          ageGroupKey: reg?.ageGroupKey ?? null,
          divisionColor: division?.color,
          paymentPlanStart: reg?.paymentPlanStart ?? null,
          paymentPlanEnd: reg?.paymentPlanEnd ?? null,
          kitColour: reg?.kitColour ?? team?.kitColour ?? null,
          grade: evs.length > 0 ? grade : null,
          scoredCount: evs.length,
          totalSkills: skills.filter((s) => s.active).length,
        };
      }),
    );
  },
});

/** Roster with each player's computed grade and matched division. */
export const playerRoster = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const skills = await ctx.db
      .query("soccerSkills")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const activeSkills = skills.filter((s) => s.active);
    const members = await ctx.db
      .query("members")
      .withIndex("by_org_and_status", (q) =>
        q.eq("orgId", auth.org._id).eq("status", "active"),
      )
      .collect();
    const divisions = await ctx.db
      .query("soccerDivisions")
      .withIndex("by_org_active", (q) =>
        q.eq("orgId", auth.org._id).eq("active", true),
      )
      .collect();
    const matchDivision = (grade: number) => {
      for (const d of divisions) {
        if (grade >= d.minGrade && grade <= d.maxGrade) return d;
      }
      return null;
    };
    return await Promise.all(
      members.map(async (m) => {
        const evals = await ctx.db
          .query("soccerEvaluations")
          .withIndex("by_member", (q) => q.eq("memberId", m._id))
          .collect();
        const evalMap = new Map(evals.map((e) => [e.skillId, e.score]));
        const grade = computeGrade(skills, evalMap);
        const division = matchDivision(grade);
        return {
          memberId: m._id,
          name: `${m.firstName} ${m.lastName}`.trim(),
          email: m.email,
          dateOfBirth: m.dateOfBirth,
          scoredCount: evals.length,
          totalSkills: activeSkills.length,
          grade,
          division: division
            ? { id: division._id, name: division.name, color: division.color }
            : null,
        };
      }),
    );
  },
});

/**
 * Aggregate stats for the soccer-mode dashboard widgets. Ports the
 * Belwest dashboard counts (registrations, payment, WWVP, grading
 * progress) into a single round-trip.
 */
export const dashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    if (!auth.org.soccerMode) return null;

    const activeMembers = await ctx.db
      .query("members")
      .withIndex("by_org_and_status", (q) =>
        q.eq("orgId", auth.org._id).eq("status", "active"),
      )
      .collect();
    const playerCount = activeMembers.length;

    const registrations = await ctx.db
      .query("soccerRegistrations")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    let registered = 0;
    let paid = 0;
    let onPaymentPlan = 0;
    let expiredPaymentPlans = 0;
    const todayIso = new Date().toISOString().slice(0, 10);
    for (const r of registrations) {
      if (r.registered) registered++;
      if (r.paid) paid++;
      if (r.paymentPlan) {
        onPaymentPlan++;
        if (r.paymentPlanEnd && r.paymentPlanEnd < todayIso) {
          expiredPaymentPlans++;
        }
      }
    }

    let coachCount = 0;
    let managerCount = 0;
    for (const m of activeMembers) {
      const role = (m.clubRole ?? "").toLowerCase();
      if (role === "coach") coachCount++;
      else if (role === "manager") managerCount++;
    }

    const wwvpRows = await ctx.db
      .query("soccerWwvp")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const wwvpByMember = new Map(wwvpRows.map((r) => [String(r.memberId), r]));
    let wwvpApproved = 0;
    let wwvpSighted = 0;
    let wwvpPending = 0;
    let wwvpNotProvided = 0;
    for (const m of activeMembers) {
      const role = (m.clubRole ?? "").toLowerCase();
      if (role !== "coach" && role !== "manager") continue;
      const w = wwvpByMember.get(String(m._id));
      const status = w?.status ?? "not_provided";
      if (status === "approved") wwvpApproved++;
      else if (status === "sighted") wwvpSighted++;
      else if (status === "pending") wwvpPending++;
      else wwvpNotProvided++;
    }

    const skills = await ctx.db
      .query("soccerSkills")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const activeSkillCount = skills.filter((s) => s.active).length;
    let evaluatedFully = 0;
    let evaluatedAny = 0;
    for (const m of activeMembers) {
      const evs = await ctx.db
        .query("soccerEvaluations")
        .withIndex("by_member", (q) => q.eq("memberId", m._id))
        .collect();
      if (evs.length === 0) continue;
      evaluatedAny++;
      if (activeSkillCount > 0 && evs.length >= activeSkillCount) {
        evaluatedFully++;
      }
    }

    const outstandingWwvp = wwvpPending + wwvpNotProvided;
    return {
      playerCount,
      registered,
      paid,
      unpaid: playerCount - paid,
      onPaymentPlan,
      expiredPaymentPlans,
      coachCount,
      managerCount,
      wwvpApproved,
      wwvpSighted,
      wwvpPending,
      wwvpNotProvided,
      outstandingWwvp,
      evaluatedAny,
      evaluatedFully,
      activeSkillCount,
    };
  },
});
