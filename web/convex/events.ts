import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, requireRole, assertSameOrg } from "./lib/auth";
import { eventTypeValidator, rsvpStatusValidator } from "./schema";

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
      rsvps.map(async (r) => ({ rsvp: r, member: await ctx.db.get(r.memberId) })),
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
    type: eventTypeValidator,
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    teamId: v.optional(v.id("teams")),
    opponent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
    if (args.teamId) {
      const team = await ctx.db.get(args.teamId);
      assertSameOrg(auth, team);
    }
    return await ctx.db.insert("events", {
      orgId: auth.org._id,
      type: args.type,
      title: args.title.trim(),
      description: args.description,
      location: args.location,
      startTime: args.startTime,
      endTime: args.endTime,
      teamId: args.teamId,
      opponent: args.opponent,
      createdBy: auth.user._id,
    });
  },
});

export const update = mutation({
  args: {
    eventId: v.id("events"),
    type: v.optional(eventTypeValidator),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    teamId: v.optional(v.id("teams")),
    opponent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
    const event = await ctx.db.get(args.eventId);
    assertSameOrg(auth, event);
    const { eventId, ...rest } = args;
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    );
    await ctx.db.patch(eventId, patch);
  },
});

export const remove = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "coach");
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
  },
});

/** Set an RSVP for a member on an event. */
export const setRsvp = mutation({
  args: {
    eventId: v.id("events"),
    memberId: v.id("members"),
    status: rsvpStatusValidator,
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const event = await ctx.db.get(args.eventId);
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, event);
    assertSameOrg(auth, member);

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
      return existing._id;
    }
    return await ctx.db.insert("rsvps", {
      orgId: auth.org._id,
      eventId: args.eventId,
      memberId: args.memberId,
      status: args.status,
      respondedBy: auth.user._id,
      respondedAt: Date.now(),
    });
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
    const auth = await requireRole(ctx, "coach");
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
