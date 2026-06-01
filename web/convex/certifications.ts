import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertSameOrg, requireOrgMember, requireRole } from "./lib/auth";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";
import { requireModule } from "./lib/orgConfig";

const nullableString = v.union(v.string(), v.null());

/** Generic training/certification records across all members. */
export const list = query({
  args: { memberId: v.optional(v.id("members")) },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    if (args.memberId) {
      const member = await ctx.db.get(args.memberId);
      assertSameOrg(auth, member);
    }

    const certs = args.memberId
      ? await ctx.db
          .query("volunteerCertifications")
          .withIndex("by_member", (q) => q.eq("memberId", args.memberId!))
          .collect()
      : await ctx.db
          .query("volunteerCertifications")
          .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
          .collect();

    certs.sort((a, b) => {
      const expiry = (a.expiryDate ?? "9999").localeCompare(
        b.expiryDate ?? "9999",
      );
      if (expiry !== 0) return expiry;
      return a.name.localeCompare(b.name);
    });

    return await Promise.all(
      certs.map(async (cert) => ({
        cert,
        member: await ctx.db.get(cert.memberId),
      })),
    );
  },
});

/** Certifications expiring within `withinDays` (default 60) or already expired. */
export const expiring = query({
  args: { withinDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const horizonDays = args.withinDays ?? 60;
    const horizon = new Date(Date.now() + horizonDays * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const certs = await ctx.db
      .query("volunteerCertifications")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();

    const expiring = certs.filter(
      (c) => c.expiryDate !== undefined && c.expiryDate <= horizon,
    );
    expiring.sort((a, b) =>
      (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""),
    );

    return await Promise.all(
      expiring.map(async (cert) => ({
        cert,
        member: await ctx.db.get(cert.memberId),
      })),
    );
  },
});

export const create = mutation({
  args: {
    memberId: v.id("members"),
    name: v.string(),
    issuer: v.optional(v.string()),
    issuedDate: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    await requireModule(ctx, auth, "training");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const certId = ctx.db.normalizeId(
        "volunteerCertifications",
        replay.resultId,
      );
      if (!certId) throw new Error("Invalid certification idempotency result.");
      return certId;
    }
    if (replay) throw new Error("Missing certification idempotency result.");
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({
        code: "invalid_certification",
        message: "Certification name is required.",
      });
    }

    const certId = await ctx.db.insert("volunteerCertifications", {
      orgId: auth.org._id,
      memberId: args.memberId,
      name,
      issuer: args.issuer?.trim() || undefined,
      issuedDate: args.issuedDate,
      expiryDate: args.expiryDate,
      notes: args.notes?.trim() || undefined,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "certifications:create",
      String(certId),
    );
    return certId;
  },
});

export const update = mutation({
  args: {
    certId: v.id("volunteerCertifications"),
    memberId: v.optional(v.id("members")),
    name: v.optional(v.string()),
    issuer: v.optional(nullableString),
    issuedDate: v.optional(nullableString),
    expiryDate: v.optional(nullableString),
    notes: v.optional(nullableString),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    await requireModule(ctx, auth, "training");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return;
    const cert = await ctx.db.get(args.certId);
    assertSameOrg(auth, cert);

    const patch: Record<string, unknown> = {};
    if (args.memberId !== undefined) {
      const member = await ctx.db.get(args.memberId);
      assertSameOrg(auth, member);
      patch.memberId = args.memberId;
    }
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError({
          code: "invalid_certification",
          message: "Certification name is required.",
        });
      }
      patch.name = name;
    }
    if (args.issuer !== undefined)
      patch.issuer = args.issuer?.trim() || undefined;
    if (args.issuedDate !== undefined)
      patch.issuedDate = args.issuedDate ?? undefined;
    if (args.expiryDate !== undefined)
      patch.expiryDate = args.expiryDate ?? undefined;
    if (args.notes !== undefined) patch.notes = args.notes?.trim() || undefined;

    await ctx.db.patch(args.certId, patch);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "certifications:update",
      String(args.certId),
    );
  },
});

export const remove = mutation({
  args: {
    certId: v.id("volunteerCertifications"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireRole(ctx, "committee");
    await requireModule(ctx, auth, "training");
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const cert = await ctx.db.get(args.certId);
    assertSameOrg(auth, cert);
    await ctx.db.delete(args.certId);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "certifications:remove",
      String(args.certId),
    );
  },
});
