import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, requireRole, assertSameOrg } from "./lib/auth";
import { teamRoleValidator } from "./schema";

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
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    return await ctx.db.insert("teams", {
      orgId: auth.org._id,
      name: args.name.trim(),
      ageGroup: args.ageGroup,
      season: args.season,
      description: args.description,
      isActive: true,
    });
  },
});

export const update = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.optional(v.string()),
    ageGroup: v.optional(v.string()),
    season: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const team = await ctx.db.get(args.teamId);
    assertSameOrg(auth, team);
    const { teamId, ...rest } = args;
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(teamId, patch);
  },
});

export const remove = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "admin");
    const team = await ctx.db.get(args.teamId);
    assertSameOrg(auth, team);
    const links = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    for (const l of links) await ctx.db.delete(l._id);
    await ctx.db.delete(args.teamId);
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
