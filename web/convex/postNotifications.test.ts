import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { signUnsubscribe, verifyUnsubscribe } from "./lib/unsubscribe";

const modules = import.meta.glob("./**/*.ts");

/** Seed an org with an author user/member and return ids + a test client. */
async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const authorUser = await ctx.db.insert("users", {
      clerkUserId: "author",
      email: "author@example.test",
      firstName: "Ava",
      lastName: "Author",
    });
    const orgId = await ctx.db.insert("organizations", {
      name: "Riverside FC",
      createdBy: authorUser,
    });
    return { orgId, authorUser };
  });
}

async function addMember(
  t: ReturnType<typeof convexTest>,
  orgId: Id<"organizations">,
  opts: { first: string; email?: string; status?: "active" | "inactive" },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("members", {
      orgId,
      firstName: opts.first,
      lastName: "Person",
      email: opts.email,
      status: opts.status ?? "active",
      isVolunteer: false,
    }),
  );
}

async function enqueueEmails(
  t: ReturnType<typeof convexTest>,
  postId: Id<"posts">,
): Promise<string[]> {
  const job = await t.mutation(internal.postNotifications.enqueue, { postId });
  if (!job) return [];
  return job.recipients.map((r) => r.email).sort();
}

describe("post notifications: audience resolution", () => {
  test("org-wide post notifies all active members with email, minus author", async () => {
    const t = convexTest(schema, modules);
    const { orgId, authorUser } = await seed(t);
    await addMember(t, orgId, { first: "Bea", email: "bea@example.test" });
    await addMember(t, orgId, { first: "Cy", email: "cy@example.test" });
    await addMember(t, orgId, { first: "NoEmail" }); // no email → skipped
    await addMember(t, orgId, {
      first: "Dormant",
      email: "d@example.test",
      status: "inactive",
    }); // inactive → skipped
    // The author has a member record too; must not email themselves.
    await t.run(async (ctx) =>
      ctx.db.insert("members", {
        orgId,
        firstName: "Ava",
        lastName: "Author",
        email: "author@example.test",
        status: "active",
        isVolunteer: false,
        userId: authorUser,
      }),
    );

    const postId = await t.run(async (ctx) =>
      ctx.db.insert("posts", {
        orgId,
        body: "Org-wide announcement",
        commentsDisabled: false,
        createdBy: authorUser,
      }),
    );

    expect(await enqueueEmails(t, postId)).toEqual([
      "bea@example.test",
      "cy@example.test",
    ]);
  });

  test("team post notifies only that team's roster", async () => {
    const t = convexTest(schema, modules);
    const { orgId, authorUser } = await seed(t);
    const onTeam = await addMember(t, orgId, {
      first: "Tim",
      email: "tim@example.test",
    });
    const offTeam = await addMember(t, orgId, {
      first: "Off",
      email: "off@example.test",
    });

    const teamId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("teams", {
        orgId,
        name: "U10",
        isActive: true,
      });
      await ctx.db.insert("teamMembers", {
        orgId,
        teamId: id,
        memberId: onTeam,
        role: "player",
      });
      return id;
    });
    void offTeam;

    const postId = await t.run(async (ctx) =>
      ctx.db.insert("posts", {
        orgId,
        teamId,
        body: "Team-only note",
        commentsDisabled: false,
        createdBy: authorUser,
      }),
    );

    expect(await enqueueEmails(t, postId)).toEqual(["tim@example.test"]);
  });

  test("opted-out and duplicate addresses are excluded; rows are queued", async () => {
    const t = convexTest(schema, modules);
    const { orgId, authorUser } = await seed(t);
    await addMember(t, orgId, { first: "Bea", email: "bea@example.test" });
    await addMember(t, orgId, { first: "Opt", email: "opt@example.test" });
    // Duplicate address (different casing) should only notify once.
    await addMember(t, orgId, { first: "Dup", email: "BEA@example.test" });
    await t.run(async (ctx) =>
      ctx.db.insert("emailOptOuts", {
        orgId,
        email: "opt@example.test",
        scope: "community_posts",
        createdAt: 0,
      }),
    );

    const postId = await t.run(async (ctx) =>
      ctx.db.insert("posts", {
        orgId,
        body: "Hello",
        commentsDisabled: false,
        createdBy: authorUser,
      }),
    );

    expect(await enqueueEmails(t, postId)).toEqual(["bea@example.test"]);

    const queued = await t.run(async (ctx) =>
      ctx.db
        .query("postNotifications")
        .withIndex("by_post", (q) => q.eq("postId", postId))
        .collect(),
    );
    expect(queued).toHaveLength(1);
    expect(queued[0]!.status).toBe("queued");
  });
});

describe("unsubscribe tokens", () => {
  const secret = "test-secret";
  const payload = {
    orgId: "org_123",
    email: "Person@Example.test",
    scope: "community_posts",
  };

  test("a signed token round-trips and lowercases the email", async () => {
    const token = await signUnsubscribe(payload, secret);
    const decoded = await verifyUnsubscribe(token, secret);
    expect(decoded).toEqual({
      orgId: "org_123",
      email: "person@example.test",
      scope: "community_posts",
    });
  });

  test("a tampered token or wrong secret is rejected", async () => {
    const token = await signUnsubscribe(payload, secret);
    expect(await verifyUnsubscribe(token, "other-secret")).toBeNull();
    expect(await verifyUnsubscribe(`${token}x`, secret)).toBeNull();
    expect(await verifyUnsubscribe("garbage", secret)).toBeNull();
  });
});
