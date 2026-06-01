import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, requireRole, assertSameOrg } from "./lib/auth";
import { teamRoleValidator } from "./schema";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";

const nullableString = v.union(v.string(), v.null());

export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const visible = args.includeInactive
      ? teams
      : teams.filter((t) => t.isActive);

    // Attach roster counts.
    return await Promise.all(
      visible
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (team) => {
          const members = await ctx.db
            .query("teamMembers")
            .withIndex("by_team", (q) => q.eq("teamId", team._id))
            .collect();
          return {
            ...team,
            playerCount: members.filter((m) => m.role === "player").length,
            staffCount: members.filter((m) => m.role !== "player").length,
          };
        }),
    );
  },
});

export const get = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const team = await ctx.db.get(args.teamId);
    assertSameOrg(auth, team);
    if (!team) throw new Error("Not found.");

    const links = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect();
    const roster = await Promise.all(
      links.map(async (link) => ({
        link,
        member: await ctx.db.get(link.memberId),
      })),
    );

    return {
      team,
      players: roster.filter((r) => r.link.role === "player"),
      staff: roster.filter((r) => r.link.role !== "player"),
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    ageGroup: v.optional(v.string()),
    season: v.optional(v.string()),
    description: v.optional(v.string()),
    kitColour: v.optional(v.string()),
    kitBagNumber: v.optional(v.string()),
    competitionId: v.optional(v.id("soccerCompetitions")),
    divisionId: v.optional(v.id("soccerDivisions")),
    coach: v.optional(v.string()),
    coachEmail: v.optional(v.string()),
    coachPhone: v.optional(v.string()),
    additionalCoach: v.optional(v.string()),
    additionalCoachEmail: v.optional(v.string()),
    additionalCoachPhone: v.optional(v.string()),
    manager: v.optional(v.string()),
    managerEmail: v.optional(v.string()),
    managerPhone: v.optional(v.string()),
    teamRegistered: v.optional(v.boolean()),
    teamRegisteredDate: v.optional(v.string()),
    teamRegistrationPaid: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const teamId = ctx.db.normalizeId("teams", replay.resultId);
      if (!teamId) throw new Error("Invalid team idempotency result.");
      return teamId;
    }
    if (replay) throw new Error("Missing team idempotency result.");
    if (args.competitionId !== undefined) {
      const comp = await ctx.db.get(args.competitionId);
      assertSameOrg(auth, comp);
    }
    if (args.divisionId !== undefined) {
      const div = await ctx.db.get(args.divisionId);
      assertSameOrg(auth, div);
    }
    const teamId = await ctx.db.insert("teams", {
      orgId: auth.org._id,
      name: args.name.trim(),
      ageGroup: args.ageGroup,
      season: args.season,
      description: args.description,
      isActive: true,
      kitColour: args.kitColour,
      kitBagNumber: args.kitBagNumber,
      competitionId: args.competitionId,
      divisionId: args.divisionId,
      coach: args.coach,
      coachEmail: args.coachEmail,
      coachPhone: args.coachPhone,
      additionalCoach: args.additionalCoach,
      additionalCoachEmail: args.additionalCoachEmail,
      additionalCoachPhone: args.additionalCoachPhone,
      manager: args.manager,
      managerEmail: args.managerEmail,
      managerPhone: args.managerPhone,
      teamRegistered: args.teamRegistered,
      teamRegisteredDate: args.teamRegisteredDate,
      teamRegistrationPaid: args.teamRegistrationPaid,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "teams:create",
      String(teamId),
    );
    return teamId;
  },
});

export const update = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.optional(v.string()),
    ageGroup: v.optional(nullableString),
    season: v.optional(nullableString),
    description: v.optional(nullableString),
    isActive: v.optional(v.boolean()),
    kitColour: v.optional(nullableString),
    kitBagNumber: v.optional(nullableString),
    competitionId: v.optional(v.union(v.id("soccerCompetitions"), v.null())),
    divisionId: v.optional(v.union(v.id("soccerDivisions"), v.null())),
    coach: v.optional(nullableString),
    coachEmail: v.optional(nullableString),
    coachPhone: v.optional(nullableString),
    additionalCoach: v.optional(nullableString),
    additionalCoachEmail: v.optional(nullableString),
    additionalCoachPhone: v.optional(nullableString),
    manager: v.optional(nullableString),
    managerEmail: v.optional(nullableString),
    managerPhone: v.optional(nullableString),
    teamRegistered: v.optional(v.boolean()),
    teamRegisteredDate: v.optional(nullableString),
    teamRegistrationPaid: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return;
    const team = await ctx.db.get(args.teamId);
    assertSameOrg(auth, team);
    if (args.competitionId !== undefined && args.competitionId !== null) {
      const comp = await ctx.db.get(args.competitionId);
      assertSameOrg(auth, comp);
    }
    if (args.divisionId !== undefined && args.divisionId !== null) {
      const div = await ctx.db.get(args.divisionId);
      assertSameOrg(auth, div);
    }
    const { teamId, clientMutationId, ...rest } = args;
    const patch = Object.fromEntries(
      Object.entries(rest)
        .filter(([, v]) => v !== undefined)
        .map(([key, value]) => [key, value === null ? undefined : value]),
    );
    await ctx.db.patch(teamId, patch);
    await recordClientMutation(
      ctx,
      auth,
      clientMutationId,
      "teams:update",
      String(teamId),
    );
  },
});

export const remove = mutation({
  args: {
    teamId: v.id("teams"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const team = await ctx.db.get(args.teamId);
    assertSameOrg(auth, team);
    const links = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    for (const l of links) await ctx.db.delete(l._id);
    await ctx.db.delete(args.teamId);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "teams:remove",
      String(args.teamId),
    );
  },
});

export const assignMember = mutation({
  args: {
    teamId: v.id("teams"),
    memberId: v.id("members"),
    role: teamRoleValidator,
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
    const team = await ctx.db.get(args.teamId);
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, team);
    assertSameOrg(auth, member);

    const existing = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_and_member", (q) =>
        q.eq("teamId", args.teamId).eq("memberId", args.memberId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { role: args.role });
      return existing._id;
    }
    return await ctx.db.insert("teamMembers", {
      orgId: auth.org._id,
      teamId: args.teamId,
      memberId: args.memberId,
      role: args.role,
    });
  },
});

export const unassignMember = mutation({
  args: { linkId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
    const link = await ctx.db.get(args.linkId);
    assertSameOrg(auth, link);
    await ctx.db.delete(args.linkId);
  },
});
