import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, assertSameOrg } from "./lib/auth";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";
import { requireCapability } from "./lib/capabilities";

const nullableTeamId = v.union(v.id("teams"), v.null());

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
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "announcements.write");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const announcementId = ctx.db.normalizeId(
        "announcements",
        replay.resultId,
      );
      if (!announcementId) {
        throw new Error("Invalid announcement idempotency result.");
      }
      return announcementId;
    }
    if (replay) throw new Error("Missing announcement idempotency result.");
    if (args.teamId) {
      const team = await ctx.db.get(args.teamId);
      assertSameOrg(auth, team);
    }
    const announcementId = await ctx.db.insert("announcements", {
      orgId: auth.org._id,
      title: args.title.trim(),
      body: args.body,
      teamId: args.teamId,
      pinned: args.pinned ?? false,
      createdBy: auth.user._id,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "announcements:create",
      String(announcementId),
    );
    return announcementId;
  },
});

export const update = mutation({
  args: {
    announcementId: v.id("announcements"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    teamId: v.optional(nullableTeamId),
    pinned: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "announcements.write");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return;
    const a = await ctx.db.get(args.announcementId);
    assertSameOrg(auth, a);
    if (!a) return;
    if (args.teamId !== undefined && args.teamId !== null) {
      const team = await ctx.db.get(args.teamId);
      assertSameOrg(auth, team);
    }
    await ctx.db.patch(args.announcementId, {
      ...(args.title !== undefined ? { title: args.title.trim() } : {}),
      ...(args.body !== undefined ? { body: args.body } : {}),
      ...(args.teamId !== undefined
        ? { teamId: args.teamId ?? undefined }
        : {}),
      ...(args.pinned !== undefined ? { pinned: args.pinned } : {}),
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "announcements:update",
      String(args.announcementId),
    );
  },
});

export const setPinned = mutation({
  args: {
    announcementId: v.id("announcements"),
    pinned: v.boolean(),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "announcements.write");
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const a = await ctx.db.get(args.announcementId);
    assertSameOrg(auth, a);
    await ctx.db.patch(args.announcementId, { pinned: args.pinned });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "announcements:setPinned",
      String(args.announcementId),
    );
  },
});

export const remove = mutation({
  args: {
    announcementId: v.id("announcements"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "announcements.write");
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const a = await ctx.db.get(args.announcementId);
    assertSameOrg(auth, a);
    await ctx.db.delete(args.announcementId);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "announcements:remove",
      String(args.announcementId),
    );
  },
});

export const markRead = mutation({
  args: {
    announcementId: v.id("announcements"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
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
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "announcements:markRead",
    );
  },
});
