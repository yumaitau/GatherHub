import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrgMember, assertSameOrg, type AuthContext } from "./lib/auth";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";
import { hasCapability, requireCapability } from "./lib/capabilities";
import { requireModule } from "./lib/orgConfig";
import { postBodyFormatValidator, postReactionKindValidator } from "./schema";
import { ConvexError } from "convex/values";

/** Generous upper bound on stored post markup (sanitized HTML can be verbose). */
const MAX_POST_BODY = 100_000;

type BodyFormat = "plain" | "html";

/** Crude tag/entity strip used only to test an HTML body for real content. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Write-side tripwire for HTML bodies. Markup is fully sanitised by the web
 * client before submit and again by every client on render; this is a
 * dependency-free backstop that rejects markup carrying unambiguously dangerous
 * constructs (script/style/frame tags, inline event handlers, executable URIs).
 * Sanitised post HTML never contains these, so a hit means the body bypassed
 * the client sanitizer (e.g. a direct API call) and must not be stored raw.
 */
const DANGEROUS_HTML =
  /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|base|noscript|template|svg)\b|\son\w+\s*=|(?:javascript|vbscript)\s*:|data\s*:\s*text\/html/i;

/**
 * Trim, bound, and require non-empty content for a post body. For HTML the
 * emptiness check runs against the tag-stripped text so an empty editor
 * (`<p></p>`) is rejected, and dangerous markup is refused outright. Markup is
 * otherwise sanitised by clients (on write and on render), not here.
 */
function normalisePostBody(raw: string, format: BodyFormat): string {
  const body = raw.trim();
  if (body.length > MAX_POST_BODY) {
    throw new ConvexError("Post body is too long.");
  }
  if (format === "html" && DANGEROUS_HTML.test(body)) {
    throw new ConvexError("Post contains unsupported or unsafe markup.");
  }
  const hasContent =
    format === "html" ? stripHtml(body).length > 0 : body.length > 0;
  if (!hasContent) throw new ConvexError("Post body is required.");
  return body;
}

/**
 * Community feed posts (Spond-style group posts) with one-level comment
 * threads and a fixed reaction set.
 *
 * Authorisation model:
 * - `posts.write` may always create posts (org-wide or any team).
 * - Without it, a member may post org-wide when `organizations.membersCanPost`
 *   is on, or to a team feed when that team's `membersCanPost` is on and they
 *   are on the team roster.
 * - Any org member may comment and react (unless the post has comments
 *   disabled).
 * - Authors may edit/delete their own posts and comments; `posts.moderate`
 *   may edit/delete anything, toggle comments, and change posting settings.
 */

type ReactionKind = Doc<"postReactions">["kind"];

function emptyReactionCounts(): Record<ReactionKind, number> {
  return { like: 0, love: 0, celebrate: 0, laugh: 0 };
}

function displayName(user: Doc<"users"> | null): string | null {
  if (!user) return null;
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return name || (user.email ?? null);
}

/** Is the calling user on the roster of `teamId` (via their member record)? */
async function isTeamMember(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  teamId: Id<"teams">,
) {
  const memberRows = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", auth.user._id))
    .collect();
  for (const member of memberRows) {
    if (member.orgId !== auth.org._id) continue;
    const link = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_and_member", (q) =>
        q.eq("teamId", teamId).eq("memberId", member._id),
      )
      .unique();
    if (link) return true;
  }
  return false;
}

async function canPostTo(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  teamId: Id<"teams"> | undefined,
) {
  if (await hasCapability(ctx, auth, "posts.write")) return true;
  if (teamId) {
    const team = await ctx.db.get(teamId);
    assertSameOrg(auth, team);
    if (!team?.membersCanPost) return false;
    return await isTeamMember(ctx, auth, teamId);
  }
  return Boolean(auth.org.membersCanPost);
}

async function requireAuthorOrModerator(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  createdBy: Id<"users">,
) {
  if (createdBy === auth.user._id) return;
  await requireCapability(ctx, auth, "posts.moderate");
}

/** Aggregate reactions for one target (post or comment) plus the caller's. */
function summariseReactions(rows: Doc<"postReactions">[], userId: Id<"users">) {
  const counts = emptyReactionCounts();
  let myReaction: ReactionKind | null = null;
  for (const row of rows) {
    counts[row.kind] += 1;
    if (row.userId === userId) myReaction = row.kind;
  }
  return { reactionCounts: counts, myReaction };
}

async function enrichComment(
  ctx: QueryCtx,
  auth: AuthContext,
  comment: Doc<"postComments">,
  reactionsByComment: Map<string, Doc<"postReactions">[]>,
  canModerate: boolean,
) {
  const author = await ctx.db.get(comment.createdBy);
  return {
    _id: comment._id,
    _creationTime: comment._creationTime,
    postId: comment.postId,
    parentCommentId: comment.parentCommentId ?? null,
    body: comment.body,
    editedAt: comment.editedAt ?? null,
    authorUserId: comment.createdBy,
    authorName: displayName(author),
    authorImageUrl: author?.imageUrl ?? null,
    canEdit: comment.createdBy === auth.user._id || canModerate,
    ...summariseReactions(
      reactionsByComment.get(comment._id) ?? [],
      auth.user._id,
    ),
  };
}

async function enrichPost(
  ctx: QueryCtx,
  auth: AuthContext,
  post: Doc<"posts">,
  canModerate: boolean,
) {
  const author = await ctx.db.get(post.createdBy);
  const team = post.teamId ? await ctx.db.get(post.teamId) : null;
  const comments = await ctx.db
    .query("postComments")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .collect();
  const reactions = await ctx.db
    .query("postReactions")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .collect();
  const read = await ctx.db
    .query("postReads")
    .withIndex("by_post_and_user", (q) =>
      q.eq("postId", post._id).eq("userId", auth.user._id),
    )
    .unique();
  return {
    _id: post._id,
    _creationTime: post._creationTime,
    teamId: post.teamId ?? null,
    teamName: team?.name ?? null,
    title: post.title ?? null,
    body: post.body,
    bodyFormat: post.bodyFormat ?? "plain",
    commentsDisabled: post.commentsDisabled,
    editedAt: post.editedAt ?? null,
    authorUserId: post.createdBy,
    authorName: displayName(author),
    authorImageUrl: author?.imageUrl ?? null,
    commentCount: comments.length,
    isRead: !!read,
    canEdit: post.createdBy === auth.user._id || canModerate,
    ...summariseReactions(
      reactions.filter((r) => r.commentId === undefined),
      auth.user._id,
    ),
  };
}

/**
 * Feed of posts, newest first. With `teamId`, returns that team's posts plus
 * org-wide posts (same merge as announcements); without it, the whole org.
 */
export const list = query({
  args: {
    teamId: v.optional(v.id("teams")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "posts");
    let rows = await ctx.db
      .query("posts")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();

    if (args.teamId !== undefined) {
      rows = rows.filter(
        (p) => p.teamId === args.teamId || p.teamId === undefined,
      );
    }

    rows.sort((a, b) => b._creationTime - a._creationTime);
    rows = rows.slice(0, Math.min(Math.max(args.limit ?? 50, 1), 200));

    const canModerate = await hasCapability(ctx, auth, "posts.moderate");
    return await Promise.all(
      rows.map((post) => enrichPost(ctx, auth, post, canModerate)),
    );
  },
});

/**
 * One post with its full comment tree (top-level comments oldest first, each
 * with its replies) and `seenCount` — how many users have read it.
 */
export const get = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "posts");
    const post = await ctx.db.get(args.postId);
    assertSameOrg(auth, post);
    if (!post) return null;

    const canModerate = await hasCapability(ctx, auth, "posts.moderate");
    const comments = await ctx.db
      .query("postComments")
      .withIndex("by_post", (q) => q.eq("postId", post._id))
      .collect();
    const reactions = await ctx.db
      .query("postReactions")
      .withIndex("by_post", (q) => q.eq("postId", post._id))
      .collect();
    const reads = await ctx.db
      .query("postReads")
      .withIndex("by_post", (q) => q.eq("postId", post._id))
      .collect();

    const reactionsByComment = new Map<string, Doc<"postReactions">[]>();
    for (const reaction of reactions) {
      if (!reaction.commentId) continue;
      const list = reactionsByComment.get(reaction.commentId) ?? [];
      list.push(reaction);
      reactionsByComment.set(reaction.commentId, list);
    }

    comments.sort((a, b) => a._creationTime - b._creationTime);
    const topLevel = comments.filter((c) => c.parentCommentId === undefined);
    const enriched = await Promise.all(
      topLevel.map(async (comment) => {
        const replies = comments.filter(
          (c) => c.parentCommentId === comment._id,
        );
        return {
          ...(await enrichComment(
            ctx,
            auth,
            comment,
            reactionsByComment,
            canModerate,
          )),
          replies: await Promise.all(
            replies.map((reply) =>
              enrichComment(ctx, auth, reply, reactionsByComment, canModerate),
            ),
          ),
        };
      }),
    );

    return {
      ...(await enrichPost(ctx, auth, post, canModerate)),
      seenCount: reads.length,
      comments: enriched,
    };
  },
});

/** Can the caller create a post in the given scope? Drives mobile UI state. */
export const myPostingAccess = query({
  args: { teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "posts");
    return {
      canPost: await canPostTo(ctx, auth, args.teamId),
      canModerate: await hasCapability(ctx, auth, "posts.moderate"),
      membersCanPost: args.teamId
        ? Boolean((await ctx.db.get(args.teamId))?.membersCanPost)
        : Boolean(auth.org.membersCanPost),
    };
  },
});

export const create = mutation({
  args: {
    title: v.optional(v.string()),
    body: v.string(),
    bodyFormat: v.optional(postBodyFormatValidator),
    teamId: v.optional(v.id("teams")),
    commentsDisabled: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "posts");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const postId = ctx.db.normalizeId("posts", replay.resultId);
      if (!postId) throw new Error("Invalid post idempotency result.");
      return postId;
    }
    if (replay) throw new Error("Missing post idempotency result.");

    const format = args.bodyFormat ?? "plain";
    const body = normalisePostBody(args.body, format);
    if (args.teamId) {
      const team = await ctx.db.get(args.teamId);
      assertSameOrg(auth, team);
    }
    if (!(await canPostTo(ctx, auth, args.teamId))) {
      throw new ConvexError({
        code: "forbidden",
        message: "You do not have permission to post here.",
      });
    }

    const postId = await ctx.db.insert("posts", {
      orgId: auth.org._id,
      teamId: args.teamId,
      title: args.title?.trim() || undefined,
      body,
      // Keep plain implicit (absent) so legacy rows and new plain rows match.
      bodyFormat: format === "html" ? "html" : undefined,
      commentsDisabled: args.commentsDisabled ?? false,
      createdBy: auth.user._id,
    });
    // The author has obviously seen their own post.
    await ctx.db.insert("postReads", {
      orgId: auth.org._id,
      postId,
      userId: auth.user._id,
      readAt: Date.now(),
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "posts:create",
      String(postId),
    );
    // Notify the audience by email (team roster, or whole org for org-wide
    // posts). Scheduled so it only fires once the post actually commits, and so
    // the slow per-recipient send work happens outside this mutation.
    await ctx.scheduler.runAfter(0, internal.postNotifications.deliver, {
      postId,
    });
    return postId;
  },
});

export const update = mutation({
  args: {
    postId: v.id("posts"),
    title: v.optional(v.union(v.string(), v.null())),
    body: v.optional(v.string()),
    bodyFormat: v.optional(postBodyFormatValidator),
    commentsDisabled: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "posts");
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const post = await ctx.db.get(args.postId);
    assertSameOrg(auth, post);
    if (!post) return;
    await requireAuthorOrModerator(ctx, auth, post.createdBy);

    // Effective format for this edit: explicit > existing > plain.
    const format: BodyFormat = args.bodyFormat ?? post.bodyFormat ?? "plain";
    const nextBody =
      args.body !== undefined
        ? normalisePostBody(args.body, format)
        : undefined;
    await ctx.db.patch(args.postId, {
      ...(args.title !== undefined
        ? { title: args.title?.trim() || undefined }
        : {}),
      ...(nextBody !== undefined ? { body: nextBody } : {}),
      // Only touch the format when the body itself is being replaced.
      ...(args.body !== undefined
        ? { bodyFormat: format === "html" ? "html" : undefined }
        : {}),
      ...(args.commentsDisabled !== undefined
        ? { commentsDisabled: args.commentsDisabled }
        : {}),
      editedAt: Date.now(),
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "posts:update",
      String(args.postId),
    );
  },
});

export const remove = mutation({
  args: {
    postId: v.id("posts"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "posts");
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const post = await ctx.db.get(args.postId);
    assertSameOrg(auth, post);
    if (!post) return;
    await requireAuthorOrModerator(ctx, auth, post.createdBy);

    const [comments, reactions, reads] = await Promise.all([
      ctx.db
        .query("postComments")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .collect(),
      ctx.db
        .query("postReactions")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .collect(),
      ctx.db
        .query("postReads")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .collect(),
    ]);
    for (const row of [...comments, ...reactions, ...reads]) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.delete(args.postId);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "posts:remove",
      String(args.postId),
    );
  },
});

/**
 * Set (or clear, with `kind: null`) the caller's reaction on a post or — when
 * `commentId` is given — on a comment/reply. One reaction per user per target.
 */
export const setReaction = mutation({
  args: {
    postId: v.id("posts"),
    commentId: v.optional(v.id("postComments")),
    kind: v.union(postReactionKindValidator, v.null()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "posts");
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const post = await ctx.db.get(args.postId);
    assertSameOrg(auth, post);
    if (!post) return;
    if (args.commentId) {
      const comment = await ctx.db.get(args.commentId);
      assertSameOrg(auth, comment);
      if (!comment || comment.postId !== args.postId) {
        throw new ConvexError("Comment does not belong to this post.");
      }
    }

    const existing = await ctx.db
      .query("postReactions")
      .withIndex("by_target_and_user", (q) =>
        q
          .eq("postId", args.postId)
          .eq("commentId", args.commentId)
          .eq("userId", auth.user._id),
      )
      .unique();
    if (args.kind === null) {
      if (existing) await ctx.db.delete(existing._id);
    } else if (existing) {
      if (existing.kind !== args.kind) {
        await ctx.db.patch(existing._id, { kind: args.kind });
      }
    } else {
      await ctx.db.insert("postReactions", {
        orgId: auth.org._id,
        postId: args.postId,
        commentId: args.commentId,
        userId: auth.user._id,
        kind: args.kind,
      });
    }
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "posts:setReaction",
    );
  },
});

export const addComment = mutation({
  args: {
    postId: v.id("posts"),
    body: v.string(),
    parentCommentId: v.optional(v.id("postComments")),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "posts");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const commentId = ctx.db.normalizeId("postComments", replay.resultId);
      if (!commentId) throw new Error("Invalid comment idempotency result.");
      return commentId;
    }
    if (replay) throw new Error("Missing comment idempotency result.");

    const body = args.body.trim();
    if (!body) throw new ConvexError("Comment body is required.");
    const post = await ctx.db.get(args.postId);
    assertSameOrg(auth, post);
    if (!post) throw new ConvexError("Not found.");
    if (post.commentsDisabled) {
      throw new ConvexError({
        code: "forbidden",
        message: "Comments are disabled on this post.",
      });
    }
    if (args.parentCommentId) {
      const parent = await ctx.db.get(args.parentCommentId);
      assertSameOrg(auth, parent);
      if (!parent || parent.postId !== args.postId) {
        throw new ConvexError("Comment does not belong to this post.");
      }
      if (parent.parentCommentId !== undefined) {
        throw new ConvexError("Replies can only be one level deep.");
      }
    }

    const commentId = await ctx.db.insert("postComments", {
      orgId: auth.org._id,
      postId: args.postId,
      parentCommentId: args.parentCommentId,
      body,
      createdBy: auth.user._id,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "posts:addComment",
      String(commentId),
    );
    return commentId;
  },
});

export const updateComment = mutation({
  args: {
    commentId: v.id("postComments"),
    body: v.string(),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "posts");
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const comment = await ctx.db.get(args.commentId);
    assertSameOrg(auth, comment);
    if (!comment) return;
    await requireAuthorOrModerator(ctx, auth, comment.createdBy);
    const body = args.body.trim();
    if (!body) throw new ConvexError("Comment body is required.");
    await ctx.db.patch(args.commentId, { body, editedAt: Date.now() });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "posts:updateComment",
      String(args.commentId),
    );
  },
});

export const removeComment = mutation({
  args: {
    commentId: v.id("postComments"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "posts");
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const comment = await ctx.db.get(args.commentId);
    assertSameOrg(auth, comment);
    if (!comment) return;
    await requireAuthorOrModerator(ctx, auth, comment.createdBy);

    const replies = await ctx.db
      .query("postComments")
      .withIndex("by_parent", (q) => q.eq("parentCommentId", comment._id))
      .collect();
    for (const target of [comment, ...replies]) {
      const reactions = await ctx.db
        .query("postReactions")
        .withIndex("by_comment", (q) => q.eq("commentId", target._id))
        .collect();
      for (const reaction of reactions) {
        await ctx.db.delete(reaction._id);
      }
    }
    for (const reply of replies) {
      await ctx.db.delete(reply._id);
    }
    await ctx.db.delete(args.commentId);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "posts:removeComment",
      String(args.commentId),
    );
  },
});

export const markRead = mutation({
  args: {
    postId: v.id("posts"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const post = await ctx.db.get(args.postId);
    assertSameOrg(auth, post);
    const existing = await ctx.db
      .query("postReads")
      .withIndex("by_post_and_user", (q) =>
        q.eq("postId", args.postId).eq("userId", auth.user._id),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("postReads", {
        orgId: auth.org._id,
        postId: args.postId,
        userId: auth.user._id,
        readAt: Date.now(),
      });
    }
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "posts:markRead",
    );
  },
});

/**
 * Toggle whether plain members can post: to one team's feed (`teamId` set) or
 * the org-wide feed (`teamId` omitted). Spond's "let members create posts".
 */
export const setMemberPosting = mutation({
  args: {
    teamId: v.optional(v.id("teams")),
    enabled: v.boolean(),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "posts");
    await requireCapability(ctx, auth, "posts.moderate");
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    if (args.teamId) {
      const team = await ctx.db.get(args.teamId);
      assertSameOrg(auth, team);
      await ctx.db.patch(args.teamId, { membersCanPost: args.enabled });
    } else {
      await ctx.db.patch(auth.org._id, { membersCanPost: args.enabled });
    }
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "posts:setMemberPosting",
    );
  },
});
