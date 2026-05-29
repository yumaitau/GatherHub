import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, requireRole, assertSameOrg } from "./lib/auth";
import { generateSlug } from "./lib/ids";

/** Admin: list all news (published + drafts) for the org. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const rows = await ctx.db
      .query("news")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    return rows.sort(
      (a, b) =>
        (b.publishedAt ?? b._creationTime) - (a.publishedAt ?? a._creationTime),
    );
  },
});

export const get = query({
  args: { newsId: v.id("news") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const post = await ctx.db.get(args.newsId);
    assertSameOrg(auth, post);
    return post;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    excerpt: v.optional(v.string()),
    coverImageStorageId: v.optional(v.id("_storage")),
    published: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const published = args.published ?? false;
    return await ctx.db.insert("news", {
      orgId: auth.org._id,
      title: args.title.trim(),
      slug: generateSlug(args.title),
      body: args.body,
      excerpt: args.excerpt,
      coverImageStorageId: args.coverImageStorageId,
      published,
      publishedAt: published ? Date.now() : undefined,
      authorUserId: auth.user._id,
    });
  },
});

export const update = mutation({
  args: {
    newsId: v.id("news"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    coverImageStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    published: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const post = await ctx.db.get(args.newsId);
    assertSameOrg(auth, post);
    if (!post) throw new Error("Not found.");

    const { newsId, coverImageStorageId, published, ...rest } = args;
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    );
    if (coverImageStorageId !== undefined) {
      patch.coverImageStorageId = coverImageStorageId ?? undefined;
    }
    if (published !== undefined) {
      patch.published = published;
      if (published && !post.published) patch.publishedAt = Date.now();
    }
    await ctx.db.patch(newsId, patch);
  },
});

export const remove = mutation({
  args: { newsId: v.id("news") },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    const post = await ctx.db.get(args.newsId);
    assertSameOrg(auth, post);
    await ctx.db.delete(args.newsId);
  },
});
