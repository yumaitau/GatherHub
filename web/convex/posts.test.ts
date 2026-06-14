import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { Role } from "./lib/auth";

// Vite-style module discovery for convex-test.
const modules = import.meta.glob("./**/*.ts");

// Creating a post schedules the email-notification action (posts.create →
// scheduler.runAfter). convex-test runs scheduled work on a real setTimeout
// that would otherwise fire after the test tears down. Fake ONLY the timer
// functions (not Date, so timestamp ordering elsewhere is unaffected) so the
// scheduled job is captured and discarded — these tests don't assert on email.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Seed an org + user + membership and return an authed test client. */
async function seedOrg(
  t: ReturnType<typeof convexTest>,
  opts: { clerkOrg: string; clerkUser: string; role: Role },
) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: opts.clerkUser,
      email: `${opts.clerkUser}@example.test`,
      firstName: opts.clerkUser,
    });
    const orgId = await ctx.db.insert("organizations", {
      name: opts.clerkOrg,
      slug: opts.clerkOrg,
      createdBy: userId,
    });
    await ctx.db.insert("memberships", {
      orgId,
      userId,
      role: opts.role,
    });
    await ctx.db.patch(userId, { activeOrgId: orgId });
    return { orgId, userId };
  });
  const as = t.withIdentity({ subject: opts.clerkUser });
  return { ...ids, as };
}

/** Add a second user to an existing org. */
async function addUser(
  t: ReturnType<typeof convexTest>,
  orgId: Awaited<ReturnType<typeof seedOrg>>["orgId"],
  opts: { clerkUser: string; role: Role },
) {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: opts.clerkUser,
      email: `${opts.clerkUser}@example.test`,
      firstName: opts.clerkUser,
      activeOrgId: orgId,
    });
    await ctx.db.insert("memberships", { orgId, userId, role: opts.role });
    return userId;
  });
  const as = t.withIdentity({ subject: opts.clerkUser });
  return { userId, as };
}

describe("posts: organisation isolation", () => {
  test("a post in org A is invisible to org B", async () => {
    const t = convexTest(schema, modules);
    const a = await seedOrg(t, {
      clerkOrg: "org_a",
      clerkUser: "posts_user_a",
      role: "owner",
    });
    const b = await seedOrg(t, {
      clerkOrg: "org_b",
      clerkUser: "posts_user_b",
      role: "owner",
    });

    const postId = await a.as.mutation(api.posts.create, {
      body: "Hello org A",
    });

    expect(await a.as.query(api.posts.list, {})).toHaveLength(1);
    expect(await b.as.query(api.posts.list, {})).toHaveLength(0);
    await expect(b.as.query(api.posts.get, { postId })).rejects.toThrow(
      /not found/i,
    );
  });
});

describe("posts: posting permissions", () => {
  test("a player cannot post org-wide until the member toggle is on", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      clerkOrg: "org_toggle",
      clerkUser: "posts_owner",
      role: "owner",
    });
    const player = await addUser(t, owner.orgId, {
      clerkUser: "posts_player",
      role: "player",
    });

    await expect(
      player.as.mutation(api.posts.create, { body: "Can I post?" }),
    ).rejects.toThrow(/permission/i);

    await owner.as.mutation(api.posts.setMemberPosting, { enabled: true });
    const postId = await player.as.mutation(api.posts.create, {
      body: "Now I can.",
    });
    expect(postId).toBeTruthy();
  });

  test("team posting requires the toggle and roster membership", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      clerkOrg: "org_team_posts",
      clerkUser: "posts_team_owner",
      role: "owner",
    });
    const player = await addUser(t, owner.orgId, {
      clerkUser: "posts_team_player",
      role: "player",
    });
    const outsider = await addUser(t, owner.orgId, {
      clerkUser: "posts_team_outsider",
      role: "player",
    });

    const teamId = await t.run(async (ctx) =>
      ctx.db.insert("teams", {
        orgId: owner.orgId,
        name: "U13",
        isActive: true,
        membersCanPost: true,
      }),
    );
    await t.run(async (ctx) => {
      const memberId = await ctx.db.insert("members", {
        orgId: owner.orgId,
        userId: player.userId,
        firstName: "Roster",
        lastName: "Player",
        status: "active",
        isVolunteer: false,
      });
      await ctx.db.insert("teamMembers", {
        orgId: owner.orgId,
        teamId,
        memberId,
        role: "player",
      });
    });

    const postId = await player.as.mutation(api.posts.create, {
      body: "Team post",
      teamId,
    });
    expect(postId).toBeTruthy();

    await expect(
      outsider.as.mutation(api.posts.create, { body: "Not my team", teamId }),
    ).rejects.toThrow(/permission/i);
  });
});

describe("posts: comments and reactions", () => {
  test("comment, one-level reply, reactions, and read tracking", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      clerkOrg: "org_social",
      clerkUser: "posts_social_owner",
      role: "owner",
    });
    const player = await addUser(t, owner.orgId, {
      clerkUser: "posts_social_player",
      role: "player",
    });

    const postId = await owner.as.mutation(api.posts.create, {
      title: "Working bee",
      body: "Saturday 9am, bring gloves.",
    });

    const commentId = await player.as.mutation(api.posts.addComment, {
      postId,
      body: "I'll be there.",
    });
    const replyId = await owner.as.mutation(api.posts.addComment, {
      postId,
      body: "Great!",
      parentCommentId: commentId,
    });
    // Replies cannot nest deeper than one level.
    await expect(
      player.as.mutation(api.posts.addComment, {
        postId,
        body: "Too deep",
        parentCommentId: replyId,
      }),
    ).rejects.toThrow(/one level/i);

    await player.as.mutation(api.posts.setReaction, {
      postId,
      kind: "celebrate",
    });
    await owner.as.mutation(api.posts.setReaction, {
      postId,
      commentId,
      kind: "like",
    });
    await player.as.mutation(api.posts.markRead, { postId });

    const detail = await player.as.query(api.posts.get, { postId });
    expect(detail).not.toBeNull();
    expect(detail!.commentCount).toBe(2);
    expect(detail!.reactionCounts.celebrate).toBe(1);
    expect(detail!.myReaction).toBe("celebrate");
    expect(detail!.isRead).toBe(true);
    expect(detail!.seenCount).toBe(2); // author + player
    expect(detail!.comments).toHaveLength(1);
    const topComment = detail!.comments[0]!;
    expect(topComment.replies).toHaveLength(1);
    expect(topComment.reactionCounts.like).toBe(1);

    // Clearing a reaction removes it.
    await player.as.mutation(api.posts.setReaction, { postId, kind: null });
    const after = await player.as.query(api.posts.get, { postId });
    expect(after!.reactionCounts.celebrate).toBe(0);
  });

  test("commentsDisabled blocks new comments", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      clerkOrg: "org_quiet",
      clerkUser: "posts_quiet_owner",
      role: "owner",
    });
    const player = await addUser(t, owner.orgId, {
      clerkUser: "posts_quiet_player",
      role: "player",
    });

    const postId = await owner.as.mutation(api.posts.create, {
      body: "Read-only notice.",
      commentsDisabled: true,
    });
    await expect(
      player.as.mutation(api.posts.addComment, { postId, body: "Hi" }),
    ).rejects.toThrow(/disabled/i);
  });
});

describe("posts: rich text", () => {
  test("html body round-trips with bodyFormat; empty markup is rejected", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      clerkOrg: "org_richtext",
      clerkUser: "posts_rt_owner",
      role: "owner",
    });

    const html = "<h2>Notice</h2><p><strong>Bring boots.</strong></p>";
    const postId = await owner.as.mutation(api.posts.create, {
      body: html,
      bodyFormat: "html",
    });

    const detail = await owner.as.query(api.posts.get, { postId });
    expect(detail!.body).toBe(html);
    expect(detail!.bodyFormat).toBe("html");

    // Legacy plain posts report bodyFormat "plain".
    const plainId = await owner.as.mutation(api.posts.create, {
      body: "Just text",
    });
    const plain = await owner.as.query(api.posts.get, { postId: plainId });
    expect(plain!.bodyFormat).toBe("plain");

    // Markup with no visible text is treated as empty.
    await expect(
      owner.as.mutation(api.posts.create, {
        body: "<p></p>",
        bodyFormat: "html",
      }),
    ).rejects.toThrow(/required/i);
  });

  test("dangerous html bodies are rejected by the write-side tripwire", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      clerkOrg: "org_rt_unsafe",
      clerkUser: "posts_rt_unsafe_owner",
      role: "owner",
    });

    // Constructs a sanitized post body never contains: a direct API call that
    // bypasses the client sanitizer must not be able to store them.
    const unsafe = [
      "<p>hi</p><script>alert(1)</script>",
      '<iframe src="https://evil.test"></iframe>',
      '<p onclick="steal()">tap</p>',
      '<a href="javascript:alert(1)">x</a>',
      '<img src="data:text/html;base64,abc">',
    ];
    for (const body of unsafe) {
      await expect(
        owner.as.mutation(api.posts.create, { body, bodyFormat: "html" }),
      ).rejects.toThrow(/unsafe|unsupported/i);
    }

    // A clean body with an https image and a link still goes through.
    const safe =
      '<p>See <a href="https://x.test">site</a></p><img src="https://x.test/a.png" alt="a">';
    const postId = await owner.as.mutation(api.posts.create, {
      body: safe,
      bodyFormat: "html",
    });
    const detail = await owner.as.query(api.posts.get, { postId });
    expect(detail!.bodyFormat).toBe("html");
  });
});

describe("posts: moderation", () => {
  test("authors edit their own; players cannot touch others'; owners can", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOrg(t, {
      clerkOrg: "org_mod",
      clerkUser: "posts_mod_owner",
      role: "owner",
    });
    const player = await addUser(t, owner.orgId, {
      clerkUser: "posts_mod_player",
      role: "player",
    });
    await owner.as.mutation(api.posts.setMemberPosting, { enabled: true });

    const postId = await player.as.mutation(api.posts.create, {
      body: "My post",
    });
    await player.as.mutation(api.posts.update, {
      postId,
      body: "My edited post",
    });

    const ownerPostId = await owner.as.mutation(api.posts.create, {
      body: "Owner post",
    });
    await expect(
      player.as.mutation(api.posts.remove, { postId: ownerPostId }),
    ).rejects.toThrow(/permission|forbidden/i);

    // Moderator deletes the player's post; comments and reactions cascade.
    await owner.as.mutation(api.posts.addComment, {
      postId,
      body: "A comment",
    });
    await owner.as.mutation(api.posts.setReaction, { postId, kind: "love" });
    await owner.as.mutation(api.posts.remove, { postId });
    const rows = await t.run(async (ctx) => ({
      comments: await ctx.db.query("postComments").collect(),
      reactions: await ctx.db.query("postReactions").collect(),
      reads: await ctx.db.query("postReads").collect(),
    }));
    expect(rows.comments.filter((c) => c.postId === postId)).toHaveLength(0);
    expect(rows.reactions.filter((r) => r.postId === postId)).toHaveLength(0);
    expect(rows.reads.filter((r) => r.postId === postId)).toHaveLength(0);
  });
});
