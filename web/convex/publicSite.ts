import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember } from "./lib/auth";
import { publicImageUrlForOrg } from "./lib/uploads";
import { requireModule } from "./lib/orgConfig";
import { requireCapability } from "./lib/capabilities";

/**
 * Read the public site settings for the caller's org. Committee+: matches the
 * editor mutation, and these settings are only consumed by the Settings UI.
 * The public-facing site reads them via `publicProfile` (which exposes only
 * the public-safe subset).
 */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "public_site.manage");
    return await ctx.db
      .query("publicSiteSettings")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .unique();
  },
});

export const upsertSettings = mutation({
  args: {
    enabled: v.boolean(),
    tagline: v.optional(v.string()),
    about: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    address: v.optional(v.string()),
    facebookUrl: v.optional(v.string()),
    instagramUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "public_site.manage");
    await requireModule(ctx, auth, "public_site");
    const existing = await ctx.db
      .query("publicSiteSettings")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("publicSiteSettings", {
      orgId: auth.org._id,
      ...args,
    });
  },
});

/**
 * PUBLIC, unauthenticated: the full public profile for a club by slug — home,
 * about, teams, sponsors, news. Only data explicitly marked public is returned,
 * and only if the site is enabled. See /docs/security-model.md.
 */
export const publicProfile = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!org) return null;

    const settings = await ctx.db
      .query("publicSiteSettings")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .unique();
    if (!settings || !settings.enabled) return null;

    const activeTeams = await ctx.db
      .query("teams")
      .withIndex("by_org_and_active", (q) =>
        q.eq("orgId", org._id).eq("isActive", true),
      )
      .collect();

    const publicSponsors = await ctx.db
      .query("sponsors")
      .withIndex("by_org_and_public", (q) =>
        q.eq("orgId", org._id).eq("visibleOnPublicSite", true),
      )
      .collect();

    const publishedNews = await ctx.db
      .query("news")
      .withIndex("by_org_and_published", (q) =>
        q.eq("orgId", org._id).eq("published", true),
      )
      .collect();
    publishedNews.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

    return {
      org: { name: org.name, slug: org.slug, imageUrl: org.imageUrl },
      settings,
      teams: activeTeams.map((t) => ({
        id: t._id,
        name: t.name,
        ageGroup: t.ageGroup,
        season: t.season,
        description: t.description,
      })),
      sponsors: await Promise.all(
        publicSponsors.map(async (s) => ({
          id: s._id,
          name: s.name,
          website: s.website,
          logoUrl: s.logoStorageId
            ? await publicImageUrlForOrg(ctx, org._id, s.logoStorageId)
            : null,
        })),
      ),
      news: await Promise.all(
        publishedNews.slice(0, 20).map(async (n) => ({
          id: n._id,
          title: n.title,
          slug: n.slug,
          excerpt: n.excerpt,
          publishedAt: n.publishedAt,
          coverImageUrl: n.coverImageStorageId
            ? await publicImageUrlForOrg(ctx, org._id, n.coverImageStorageId)
            : null,
        })),
      ),
    };
  },
});

/** PUBLIC: a single published news article by org slug + article slug. */
export const publicNewsArticle = query({
  args: { slug: v.string(), articleSlug: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!org) return null;

    const settings = await ctx.db
      .query("publicSiteSettings")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .unique();
    if (!settings || !settings.enabled) return null;

    const article = await ctx.db
      .query("news")
      .withIndex("by_org_and_slug", (q) =>
        q.eq("orgId", org._id).eq("slug", args.articleSlug),
      )
      .unique();
    if (!article || !article.published) return null;

    return {
      title: article.title,
      body: article.body,
      publishedAt: article.publishedAt,
      coverImageUrl: article.coverImageStorageId
        ? await publicImageUrlForOrg(ctx, org._id, article.coverImageStorageId)
        : null,
      orgName: org.name,
    };
  },
});
