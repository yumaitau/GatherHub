import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, assertSameOrg } from "./lib/auth";
import { ConvexError } from "convex/values";
import { rsvpStatusValidator } from "./schema";
import { assertTaxonomyKey } from "./taxonomies";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";
import { hasCapability, requireCapability } from "./lib/capabilities";

const nullableString = v.union(v.string(), v.null());

function defaultedLocation(
  explicit: string | undefined,
  fallback: string | undefined,
): string | undefined {
  return explicit?.trim() || fallback?.trim() || undefined;
}

export const list = query({
  args: {
    upcomingOnly: v.optional(v.boolean()),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    let events = await ctx.db
      .query("events")
      .withIndex("by_org_and_start", (q) => q.eq("orgId", auth.org._id))
      .collect();

    if (args.teamId) {
      events = events.filter(
        (e) => e.teamId === args.teamId || e.teamId === undefined,
      );
    }
    if (args.upcomingOnly) {
      const now = Date.now();
      events = events.filter((e) => (e.endTime ?? e.startTime) >= now);
    }
    events.sort((a, b) => a.startTime - b.startTime);

    return await Promise.all(
      events.map(async (e) => {
        const team = e.teamId ? await ctx.db.get(e.teamId) : null;
        const rsvps = await ctx.db
          .query("rsvps")
          .withIndex("by_event", (q) => q.eq("eventId", e._id))
          .collect();
        return {
          ...e,
          teamName: team?.name ?? null,
          goingCount: rsvps.filter((r) => r.status === "going").length,
        };
      }),
    );
  },
});

export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const event = await ctx.db.get(args.eventId);
    assertSameOrg(auth, event);
    if (!event) throw new Error("Not found.");

    const team = event.teamId ? await ctx.db.get(event.teamId) : null;
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();
    const attendance = await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();

    const rsvpRows = await Promise.all(
      rsvps.map(async (r) => ({
        rsvp: r,
        member: await ctx.db.get(r.memberId),
      })),
    );
    const attendanceRows = await Promise.all(
      attendance.map(async (a) => ({
        attendance: a,
        member: await ctx.db.get(a.memberId),
      })),
    );

    return {
      event,
      teamName: team?.name ?? null,
      rsvps: rsvpRows,
      attendance: attendanceRows,
      counts: {
        going: rsvps.filter((r) => r.status === "going").length,
        maybe: rsvps.filter((r) => r.status === "maybe").length,
        notGoing: rsvps.filter((r) => r.status === "not_going").length,
        present: attendance.filter((a) => a.present).length,
      },
    };
  },
});

export const create = mutation({
  args: {
    type: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    teamId: v.optional(v.id("teams")),
    opponent: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "events.write");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const eventId = ctx.db.normalizeId("events", replay.resultId);
      if (!eventId) throw new Error("Invalid event idempotency result.");
      return eventId;
    }
    if (replay) throw new Error("Missing event idempotency result.");
    await assertTaxonomyKey(ctx, auth.org._id, "event_type", args.type);
    if (args.teamId) {
      const team = await ctx.db.get(args.teamId);
      assertSameOrg(auth, team);
    }
    const eventId = await ctx.db.insert("events", {
      orgId: auth.org._id,
      type: args.type,
      title: args.title.trim(),
      description: args.description,
      location: defaultedLocation(args.location, auth.org.defaultAddress),
      startTime: args.startTime,
      endTime: args.endTime,
      teamId: args.teamId,
      opponent: args.opponent,
      createdBy: auth.user._id,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "events:create",
      String(eventId),
    );
    return eventId;
  },
});

export const update = mutation({
  args: {
    eventId: v.id("events"),
    type: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(nullableString),
    location: v.optional(nullableString),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.union(v.number(), v.null())),
    teamId: v.optional(v.union(v.id("teams"), v.null())),
    opponent: v.optional(nullableString),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "events.write");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return;
    const event = await ctx.db.get(args.eventId);
    assertSameOrg(auth, event);
    if (args.type !== undefined) {
      await assertTaxonomyKey(ctx, auth.org._id, "event_type", args.type);
    }
    if (args.teamId !== undefined && args.teamId !== null) {
      const team = await ctx.db.get(args.teamId);
      assertSameOrg(auth, team);
    }
    const { eventId, clientMutationId, ...rest } = args;
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest)
        .filter(([, v]) => v !== undefined)
        .map(([key, value]) => [key, value === null ? undefined : value]),
    );
    if (args.location !== undefined) {
      patch.location = args.location?.trim() || undefined;
    }
    await ctx.db.patch(eventId, patch);
    await recordClientMutation(
      ctx,
      auth,
      clientMutationId,
      "events:update",
      String(eventId),
    );
  },
});

export const remove = mutation({
  args: {
    eventId: v.id("events"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "events.delete");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return;
    const event = await ctx.db.get(args.eventId);
    assertSameOrg(auth, event);
    for (const table of ["rsvps", "attendance"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    await ctx.db.delete(args.eventId);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "events:remove",
      String(args.eventId),
    );
  },
});

/**
 * Set an RSVP for a member on an event.
 *
 * Authorisation: caller must be (a) the member themselves (member.userId
 * matches caller), (b) a registered guardian of the member, or (c) coach+.
 * Otherwise any member could flip another member's RSVP.
 */
export const setRsvp = mutation({
  args: {
    eventId: v.id("events"),
    memberId: v.id("members"),
    status: rsvpStatusValidator,
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const event = await ctx.db.get(args.eventId);
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, event);
    assertSameOrg(auth, member);

    const isSelf = member?.userId && member.userId === auth.user._id;
    const canManageEvents = await hasCapability(ctx, auth, "events.write");
    let isGuardian = false;
    if (!isSelf && !canManageEvents) {
      // Caller is a member of this org but doesn't own the target member
      // record. Check whether they are a registered guardian.
      const callerSelfMembers = (
        await ctx.db
          .query("members")
          .withIndex("by_user", (q) => q.eq("userId", auth.user._id))
          .collect()
      ).filter((m) => m.orgId === auth.org._id);
      for (const m of callerSelfMembers) {
        const link = await ctx.db
          .query("guardians")
          .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
          .filter((q) => q.eq(q.field("guardianMemberId"), m._id))
          .first();
        if (link) {
          isGuardian = true;
          break;
        }
      }
    }
    if (!isSelf && !isGuardian && !canManageEvents) {
      throw new ConvexError({
        code: "forbidden",
        message:
          "You can only RSVP for yourself, your dependants, or with event management access.",
      });
    }

    const existing = await ctx.db
      .query("rsvps")
      .withIndex("by_event_and_member", (q) =>
        q.eq("eventId", args.eventId).eq("memberId", args.memberId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        respondedBy: auth.user._id,
        respondedAt: Date.now(),
      });
      await recordClientMutation(
        ctx,
        auth,
        args.clientMutationId,
        "events:setRsvp",
        String(existing._id),
      );
      return existing._id;
    }
    const rsvpId = await ctx.db.insert("rsvps", {
      orgId: auth.org._id,
      eventId: args.eventId,
      memberId: args.memberId,
      status: args.status,
      respondedBy: auth.user._id,
      respondedAt: Date.now(),
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "events:setRsvp",
      String(rsvpId),
    );
    return rsvpId;
  },
});

/** Record attendance (present/absent) for a member. Coaches+. */
export const setAttendance = mutation({
  args: {
    eventId: v.id("events"),
    memberId: v.id("members"),
    present: v.boolean(),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "events.write");
    const event = await ctx.db.get(args.eventId);
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, event);
    assertSameOrg(auth, member);

    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_event_and_member", (q) =>
        q.eq("eventId", args.eventId).eq("memberId", args.memberId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        present: args.present,
        recordedBy: auth.user._id,
        recordedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("attendance", {
      orgId: auth.org._id,
      eventId: args.eventId,
      memberId: args.memberId,
      present: args.present,
      recordedBy: auth.user._id,
      recordedAt: Date.now(),
    });
  },
});
