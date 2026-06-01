import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, assertSameOrg } from "./lib/auth";
import { generateSlug } from "./lib/ids";
import { attachOrgImage, deleteOrgImage, orgImageUrl } from "./lib/uploads";
import { requireModule } from "./lib/orgConfig";
import { requireCapability } from "./lib/capabilities";

/** Committee: list all news (published + drafts) for the org. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const rows = await ctx.db
      .query("news")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    return await Promise.all(
      rows
        .sort(
          (a, b) =>
            (b.publishedAt ?? b._creationTime) -
            (a.publishedAt ?? a._creationTime),
        )
        .map(async (n) => ({
          ...n,
          coverImageUrl: n.coverImageStorageId
            ? await orgImageUrl(ctx, auth, n.coverImageStorageId)
            : null,
        })),
    );
  },
});

export const get = query({
  args: { newsId: v.id("news") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const post = await ctx.db.get(args.newsId);
    assertSameOrg(auth, post);
    return post
      ? {
          ...post,
          coverImageUrl: post.coverImageStorageId
            ? await orgImageUrl(ctx, auth, post.coverImageStorageId)
            : null,
        }
      : null;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    excerpt: v.optional(v.string()),
    coverImageStorageId: v.optional(v.id("_storage")),
    coverImageFileName: v.optional(v.string()),
    published: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "news.manage");
    await requireModule(ctx, auth, "news");
    const published = args.published ?? false;
    const newsId = await ctx.db.insert("news", {
      orgId: auth.org._id,
      title: args.title.trim(),
      slug: generateSlug(args.title),
      body: args.body,
      excerpt: args.excerpt,
      published,
      publishedAt: published ? Date.now() : undefined,
      authorUserId: auth.user._id,
    });
    if (args.coverImageStorageId) {
      await attachOrgImage(ctx, auth, {
        storageId: args.coverImageStorageId,
        ownerType: "news",
        ownerId: newsId,
        purpose: "coverImage",
        fileName: args.coverImageFileName,
      });
      await ctx.db.patch(newsId, {
        coverImageStorageId: args.coverImageStorageId,
      });
    }
    return newsId;
  },
});

export const update = mutation({
  args: {
    newsId: v.id("news"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    coverImageStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    coverImageFileName: v.optional(v.string()),
    published: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "news.manage");
    await requireModule(ctx, auth, "news");
    const post = await ctx.db.get(args.newsId);
    assertSameOrg(auth, post);
    if (!post) throw new Error("Not found.");

    const {
      newsId,
      coverImageStorageId,
      coverImageFileName,
      published,
      ...rest
    } = args;
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    );
    if (coverImageStorageId !== undefined) {
      if (coverImageStorageId) {
        await attachOrgImage(ctx, auth, {
          storageId: coverImageStorageId,
          ownerType: "news",
          ownerId: newsId,
          purpose: "coverImage",
          fileName: coverImageFileName,
        });
      }
      patch.coverImageStorageId = coverImageStorageId ?? undefined;
    }
    if (published !== undefined) {
      patch.published = published;
      if (published && !post.published) patch.publishedAt = Date.now();
    }
    await ctx.db.patch(newsId, patch);
    if (
      coverImageStorageId !== undefined &&
      coverImageStorageId !== post.coverImageStorageId
    ) {
      await deleteOrgImage(ctx, auth, post.coverImageStorageId);
    }
  },
});

export const remove = mutation({
  args: { newsId: v.id("news") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "news.manage");
    await requireModule(ctx, auth, "news");
    const post = await ctx.db.get(args.newsId);
    assertSameOrg(auth, post);
    await deleteOrgImage(ctx, auth, post!.coverImageStorageId);
    await ctx.db.delete(args.newsId);
  },
});
