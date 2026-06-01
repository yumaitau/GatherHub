import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { assertSameOrg, requireOrgMember } from "./lib/auth";
import { requireCapability } from "./lib/capabilities";
import { requireModule, type SportKey } from "./lib/orgConfig";
import {
  fixtureStatusValidator,
  fixtureTeamSideValidator,
  sportKeyValidator,
} from "./schema";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const nullableSeasonId = v.union(v.id("seasons"), v.null());
const nullableCompetitionId = v.union(v.id("sportCompetitions"), v.null());
const nullableDivisionId = v.union(v.id("sportDivisions"), v.null());
const nullableVenueId = v.union(v.id("venues"), v.null());
const nullableTeamId = v.union(v.id("teams"), v.null());
const nullableMemberId = v.union(v.id("members"), v.null());

function cleanText(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function requireFixtureRead(ctx: QueryCtx) {
  const auth = await requireOrgMember(ctx);
  await requireCapability(ctx, auth, "events.read");
  await requireModule(ctx, auth, "sport");
  return auth;
}

async function requireFixtureWrite(ctx: MutationCtx) {
  const auth = await requireOrgMember(ctx);
  await requireCapability(ctx, auth, "events.write");
  await requireModule(ctx, auth, "sport");
  return auth;
}

async function requireFixtureDelete(ctx: MutationCtx) {
  const auth = await requireOrgMember(ctx);
  await requireCapability(ctx, auth, "events.delete");
  await requireModule(ctx, auth, "sport");
  return auth;
}

async function recordFixtureAudit(
  ctx: MutationCtx,
  args: {
    orgId: Id<"organizations">;
    actorUserId: Id<"users">;
    fixtureId?: Id<"fixtures">;
    action: string;
    metadata?: Record<string, unknown>;
  },
) {
  await ctx.db.insert("fixtureAuditLog", {
    orgId: args.orgId,
    actorUserId: args.actorUserId,
    fixtureId: args.fixtureId,
    action: args.action,
    metadataJson: args.metadata ? JSON.stringify(args.metadata) : undefined,
    createdAt: Date.now(),
  });
}

async function assertSeason(
  ctx: QueryCtx | MutationCtx,
  auth: Awaited<ReturnType<typeof requireOrgMember>>,
  id: Id<"seasons"> | null | undefined,
) {
  if (!id) return null;
  const row = await ctx.db.get(id);
  assertSameOrg(auth, row);
  return row;
}

async function assertCompetition(
  ctx: QueryCtx | MutationCtx,
  auth: Awaited<ReturnType<typeof requireOrgMember>>,
  id: Id<"sportCompetitions"> | null | undefined,
) {
  if (!id) return null;
  const row = await ctx.db.get(id);
  assertSameOrg(auth, row);
  return row;
}

async function assertDivision(
  ctx: QueryCtx | MutationCtx,
  auth: Awaited<ReturnType<typeof requireOrgMember>>,
  id: Id<"sportDivisions"> | null | undefined,
) {
  if (!id) return null;
  const row = await ctx.db.get(id);
  assertSameOrg(auth, row);
  return row;
}

async function assertVenue(
  ctx: QueryCtx | MutationCtx,
  auth: Awaited<ReturnType<typeof requireOrgMember>>,
  id: Id<"venues"> | null | undefined,
) {
  if (!id) return null;
  const row = await ctx.db.get(id);
  assertSameOrg(auth, row);
  return row;
}

async function assertTeam(
  ctx: QueryCtx | MutationCtx,
  auth: Awaited<ReturnType<typeof requireOrgMember>>,
  id: Id<"teams"> | null | undefined,
) {
  if (!id) return null;
  const row = await ctx.db.get(id);
  assertSameOrg(auth, row);
  return row;
}

async function assertMember(
  ctx: QueryCtx | MutationCtx,
  auth: Awaited<ReturnType<typeof requireOrgMember>>,
  id: Id<"members"> | null | undefined,
) {
  if (!id) return null;
  const row = await ctx.db.get(id);
  assertSameOrg(auth, row);
  return row;
}

async function assertFixture(
  ctx: QueryCtx | MutationCtx,
  auth: Awaited<ReturnType<typeof requireOrgMember>>,
  id: Id<"fixtures">,
) {
  const row = await ctx.db.get(id);
  assertSameOrg(auth, row);
  if (!row) throw new ConvexError("Fixture not found.");
  return row;
}

async function nextSeasonOrder(ctx: MutationCtx, orgId: Id<"organizations">) {
  const rows = await ctx.db
    .query("seasons")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  return rows.reduce((max, row) => Math.max(max, row.order), 0) + 1;
}

async function nextCompetitionOrder(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
) {
  const rows = await ctx.db
    .query("sportCompetitions")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  return rows.reduce((max, row) => Math.max(max, row.order), 0) + 1;
}

async function nextDivisionOrder(ctx: MutationCtx, orgId: Id<"organizations">) {
  const rows = await ctx.db
    .query("sportDivisions")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  return rows.reduce((max, row) => Math.max(max, row.order), 0) + 1;
}

function defaultCompetitionNames(sportKey: SportKey | undefined) {
  switch (sportKey) {
    case "rugby_union":
      return ["Junior rugby", "Senior rugby", "Sevens"];
    case "rugby_league":
      return ["Junior league", "Senior league", "Nines"];
    case "cricket":
      return ["One day", "T20", "Training matches"];
    case "hockey":
      return ["Outdoor", "Indoor", "Hockey5s"];
    case "netball":
      return ["Junior netball", "Senior netball", "Mixed"];
    case "basketball":
      return ["Junior basketball", "Senior basketball", "3x3"];
    case "soccer":
      return ["League", "Cup", "Friendlies"];
    default:
      return ["League", "Cup", "Friendlies"];
  }
}

function defaultDivisionNames(sportKey: SportKey | undefined) {
  switch (sportKey) {
    case "cricket":
    case "rugby_union":
    case "rugby_league":
    case "netball":
    case "basketball":
      return ["Junior", "Intermediate", "Senior"];
    case "hockey":
      return ["Junior", "Senior", "Masters"];
    default:
      return ["Division 1", "Division 2", "Development"];
  }
}

export async function seedSportDefaultsForOrg(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  sportKey: SportKey | undefined,
) {
  const existing = await ctx.db
    .query("seasons")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .first();
  if (existing) return;

  const now = Date.now();
  const year = new Date(now).getFullYear();
  const seasonId = await ctx.db.insert("seasons", {
    orgId,
    sportKey,
    name: `${year} season`,
    active: true,
    isDefault: true,
    order: 1,
    updatedAt: now,
  });

  let order = 1;
  for (const name of defaultCompetitionNames(sportKey)) {
    await ctx.db.insert("sportCompetitions", {
      orgId,
      sportKey,
      seasonId,
      name,
      active: true,
      order: order++,
      updatedAt: now,
    });
  }

  order = 1;
  for (const name of defaultDivisionNames(sportKey)) {
    await ctx.db.insert("sportDivisions", {
      orgId,
      sportKey,
      name,
      active: true,
      order: order++,
      updatedAt: now,
    });
  }
}

export const listSeasons = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const auth = await requireFixtureRead(ctx);
    const rows = await ctx.db
      .query("seasons")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    return args.includeInactive ? rows : rows.filter((row) => row.active);
  },
});

export const upsertSeason = mutation({
  args: {
    id: v.optional(v.id("seasons")),
    name: v.string(),
    startsOn: v.optional(nullableString),
    endsOn: v.optional(nullableString),
    active: v.optional(v.boolean()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFixtureWrite(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Season name is required.");
    const now = Date.now();
    if (args.id) {
      const existing = await assertSeason(ctx, auth, args.id);
      if (!existing) throw new ConvexError("Season not found.");
      await ctx.db.patch(args.id, {
        name,
        startsOn: args.startsOn === null ? undefined : cleanText(args.startsOn),
        endsOn: args.endsOn === null ? undefined : cleanText(args.endsOn),
        active: args.active ?? existing.active,
        isDefault: args.isDefault ?? existing.isDefault,
        updatedAt: now,
      });
      await recordFixtureAudit(ctx, {
        orgId: auth.org._id,
        actorUserId: auth.user._id,
        action: "season.updated",
        metadata: { seasonId: args.id, name },
      });
      return args.id;
    }
    const id = await ctx.db.insert("seasons", {
      orgId: auth.org._id,
      sportKey: auth.org.sportKey,
      name,
      startsOn: cleanText(args.startsOn),
      endsOn: cleanText(args.endsOn),
      active: args.active ?? true,
      isDefault: args.isDefault,
      order: await nextSeasonOrder(ctx, auth.org._id),
      updatedAt: now,
    });
    await recordFixtureAudit(ctx, {
      orgId: auth.org._id,
      actorUserId: auth.user._id,
      action: "season.created",
      metadata: { seasonId: id, name },
    });
    return id;
  },
});

export const listCompetitions = query({
  args: {
    includeInactive: v.optional(v.boolean()),
    seasonId: v.optional(v.id("seasons")),
  },
  handler: async (ctx, args) => {
    const auth = await requireFixtureRead(ctx);
    let rows = await ctx.db
      .query("sportCompetitions")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    if (args.seasonId)
      rows = rows.filter((row) => row.seasonId === args.seasonId);
    return args.includeInactive ? rows : rows.filter((row) => row.active);
  },
});

export const upsertCompetition = mutation({
  args: {
    id: v.optional(v.id("sportCompetitions")),
    name: v.string(),
    seasonId: v.optional(nullableSeasonId),
    format: v.optional(nullableString),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFixtureWrite(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Competition name is required.");
    const season = await assertSeason(ctx, auth, args.seasonId);
    const now = Date.now();
    if (args.id) {
      const existing = await assertCompetition(ctx, auth, args.id);
      if (!existing) throw new ConvexError("Competition not found.");
      await ctx.db.patch(args.id, {
        name,
        seasonId:
          args.seasonId === null
            ? undefined
            : args.seasonId === undefined
              ? existing.seasonId
              : season?._id,
        format: args.format === null ? undefined : cleanText(args.format),
        active: args.active ?? existing.active,
        updatedAt: now,
      });
      return args.id;
    }
    return await ctx.db.insert("sportCompetitions", {
      orgId: auth.org._id,
      sportKey: auth.org.sportKey,
      seasonId: season?._id,
      name,
      format: cleanText(args.format),
      active: args.active ?? true,
      order: await nextCompetitionOrder(ctx, auth.org._id),
      updatedAt: now,
    });
  },
});

export const listDivisions = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const auth = await requireFixtureRead(ctx);
    const rows = await ctx.db
      .query("sportDivisions")
      .withIndex("by_org_order", (q) => q.eq("orgId", auth.org._id))
      .collect();
    return args.includeInactive ? rows : rows.filter((row) => row.active);
  },
});

export const upsertDivision = mutation({
  args: {
    id: v.optional(v.id("sportDivisions")),
    name: v.string(),
    ageGroupKey: v.optional(nullableString),
    color: v.optional(nullableString),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFixtureWrite(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Division name is required.");
    const now = Date.now();
    if (args.id) {
      const existing = await assertDivision(ctx, auth, args.id);
      if (!existing) throw new ConvexError("Division not found.");
      await ctx.db.patch(args.id, {
        name,
        ageGroupKey:
          args.ageGroupKey === null ? undefined : cleanText(args.ageGroupKey),
        color: args.color === null ? undefined : cleanText(args.color),
        active: args.active ?? existing.active,
        updatedAt: now,
      });
      return args.id;
    }
    return await ctx.db.insert("sportDivisions", {
      orgId: auth.org._id,
      sportKey: auth.org.sportKey,
      name,
      ageGroupKey: cleanText(args.ageGroupKey),
      color: cleanText(args.color),
      active: args.active ?? true,
      order: await nextDivisionOrder(ctx, auth.org._id),
      updatedAt: now,
    });
  },
});

export const listVenues = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const auth = await requireFixtureRead(ctx);
    const rows = await ctx.db
      .query("venues")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const visible = args.includeInactive
      ? rows
      : rows.filter((row) => row.active);
    return visible.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const upsertVenue = mutation({
  args: {
    id: v.optional(v.id("venues")),
    name: v.string(),
    address: v.optional(nullableString),
    fieldName: v.optional(nullableString),
    notes: v.optional(nullableString),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFixtureWrite(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Venue name is required.");
    const patch = {
      name,
      address: args.address === null ? undefined : cleanText(args.address),
      fieldName:
        args.fieldName === null ? undefined : cleanText(args.fieldName),
      notes: args.notes === null ? undefined : cleanText(args.notes),
      active: args.active ?? true,
      updatedAt: Date.now(),
    };
    if (args.id) {
      const existing = await assertVenue(ctx, auth, args.id);
      if (!existing) throw new ConvexError("Venue not found.");
      await ctx.db.patch(args.id, {
        ...patch,
        active: args.active ?? existing.active,
      });
      return args.id;
    }
    return await ctx.db.insert("venues", {
      orgId: auth.org._id,
      ...patch,
    });
  },
});

export const listFixtures = query({
  args: {
    startFrom: v.optional(v.number()),
    startTo: v.optional(v.number()),
    seasonId: v.optional(v.id("seasons")),
    competitionId: v.optional(v.id("sportCompetitions")),
    divisionId: v.optional(v.id("sportDivisions")),
    venueId: v.optional(v.id("venues")),
    teamId: v.optional(v.id("teams")),
    status: v.optional(fixtureStatusValidator),
  },
  handler: async (ctx, args) => {
    const auth = await requireFixtureRead(ctx);
    let fixtures = await ctx.db
      .query("fixtures")
      .withIndex("by_org_start", (q) => q.eq("orgId", auth.org._id))
      .collect();
    if (args.startFrom !== undefined) {
      fixtures = fixtures.filter((row) => row.startTime >= args.startFrom!);
    }
    if (args.startTo !== undefined) {
      fixtures = fixtures.filter((row) => row.startTime <= args.startTo!);
    }
    if (args.seasonId)
      fixtures = fixtures.filter((row) => row.seasonId === args.seasonId);
    if (args.competitionId) {
      fixtures = fixtures.filter(
        (row) => row.competitionId === args.competitionId,
      );
    }
    if (args.divisionId)
      fixtures = fixtures.filter((row) => row.divisionId === args.divisionId);
    if (args.venueId)
      fixtures = fixtures.filter((row) => row.venueId === args.venueId);
    if (args.status)
      fixtures = fixtures.filter((row) => row.status === args.status);
    if (args.teamId) {
      await assertTeam(ctx, auth, args.teamId);
      const fixtureTeams = await ctx.db
        .query("fixtureTeams")
        .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
        .collect();
      const ids = new Set(fixtureTeams.map((row) => row.fixtureId));
      fixtures = fixtures.filter((row) => ids.has(row._id));
    }
    return await Promise.all(
      fixtures.map((fixture) => hydrateFixture(ctx, fixture)),
    );
  },
});

export const getFixture = query({
  args: { fixtureId: v.id("fixtures") },
  handler: async (ctx, args) => {
    const auth = await requireFixtureRead(ctx);
    const fixture = await assertFixture(ctx, auth, args.fixtureId);
    return await hydrateFixture(ctx, fixture);
  },
});

async function hydrateFixture(ctx: QueryCtx, fixture: Doc<"fixtures">) {
  const [season, competition, division, venue, teams, officials] =
    await Promise.all([
      fixture.seasonId ? ctx.db.get(fixture.seasonId) : null,
      fixture.competitionId ? ctx.db.get(fixture.competitionId) : null,
      fixture.divisionId ? ctx.db.get(fixture.divisionId) : null,
      fixture.venueId ? ctx.db.get(fixture.venueId) : null,
      ctx.db
        .query("fixtureTeams")
        .withIndex("by_fixture", (q) => q.eq("fixtureId", fixture._id))
        .collect(),
      ctx.db
        .query("officialAssignments")
        .withIndex("by_fixture", (q) => q.eq("fixtureId", fixture._id))
        .collect(),
    ]);
  const hydratedTeams = await Promise.all(
    teams
      .sort((a, b) => a.order - b.order)
      .map(async (row) => ({
        ...row,
        teamName: row.teamId
          ? ((await ctx.db.get(row.teamId))?.name ?? null)
          : null,
      })),
  );
  return {
    ...fixture,
    seasonName: season?.name ?? null,
    competitionName: competition?.name ?? null,
    divisionName: division?.name ?? null,
    venueName: venue?.name ?? null,
    venueAddress: venue?.address ?? null,
    teams: hydratedTeams,
    officials,
  };
}

export const upsertFixture = mutation({
  args: {
    id: v.optional(v.id("fixtures")),
    title: v.string(),
    seasonId: v.optional(nullableSeasonId),
    competitionId: v.optional(nullableCompetitionId),
    divisionId: v.optional(nullableDivisionId),
    venueId: v.optional(nullableVenueId),
    roundNumber: v.optional(nullableNumber),
    roundName: v.optional(nullableString),
    fieldName: v.optional(nullableString),
    startTime: v.number(),
    endTime: v.optional(nullableNumber),
    status: v.optional(fixtureStatusValidator),
    resultJson: v.optional(nullableString),
    notes: v.optional(nullableString),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFixtureWrite(ctx);
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const id = ctx.db.normalizeId("fixtures", replay.resultId);
      if (!id) throw new ConvexError("Invalid fixture idempotency result.");
      return id;
    }
    if (replay) throw new ConvexError("Missing fixture idempotency result.");
    const title = args.title.trim();
    if (!title) throw new ConvexError("Fixture title is required.");
    const [season, competition, division, venue] = await Promise.all([
      assertSeason(ctx, auth, args.seasonId),
      assertCompetition(ctx, auth, args.competitionId),
      assertDivision(ctx, auth, args.divisionId),
      assertVenue(ctx, auth, args.venueId),
    ]);
    const now = Date.now();
    if (args.id) {
      const existing = await assertFixture(ctx, auth, args.id);
      await ctx.db.patch(args.id, {
        title,
        seasonId:
          args.seasonId === null
            ? undefined
            : args.seasonId === undefined
              ? existing.seasonId
              : season?._id,
        competitionId:
          args.competitionId === null
            ? undefined
            : args.competitionId === undefined
              ? existing.competitionId
              : competition?._id,
        divisionId:
          args.divisionId === null
            ? undefined
            : args.divisionId === undefined
              ? existing.divisionId
              : division?._id,
        venueId:
          args.venueId === null
            ? undefined
            : args.venueId === undefined
              ? existing.venueId
              : venue?._id,
        roundNumber:
          args.roundNumber === null
            ? undefined
            : (args.roundNumber ?? existing.roundNumber),
        roundName:
          args.roundName === null ? undefined : cleanText(args.roundName),
        fieldName:
          args.fieldName === null ? undefined : cleanText(args.fieldName),
        startTime: args.startTime,
        endTime:
          args.endTime === null
            ? undefined
            : (args.endTime ?? existing.endTime),
        status: args.status ?? existing.status,
        resultJson:
          args.resultJson === null ? undefined : cleanText(args.resultJson),
        notes: args.notes === null ? undefined : cleanText(args.notes),
        updatedAt: now,
      });
      await recordFixtureAudit(ctx, {
        orgId: auth.org._id,
        actorUserId: auth.user._id,
        fixtureId: args.id,
        action: "fixture.updated",
        metadata: { title, status: args.status },
      });
      await recordClientMutation(
        ctx,
        auth,
        args.clientMutationId,
        "fixtures:upsert",
        String(args.id),
      );
      return args.id;
    }
    const fixtureId = await ctx.db.insert("fixtures", {
      orgId: auth.org._id,
      sportKey: auth.org.sportKey,
      seasonId: season?._id,
      competitionId: competition?._id,
      divisionId: division?._id,
      venueId: venue?._id,
      title,
      roundNumber: args.roundNumber ?? undefined,
      roundName: cleanText(args.roundName),
      fieldName: cleanText(args.fieldName),
      startTime: args.startTime,
      endTime: args.endTime ?? undefined,
      status: args.status ?? "scheduled",
      resultJson: cleanText(args.resultJson),
      notes: cleanText(args.notes),
      updatedAt: now,
    });
    await recordFixtureAudit(ctx, {
      orgId: auth.org._id,
      actorUserId: auth.user._id,
      fixtureId,
      action: "fixture.created",
      metadata: { title },
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fixtures:upsert",
      String(fixtureId),
    );
    return fixtureId;
  },
});

export const removeFixture = mutation({
  args: { fixtureId: v.id("fixtures") },
  handler: async (ctx, args) => {
    const auth = await requireFixtureDelete(ctx);
    const fixture = await assertFixture(ctx, auth, args.fixtureId);
    const [teams, officials] = await Promise.all([
      ctx.db
        .query("fixtureTeams")
        .withIndex("by_fixture", (q) => q.eq("fixtureId", args.fixtureId))
        .collect(),
      ctx.db
        .query("officialAssignments")
        .withIndex("by_fixture", (q) => q.eq("fixtureId", args.fixtureId))
        .collect(),
    ]);
    for (const row of teams) await ctx.db.delete(row._id);
    for (const row of officials) await ctx.db.delete(row._id);
    await ctx.db.delete(args.fixtureId);
    await recordFixtureAudit(ctx, {
      orgId: auth.org._id,
      actorUserId: auth.user._id,
      fixtureId: args.fixtureId,
      action: "fixture.deleted",
      metadata: { title: fixture.title },
    });
  },
});

export const listStandings = query({
  args: {
    seasonId: v.optional(v.id("seasons")),
    competitionId: v.optional(v.id("sportCompetitions")),
    divisionId: v.optional(v.id("sportDivisions")),
  },
  handler: async (ctx, args) => {
    const auth = await requireFixtureRead(ctx);
    if (args.seasonId) await assertSeason(ctx, auth, args.seasonId);
    if (args.competitionId)
      await assertCompetition(ctx, auth, args.competitionId);
    if (args.divisionId) await assertDivision(ctx, auth, args.divisionId);
    let rows = await ctx.db
      .query("fixtureStandings")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    if (args.seasonId)
      rows = rows.filter((row) => row.seasonId === args.seasonId);
    if (args.competitionId) {
      rows = rows.filter((row) => row.competitionId === args.competitionId);
    }
    if (args.divisionId)
      rows = rows.filter((row) => row.divisionId === args.divisionId);
    const hydrated = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        teamName: (await ctx.db.get(row.teamId))?.name ?? "Unknown team",
      })),
    );
    return hydrated.sort((a, b) => {
      if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
      if (a.rank !== undefined) return -1;
      if (b.rank !== undefined) return 1;
      if (a.points !== b.points) return b.points - a.points;
      return a.teamName.localeCompare(b.teamName);
    });
  },
});

export const upsertStanding = mutation({
  args: {
    id: v.optional(v.id("fixtureStandings")),
    teamId: v.id("teams"),
    seasonId: v.optional(nullableSeasonId),
    competitionId: v.optional(nullableCompetitionId),
    divisionId: v.optional(nullableDivisionId),
    played: v.optional(v.number()),
    wins: v.optional(v.number()),
    draws: v.optional(v.number()),
    losses: v.optional(v.number()),
    pointsFor: v.optional(v.number()),
    pointsAgainst: v.optional(v.number()),
    points: v.optional(v.number()),
    rank: v.optional(nullableNumber),
    metadataJson: v.optional(nullableString),
  },
  handler: async (ctx, args) => {
    const auth = await requireFixtureWrite(ctx);
    const [team, season, competition, division] = await Promise.all([
      assertTeam(ctx, auth, args.teamId),
      assertSeason(ctx, auth, args.seasonId),
      assertCompetition(ctx, auth, args.competitionId),
      assertDivision(ctx, auth, args.divisionId),
    ]);
    if (!team) throw new ConvexError("Team is required.");
    const now = Date.now();
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      assertSameOrg(auth, existing);
      if (!existing) throw new ConvexError("Standing not found.");
      await ctx.db.patch(args.id, {
        teamId: team._id,
        seasonId:
          args.seasonId === null
            ? undefined
            : args.seasonId === undefined
              ? existing.seasonId
              : season?._id,
        competitionId:
          args.competitionId === null
            ? undefined
            : args.competitionId === undefined
              ? existing.competitionId
              : competition?._id,
        divisionId:
          args.divisionId === null
            ? undefined
            : args.divisionId === undefined
              ? existing.divisionId
              : division?._id,
        played: args.played ?? existing.played,
        wins: args.wins ?? existing.wins,
        draws: args.draws ?? existing.draws,
        losses: args.losses ?? existing.losses,
        pointsFor: args.pointsFor ?? existing.pointsFor,
        pointsAgainst: args.pointsAgainst ?? existing.pointsAgainst,
        points: args.points ?? existing.points,
        rank: args.rank === null ? undefined : (args.rank ?? existing.rank),
        metadataJson:
          args.metadataJson === null ? undefined : cleanText(args.metadataJson),
        updatedAt: now,
      });
      return args.id;
    }
    return await ctx.db.insert("fixtureStandings", {
      orgId: auth.org._id,
      sportKey: auth.org.sportKey,
      teamId: team._id,
      seasonId: season?._id,
      competitionId: competition?._id,
      divisionId: division?._id,
      played: args.played ?? 0,
      wins: args.wins ?? 0,
      draws: args.draws ?? 0,
      losses: args.losses ?? 0,
      pointsFor: args.pointsFor ?? 0,
      pointsAgainst: args.pointsAgainst ?? 0,
      points: args.points ?? 0,
      rank: args.rank ?? undefined,
      metadataJson: cleanText(args.metadataJson),
      updatedAt: now,
    });
  },
});

export const removeStanding = mutation({
  args: { id: v.id("fixtureStandings") },
  handler: async (ctx, args) => {
    const auth = await requireFixtureDelete(ctx);
    const row = await ctx.db.get(args.id);
    assertSameOrg(auth, row);
    if (row) await ctx.db.delete(args.id);
  },
});

export const upsertFixtureTeam = mutation({
  args: {
    id: v.optional(v.id("fixtureTeams")),
    fixtureId: v.id("fixtures"),
    teamId: v.optional(nullableTeamId),
    side: fixtureTeamSideValidator,
    displayName: v.optional(nullableString),
    score: v.optional(nullableNumber),
    result: v.optional(nullableString),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFixtureWrite(ctx);
    await assertFixture(ctx, auth, args.fixtureId);
    const team = await assertTeam(ctx, auth, args.teamId);
    const displayName = cleanText(args.displayName);
    if (!team && !displayName) {
      throw new ConvexError("Choose a team or enter a display name.");
    }
    const now = Date.now();
    if (args.id) {
      const row = await ctx.db.get(args.id);
      assertSameOrg(auth, row);
      if (!row) throw new ConvexError("Fixture team not found.");
      await ctx.db.patch(args.id, {
        teamId:
          args.teamId === null
            ? undefined
            : args.teamId === undefined
              ? row.teamId
              : team?._id,
        side: args.side,
        displayName: args.displayName === null ? undefined : displayName,
        score: args.score === null ? undefined : (args.score ?? row.score),
        result: args.result === null ? undefined : cleanText(args.result),
        order: args.order ?? row.order,
        updatedAt: now,
      });
      return args.id;
    }
    return await ctx.db.insert("fixtureTeams", {
      orgId: auth.org._id,
      fixtureId: args.fixtureId,
      teamId: team?._id,
      side: args.side,
      displayName,
      score: args.score ?? undefined,
      result: cleanText(args.result),
      order:
        args.order ?? (args.side === "home" ? 1 : args.side === "away" ? 2 : 3),
      updatedAt: now,
    });
  },
});

export const removeFixtureTeam = mutation({
  args: { id: v.id("fixtureTeams") },
  handler: async (ctx, args) => {
    const auth = await requireFixtureWrite(ctx);
    const row = await ctx.db.get(args.id);
    assertSameOrg(auth, row);
    if (row) await ctx.db.delete(args.id);
  },
});

export const upsertOfficialAssignment = mutation({
  args: {
    id: v.optional(v.id("officialAssignments")),
    fixtureId: v.id("fixtures"),
    memberId: v.optional(nullableMemberId),
    role: v.string(),
    name: v.optional(nullableString),
    notes: v.optional(nullableString),
  },
  handler: async (ctx, args) => {
    const auth = await requireFixtureWrite(ctx);
    await assertFixture(ctx, auth, args.fixtureId);
    const member = await assertMember(ctx, auth, args.memberId);
    const role = args.role.trim();
    if (!role) throw new ConvexError("Official role is required.");
    const now = Date.now();
    if (args.id) {
      const row = await ctx.db.get(args.id);
      assertSameOrg(auth, row);
      if (!row) throw new ConvexError("Official assignment not found.");
      await ctx.db.patch(args.id, {
        memberId:
          args.memberId === null
            ? undefined
            : args.memberId === undefined
              ? row.memberId
              : member?._id,
        role,
        name: args.name === null ? undefined : cleanText(args.name),
        notes: args.notes === null ? undefined : cleanText(args.notes),
        updatedAt: now,
      });
      return args.id;
    }
    return await ctx.db.insert("officialAssignments", {
      orgId: auth.org._id,
      fixtureId: args.fixtureId,
      memberId: member?._id,
      role,
      name: cleanText(args.name),
      notes: cleanText(args.notes),
      updatedAt: now,
    });
  },
});

export const removeOfficialAssignment = mutation({
  args: { id: v.id("officialAssignments") },
  handler: async (ctx, args) => {
    const auth = await requireFixtureWrite(ctx);
    const row = await ctx.db.get(args.id);
    assertSameOrg(auth, row);
    if (row) await ctx.db.delete(args.id);
  },
});

export const seedDefaults = mutation({
  args: { sportKey: v.optional(sportKeyValidator) },
  handler: async (ctx, args) => {
    const auth = await requireFixtureWrite(ctx);
    await seedSportDefaultsForOrg(
      ctx,
      auth.org._id,
      args.sportKey ?? auth.org.sportKey,
    );
  },
});
