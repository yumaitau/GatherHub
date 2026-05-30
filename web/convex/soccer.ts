import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireOrgMember, requireRole, assertSameOrg } from "./lib/auth";

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

const DEFAULT_DIVISIONS: Array<{
  name: string;
  minGrade: number;
  maxGrade: number;
  color: string;
}> = [
  { name: "Division 1", minGrade: 75, maxGrade: 100, color: "#bf0000" },
  { name: "Division 2", minGrade: 55, maxGrade: 74.99, color: "#d97706" },
  { name: "Division 3", minGrade: 35, maxGrade: 54.99, color: "#0891b2" },
  { name: "Division 4", minGrade: 0, maxGrade: 34.99, color: "#4b5563" },
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
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
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
      return args.id;
    }
    const last = await ctx.db
      .query("soccerDivisions")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .order("desc")
      .first();
    return await ctx.db.insert("soccerDivisions", {
      orgId: auth.org._id,
      name: args.name.trim(),
      minGrade: args.minGrade,
      maxGrade: args.maxGrade,
      color: args.color,
      order: last ? last.order + 1 : 0,
      active: true,
    });
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
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    await assertSoccerMode(ctx, auth.org._id);
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
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
        if (args[key] !== undefined) patch[key] = args[key];
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
      return existing._id;
    }
    return await ctx.db.insert("soccerRegistrations", {
      orgId: auth.org._id,
      memberId: args.memberId,
      competitionId: args.competitionId,
      ageGroupKey: args.ageGroupKey,
      divisionId: args.divisionId,
      teamId: args.teamId,
      ffaNumber: args.ffaNumber,
      gender: args.gender,
      schoolName: args.schoolName,
      registered: args.registered ?? false,
      registeredAt: args.registered ? now : undefined,
      paid: args.paid ?? false,
      paidAt: args.paid ? now : undefined,
      paymentPlan: args.paymentPlan,
      paymentPlanStart: args.paymentPlanStart,
      paymentPlanEnd: args.paymentPlanEnd,
      comments: args.comments,
    });
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
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
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
      return existing._id;
    }
    return await ctx.db.insert("soccerEvaluations", {
      orgId: auth.org._id,
      memberId: args.memberId,
      skillId: args.skillId,
      score: args.score,
      notes: args.notes,
      evaluatedBy: auth.user._id,
      evaluatedAt: now,
    });
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
