import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, requireRole, assertSameOrg } from "./lib/auth";

export const list = query({
  args: { teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    let rows = await ctx.db
      .query("announcements")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();

    if (args.teamId !== undefined) {
      rows = rows.filter(
        (a) => a.teamId === args.teamId || a.teamId === undefined,
      );
    }

    // Pinned first, then newest.
    rows.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b._creationTime - a._creationTime;
    });

    return await Promise.all(
      rows.map(async (a) => {
        const team = a.teamId ? await ctx.db.get(a.teamId) : null;
        const read = await ctx.db
          .query("announcementReads")
          .withIndex("by_announcement_and_user", (q) =>
            q.eq("announcementId", a._id).eq("userId", auth.user._id),
          )
          .unique();
        const author = await ctx.db.get(a.createdBy);
        return {
          ...a,
          teamName: team?.name ?? null,
          isRead: !!read,
          authorName: author
            ? `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim()
            : null,
        };
      }),
    );
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    teamId: v.optional(v.id("teams")),
    pinned: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Org-wide announcements require committee+, team announcements allow coaches.
    const auth = args.teamId
      ? await requireRole(ctx, "coach")
      : await requireRole(ctx, "committee");
    if (args.teamId) {
      const team = await ctx.db.get(args.teamId);
      assertSameOrg(auth, team);
    }
    return await ctx.db.insert("announcements", {
      orgId: auth.org._id,
      title: args.title.trim(),
      body: args.body,
      teamId: args.teamId,
      pinned: args.pinned ?? false,
      createdBy: auth.user._id,
    });
  },
});

export const setPinned = mutation({
  args: { announcementId: v.id("announcements"), pinned: v.boolean() },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const a = await ctx.db.get(args.announcementId);
    assertSameOrg(auth, a);
    await ctx.db.patch(args.announcementId, { pinned: args.pinned });
  },
});

export const remove = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, args) => {
    // Mirror `create`: org-wide announcements are a committee+ artefact, so
    // only committee+ can remove them. Team-scoped announcements remain
    // coach+. Prevents a coach in another team from nuking an
    // organisation-wide notice they had no role authoring.
    const auth = await requireOrgMember(ctx);
    const a = await ctx.db.get(args.announcementId);
    assertSameOrg(auth, a);
    const requires = a && a.teamId ? "coach" : "committee";
    await requireRole(ctx, requires);
    await ctx.db.delete(args.announcementId);
  },
});

export const markRead = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const a = await ctx.db.get(args.announcementId);
    assertSameOrg(auth, a);
    const existing = await ctx.db
      .query("announcementReads")
      .withIndex("by_announcement_and_user", (q) =>
        q.eq("announcementId", args.announcementId).eq("userId", auth.user._id),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("announcementReads", {
        orgId: auth.org._id,
        announcementId: args.announcementId,
        userId: auth.user._id,
        readAt: Date.now(),
      });
    }
  },
});
