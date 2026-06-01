import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { assertSameOrg, requireOrgMember } from "./lib/auth";
import { requireCapability } from "./lib/capabilities";
import { requireModule } from "./lib/orgConfig";
import {
  rosterPositionForKey,
  rosterTemplateForSport,
  SPORT_ROSTER_TEMPLATES,
} from "./lib/sportRosterTemplates";
import {
  matchParticipationEventTypeValidator,
  matchParticipationStatusValidator,
  sportKeyValidator,
} from "./schema";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const nullableSquadMemberId = v.union(v.id("matchSquadMembers"), v.null());
const nullableMemberId = v.union(v.id("members"), v.null());

type AuthContext = Awaited<ReturnType<typeof requireOrgMember>>;

function cleanText(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function requireRosterRead(ctx: QueryCtx) {
  const auth = await requireOrgMember(ctx);
  await requireCapability(ctx, auth, "events.read");
  await requireModule(ctx, auth, "sport");
  return auth;
}

async function requireRosterWrite(ctx: MutationCtx) {
  const auth = await requireOrgMember(ctx);
  await requireCapability(ctx, auth, "events.write");
  await requireModule(ctx, auth, "sport");
  return auth;
}

async function assertFixture(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  id: Id<"fixtures">,
) {
  const fixture = await ctx.db.get(id);
  assertSameOrg(auth, fixture);
  if (!fixture) throw new ConvexError("Fixture not found.");
  return fixture;
}

async function assertTeam(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  id: Id<"teams">,
) {
  const team = await ctx.db.get(id);
  assertSameOrg(auth, team);
  if (!team) throw new ConvexError("Team not found.");
  return team;
}

async function assertMember(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  id: Id<"members">,
) {
  const member = await ctx.db.get(id);
  assertSameOrg(auth, member);
  if (!member) throw new ConvexError("Member not found.");
  return member;
}

async function assertSquad(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  id: Id<"matchSquads">,
) {
  const squad = await ctx.db.get(id);
  assertSameOrg(auth, squad);
  if (!squad) throw new ConvexError("Match squad not found.");
  return squad;
}

async function assertSquadMember(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  id: Id<"matchSquadMembers">,
) {
  const member = await ctx.db.get(id);
  assertSameOrg(auth, member);
  if (!member) throw new ConvexError("Squad member not found.");
  return member;
}

async function assertTeamMemberLink(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  teamId: Id<"teams">,
  memberId: Id<"members">,
) {
  await assertTeam(ctx, auth, teamId);
  await assertMember(ctx, auth, memberId);
  const link = await ctx.db
    .query("teamMembers")
    .withIndex("by_team_and_member", (q) =>
      q.eq("teamId", teamId).eq("memberId", memberId),
    )
    .unique();
  assertSameOrg(auth, link);
  if (!link || link.role !== "player") {
    throw new ConvexError("Member must be a player on this team.");
  }
  return link;
}

function statusEventType(
  status: Doc<"matchSquadMembers">["participationStatus"] | undefined,
) {
  switch (status) {
    case "arrived":
      return "arrived";
    case "unavailable":
      return "unavailable";
    case "injured":
      return "injured";
    case "substituted":
      return "substitution";
    case "interchanged":
      return "interchange";
    default:
      return "status_update";
  }
}

function validateTemplatePosition(
  sportKey: Doc<"matchSquads">["sportKey"],
  positionKey: string | undefined | null,
) {
  if (!positionKey) return undefined;
  const template = rosterTemplateForSport(sportKey);
  const position = rosterPositionForKey(template, positionKey);
  if (!position) {
    throw new ConvexError(
      `Position "${positionKey}" is not valid for ${template.label}.`,
    );
  }
  return position;
}

async function ensureSingleCaptaincy(
  ctx: MutationCtx,
  squadId: Id<"matchSquads">,
  memberId: Id<"matchSquadMembers">,
  field: "isCaptain" | "isViceCaptain",
) {
  const rows = await ctx.db
    .query("matchSquadMembers")
    .withIndex("by_squad", (q) => q.eq("squadId", squadId))
    .collect();
  for (const row of rows) {
    if (row._id !== memberId && row[field]) {
      await ctx.db.patch(row._id, { [field]: false, updatedAt: Date.now() });
    }
  }
}

async function nextSquadMemberOrder(
  ctx: QueryCtx | MutationCtx,
  squadId: Id<"matchSquads">,
) {
  const rows = await ctx.db
    .query("matchSquadMembers")
    .withIndex("by_squad", (q) => q.eq("squadId", squadId))
    .collect();
  return rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1;
}

async function hydrateSquad(ctx: QueryCtx, squad: Doc<"matchSquads">) {
  const [fixture, team, members, events] = await Promise.all([
    ctx.db.get(squad.fixtureId),
    ctx.db.get(squad.teamId),
    ctx.db
      .query("matchSquadMembers")
      .withIndex("by_squad", (q) => q.eq("squadId", squad._id))
      .collect(),
    ctx.db
      .query("matchParticipationEvents")
      .withIndex("by_squad", (q) => q.eq("squadId", squad._id))
      .collect(),
  ]);
  const template = rosterTemplateForSport(squad.sportKey ?? fixture?.sportKey);
  const hydratedMembers = await Promise.all(
    members
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(async (row) => {
        const member = await ctx.db.get(row.memberId);
        return {
          ...row,
          memberName: member
            ? `${member.firstName} ${member.lastName}`.trim()
            : "Unknown member",
          firstName: member?.firstName ?? null,
          lastName: member?.lastName ?? null,
          email: member?.email ?? null,
          phone: member?.phone ?? null,
        };
      }),
  );
  return {
    ...squad,
    fixtureTitle: fixture?.title ?? "Fixture",
    fixtureStartTime: fixture?.startTime ?? null,
    fixtureStatus: fixture?.status ?? null,
    teamName: team?.name ?? "Team",
    template,
    members: hydratedMembers,
    events: events.sort((a, b) => b.occurredAt - a.occurredAt),
  };
}

export const template = query({
  args: { sportKey: v.optional(sportKeyValidator) },
  handler: async (ctx, args) => {
    const auth = await requireRosterRead(ctx);
    return rosterTemplateForSport(args.sportKey ?? auth.org.sportKey);
  },
});

export const templates = query({
  args: {},
  handler: async (ctx) => {
    await requireRosterRead(ctx);
    return SPORT_ROSTER_TEMPLATES;
  },
});

export const listForFixture = query({
  args: { fixtureId: v.id("fixtures") },
  handler: async (ctx, args) => {
    const auth = await requireRosterRead(ctx);
    await assertFixture(ctx, auth, args.fixtureId);
    const squads = await ctx.db
      .query("matchSquads")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", args.fixtureId))
      .collect();
    return await Promise.all(squads.map((squad) => hydrateSquad(ctx, squad)));
  },
});

export const listMatchDay = query({
  args: {
    fixtureId: v.optional(v.id("fixtures")),
    teamId: v.optional(v.id("teams")),
    startFrom: v.optional(v.number()),
    startTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRosterRead(ctx);
    if (args.fixtureId) await assertFixture(ctx, auth, args.fixtureId);
    if (args.teamId) await assertTeam(ctx, auth, args.teamId);
    let squads = await ctx.db
      .query("matchSquads")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    if (args.fixtureId)
      squads = squads.filter((squad) => squad.fixtureId === args.fixtureId);
    if (args.teamId)
      squads = squads.filter((squad) => squad.teamId === args.teamId);

    if (args.startFrom !== undefined || args.startTo !== undefined) {
      const filtered: Doc<"matchSquads">[] = [];
      for (const squad of squads) {
        const fixture = await ctx.db.get(squad.fixtureId);
        if (!fixture) continue;
        if (args.startFrom !== undefined && fixture.startTime < args.startFrom)
          continue;
        if (args.startTo !== undefined && fixture.startTime > args.startTo)
          continue;
        filtered.push(squad);
      }
      squads = filtered;
    }

    const hydrated = await Promise.all(
      squads.map((squad) => hydrateSquad(ctx, squad)),
    );
    return hydrated.sort(
      (a, b) => (a.fixtureStartTime ?? 0) - (b.fixtureStartTime ?? 0),
    );
  },
});

export const upsertSquad = mutation({
  args: {
    id: v.optional(v.id("matchSquads")),
    fixtureId: v.id("fixtures"),
    teamId: v.id("teams"),
    name: v.optional(v.string()),
    notes: v.optional(nullableString),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRosterWrite(ctx);
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const id = ctx.db.normalizeId("matchSquads", replay.resultId);
      if (!id) throw new ConvexError("Invalid squad idempotency result.");
      return id;
    }
    if (replay) throw new ConvexError("Missing squad idempotency result.");

    const fixture = await assertFixture(ctx, auth, args.fixtureId);
    const team = await assertTeam(ctx, auth, args.teamId);
    const name = cleanText(args.name) ?? `${team.name} team sheet`;
    const now = Date.now();
    if (args.id) {
      const existing = await assertSquad(ctx, auth, args.id);
      await ctx.db.patch(args.id, {
        fixtureId: fixture._id,
        teamId: team._id,
        sportKey: fixture.sportKey ?? auth.org.sportKey,
        templateKey: rosterTemplateForSport(
          fixture.sportKey ?? auth.org.sportKey,
        ).sportKey,
        name,
        notes: args.notes === null ? undefined : cleanText(args.notes),
        updatedAt: now,
      });
      await recordClientMutation(
        ctx,
        auth,
        args.clientMutationId,
        "matchRosters:upsertSquad",
        String(existing._id),
      );
      return existing._id;
    }

    const id = await ctx.db.insert("matchSquads", {
      orgId: auth.org._id,
      fixtureId: fixture._id,
      teamId: team._id,
      sportKey: fixture.sportKey ?? auth.org.sportKey,
      templateKey: rosterTemplateForSport(fixture.sportKey ?? auth.org.sportKey)
        .sportKey,
      name,
      notes: cleanText(args.notes),
      updatedAt: now,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "matchRosters:upsertSquad",
      String(id),
    );
    return id;
  },
});

export const seedFromTeam = mutation({
  args: {
    fixtureId: v.id("fixtures"),
    teamId: v.id("teams"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRosterWrite(ctx);
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const id = ctx.db.normalizeId("matchSquads", replay.resultId);
      if (!id) throw new ConvexError("Invalid squad idempotency result.");
      return id;
    }
    if (replay) throw new ConvexError("Missing squad idempotency result.");

    const [fixture, team] = await Promise.all([
      assertFixture(ctx, auth, args.fixtureId),
      assertTeam(ctx, auth, args.teamId),
    ]);
    const now = Date.now();
    const existing = await ctx.db
      .query("matchSquads")
      .withIndex("by_fixture_team", (q) =>
        q.eq("fixtureId", fixture._id).eq("teamId", team._id),
      )
      .unique();
    const templateKey = rosterTemplateForSport(
      fixture.sportKey ?? auth.org.sportKey,
    ).sportKey;
    const squadId =
      existing?._id ??
      (await ctx.db.insert("matchSquads", {
        orgId: auth.org._id,
        fixtureId: fixture._id,
        teamId: team._id,
        sportKey: fixture.sportKey ?? auth.org.sportKey,
        templateKey,
        name: `${team.name} team sheet`,
        updatedAt: now,
      }));
    if (existing) {
      await ctx.db.patch(existing._id, {
        sportKey: fixture.sportKey ?? auth.org.sportKey,
        templateKey,
        updatedAt: now,
      });
    }

    const teamMembers = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect();
    const players = teamMembers
      .filter((row) => row.role === "player")
      .sort((a, b) => String(a.memberId).localeCompare(String(b.memberId)));
    let order = await nextSquadMemberOrder(ctx, squadId);
    for (const link of players) {
      const existingMember = await ctx.db
        .query("matchSquadMembers")
        .withIndex("by_squad_member", (q) =>
          q.eq("squadId", squadId).eq("memberId", link.memberId),
        )
        .unique();
      if (existingMember) {
        await ctx.db.patch(existingMember._id, {
          teamMemberId: link._id,
          planned: true,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("matchSquadMembers", {
          orgId: auth.org._id,
          fixtureId: fixture._id,
          teamId: team._id,
          squadId,
          memberId: link.memberId,
          teamMemberId: link._id,
          planned: true,
          participationStatus: "selected",
          sortOrder: order++,
          updatedAt: now,
        });
      }
    }
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "matchRosters:seedFromTeam",
      String(squadId),
    );
    return squadId;
  },
});

export const upsertSquadMember = mutation({
  args: {
    id: v.optional(v.id("matchSquadMembers")),
    squadId: v.id("matchSquads"),
    memberId: v.id("members"),
    planned: v.optional(v.boolean()),
    participationStatus: v.optional(matchParticipationStatusValidator),
    positionKey: v.optional(nullableString),
    jerseyNumber: v.optional(nullableString),
    bibNumber: v.optional(nullableString),
    isCaptain: v.optional(v.boolean()),
    isViceCaptain: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    notes: v.optional(nullableString),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRosterWrite(ctx);
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const id = ctx.db.normalizeId("matchSquadMembers", replay.resultId);
      if (!id) {
        throw new ConvexError("Invalid squad member idempotency result.");
      }
      return id;
    }
    if (replay) throw new ConvexError("Missing squad member result.");

    const squad = await assertSquad(ctx, auth, args.squadId);
    const teamLink = await assertTeamMemberLink(
      ctx,
      auth,
      squad.teamId,
      args.memberId,
    );
    const position =
      args.positionKey === undefined
        ? undefined
        : validateTemplatePosition(squad.sportKey, args.positionKey);
    const now = Date.now();

    if (args.id) {
      const existing = await assertSquadMember(ctx, auth, args.id);
      if (existing.squadId !== squad._id) {
        throw new ConvexError("Squad member does not belong to this squad.");
      }
      const patch = {
        memberId: args.memberId,
        teamMemberId: teamLink._id,
        planned: args.planned ?? existing.planned,
        participationStatus:
          args.participationStatus ?? existing.participationStatus,
        positionKey:
          args.positionKey === null
            ? undefined
            : args.positionKey === undefined
              ? existing.positionKey
              : position?.key,
        positionLabel:
          args.positionKey === null
            ? undefined
            : args.positionKey === undefined
              ? existing.positionLabel
              : position?.label,
        jerseyNumber:
          args.jerseyNumber === null
            ? undefined
            : args.jerseyNumber === undefined
              ? existing.jerseyNumber
              : cleanText(args.jerseyNumber),
        bibNumber:
          args.bibNumber === null
            ? undefined
            : args.bibNumber === undefined
              ? existing.bibNumber
              : cleanText(args.bibNumber),
        isCaptain: args.isCaptain ?? existing.isCaptain,
        isViceCaptain: args.isViceCaptain ?? existing.isViceCaptain,
        sortOrder: args.sortOrder ?? existing.sortOrder,
        notes:
          args.notes === null
            ? undefined
            : args.notes === undefined
              ? existing.notes
              : cleanText(args.notes),
        updatedAt: now,
      };
      await ctx.db.patch(existing._id, patch);
      if (args.isCaptain) {
        await ensureSingleCaptaincy(ctx, squad._id, existing._id, "isCaptain");
      }
      if (args.isViceCaptain) {
        await ensureSingleCaptaincy(
          ctx,
          squad._id,
          existing._id,
          "isViceCaptain",
        );
      }
      await recordClientMutation(
        ctx,
        auth,
        args.clientMutationId,
        "matchRosters:upsertSquadMember",
        String(existing._id),
      );
      return existing._id;
    }

    const existingForMember = await ctx.db
      .query("matchSquadMembers")
      .withIndex("by_squad_member", (q) =>
        q.eq("squadId", squad._id).eq("memberId", args.memberId),
      )
      .unique();
    if (existingForMember) {
      await ctx.db.patch(existingForMember._id, {
        planned: args.planned ?? existingForMember.planned,
        participationStatus:
          args.participationStatus ?? existingForMember.participationStatus,
        positionKey:
          args.positionKey === null
            ? undefined
            : args.positionKey === undefined
              ? existingForMember.positionKey
              : position?.key,
        positionLabel:
          args.positionKey === null
            ? undefined
            : args.positionKey === undefined
              ? existingForMember.positionLabel
              : position?.label,
        jerseyNumber:
          args.jerseyNumber === null
            ? undefined
            : args.jerseyNumber === undefined
              ? existingForMember.jerseyNumber
              : cleanText(args.jerseyNumber),
        bibNumber:
          args.bibNumber === null
            ? undefined
            : args.bibNumber === undefined
              ? existingForMember.bibNumber
              : cleanText(args.bibNumber),
        isCaptain: args.isCaptain ?? existingForMember.isCaptain,
        isViceCaptain: args.isViceCaptain ?? existingForMember.isViceCaptain,
        sortOrder: args.sortOrder ?? existingForMember.sortOrder,
        notes:
          args.notes === null
            ? undefined
            : args.notes === undefined
              ? existingForMember.notes
              : cleanText(args.notes),
        updatedAt: now,
      });
      if (args.isCaptain) {
        await ensureSingleCaptaincy(
          ctx,
          squad._id,
          existingForMember._id,
          "isCaptain",
        );
      }
      if (args.isViceCaptain) {
        await ensureSingleCaptaincy(
          ctx,
          squad._id,
          existingForMember._id,
          "isViceCaptain",
        );
      }
      await recordClientMutation(
        ctx,
        auth,
        args.clientMutationId,
        "matchRosters:upsertSquadMember",
        String(existingForMember._id),
      );
      return existingForMember._id;
    }

    const id = await ctx.db.insert("matchSquadMembers", {
      orgId: auth.org._id,
      fixtureId: squad.fixtureId,
      teamId: squad.teamId,
      squadId: squad._id,
      memberId: args.memberId,
      teamMemberId: teamLink._id,
      planned: args.planned ?? true,
      participationStatus: args.participationStatus ?? "selected",
      positionKey: position?.key,
      positionLabel: position?.label,
      jerseyNumber: cleanText(args.jerseyNumber),
      bibNumber: cleanText(args.bibNumber),
      isCaptain: args.isCaptain,
      isViceCaptain: args.isViceCaptain,
      sortOrder: args.sortOrder ?? (await nextSquadMemberOrder(ctx, squad._id)),
      notes: cleanText(args.notes),
      updatedAt: now,
    });
    if (args.isCaptain)
      await ensureSingleCaptaincy(ctx, squad._id, id, "isCaptain");
    if (args.isViceCaptain) {
      await ensureSingleCaptaincy(ctx, squad._id, id, "isViceCaptain");
    }
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "matchRosters:upsertSquadMember",
      String(id),
    );
    return id;
  },
});

export const updateParticipation = mutation({
  args: {
    squadMemberId: v.id("matchSquadMembers"),
    participationStatus: v.optional(matchParticipationStatusValidator),
    positionKey: v.optional(nullableString),
    jerseyNumber: v.optional(nullableString),
    bibNumber: v.optional(nullableString),
    isCaptain: v.optional(v.boolean()),
    isViceCaptain: v.optional(v.boolean()),
    period: v.optional(nullableString),
    atMinute: v.optional(nullableNumber),
    notes: v.optional(nullableString),
    eventType: v.optional(matchParticipationEventTypeValidator),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRosterWrite(ctx);
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return;

    const row = await assertSquadMember(ctx, auth, args.squadMemberId);
    const squad = await assertSquad(ctx, auth, row.squadId);
    const position =
      args.positionKey === undefined
        ? undefined
        : validateTemplatePosition(squad.sportKey, args.positionKey);
    const now = Date.now();
    await ctx.db.patch(row._id, {
      participationStatus: args.participationStatus ?? row.participationStatus,
      positionKey:
        args.positionKey === null
          ? undefined
          : args.positionKey === undefined
            ? row.positionKey
            : position?.key,
      positionLabel:
        args.positionKey === null
          ? undefined
          : args.positionKey === undefined
            ? row.positionLabel
            : position?.label,
      jerseyNumber:
        args.jerseyNumber === null
          ? undefined
          : args.jerseyNumber === undefined
            ? row.jerseyNumber
            : cleanText(args.jerseyNumber),
      bibNumber:
        args.bibNumber === null
          ? undefined
          : args.bibNumber === undefined
            ? row.bibNumber
            : cleanText(args.bibNumber),
      isCaptain: args.isCaptain ?? row.isCaptain,
      isViceCaptain: args.isViceCaptain ?? row.isViceCaptain,
      notes:
        args.notes === null
          ? undefined
          : args.notes === undefined
            ? row.notes
            : cleanText(args.notes),
      updatedAt: now,
    });
    if (args.isCaptain) {
      await ensureSingleCaptaincy(ctx, squad._id, row._id, "isCaptain");
    }
    if (args.isViceCaptain) {
      await ensureSingleCaptaincy(ctx, squad._id, row._id, "isViceCaptain");
    }
    await ctx.db.insert("matchParticipationEvents", {
      orgId: auth.org._id,
      fixtureId: row.fixtureId,
      teamId: row.teamId,
      squadId: row.squadId,
      squadMemberId: row._id,
      memberId: row.memberId,
      eventType:
        args.eventType ??
        (args.positionKey !== undefined
          ? "position_change"
          : args.isCaptain !== undefined || args.isViceCaptain !== undefined
            ? "captaincy_change"
            : statusEventType(args.participationStatus)),
      period: args.period === null ? undefined : cleanText(args.period),
      atMinute: args.atMinute ?? undefined,
      positionKey:
        args.positionKey === null
          ? undefined
          : args.positionKey === undefined
            ? row.positionKey
            : position?.key,
      notes: args.notes === null ? undefined : cleanText(args.notes),
      recordedBy: auth.user._id,
      occurredAt: now,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "matchRosters:updateParticipation",
      String(row._id),
    );
  },
});

export const recordParticipationEvent = mutation({
  args: {
    squadId: v.id("matchSquads"),
    squadMemberId: v.optional(nullableSquadMemberId),
    memberId: v.optional(nullableMemberId),
    eventType: matchParticipationEventTypeValidator,
    period: v.optional(nullableString),
    atMinute: v.optional(nullableNumber),
    positionKey: v.optional(nullableString),
    notes: v.optional(nullableString),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRosterWrite(ctx);
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return;
    const squad = await assertSquad(ctx, auth, args.squadId);
    const squadMember =
      args.squadMemberId === null || args.squadMemberId === undefined
        ? null
        : await assertSquadMember(ctx, auth, args.squadMemberId);
    const member =
      args.memberId === null || args.memberId === undefined
        ? null
        : await assertMember(ctx, auth, args.memberId);
    const position =
      args.positionKey === undefined || args.positionKey === null
        ? undefined
        : validateTemplatePosition(squad.sportKey, args.positionKey)?.key;
    await ctx.db.insert("matchParticipationEvents", {
      orgId: auth.org._id,
      fixtureId: squad.fixtureId,
      teamId: squad.teamId,
      squadId: squad._id,
      squadMemberId: squadMember?._id,
      memberId: squadMember?.memberId ?? member?._id,
      eventType: args.eventType,
      period: args.period === null ? undefined : cleanText(args.period),
      atMinute: args.atMinute ?? undefined,
      positionKey: position,
      notes: args.notes === null ? undefined : cleanText(args.notes),
      recordedBy: auth.user._id,
      occurredAt: Date.now(),
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "matchRosters:recordParticipationEvent",
    );
  },
});

export const removeSquadMember = mutation({
  args: {
    squadMemberId: v.id("matchSquadMembers"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRosterWrite(ctx);
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return;
    const row = await assertSquadMember(ctx, auth, args.squadMemberId);
    const events = await ctx.db
      .query("matchParticipationEvents")
      .withIndex("by_member", (q) => q.eq("memberId", row.memberId))
      .collect();
    for (const event of events.filter(
      (event) => event.squadMemberId === row._id,
    )) {
      await ctx.db.delete(event._id);
    }
    await ctx.db.delete(row._id);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "matchRosters:removeSquadMember",
      String(row._id),
    );
  },
});
