import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMember, assertSameOrg } from "./lib/auth";
import { requireCapability } from "./lib/capabilities";

/** List members flagged as volunteers, with their certifications. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const volunteers = await ctx.db
      .query("members")
      .withIndex("by_org_and_volunteer", (q) =>
        q.eq("orgId", auth.org._id).eq("isVolunteer", true),
      )
      .collect();

    return await Promise.all(
      volunteers
        .sort((a, b) => a.lastName.localeCompare(b.lastName))
        .map(async (m) => {
          const certs = await ctx.db
            .query("volunteerCertifications")
            .withIndex("by_member", (q) => q.eq("memberId", m._id))
            .collect();
          return { member: m, certifications: certs };
        }),
    );
  },
});

/** Certifications expiring within `withinDays` (default 60) or already expired. */
export const expiringCertifications = query({
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
      expiring.map(async (c) => ({
        cert: c,
        member: await ctx.db.get(c.memberId),
      })),
    );
  },
});

export const addCertification = mutation({
  args: {
    memberId: v.id("members"),
    name: v.string(),
    issuer: v.optional(v.string()),
    issuedDate: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "volunteers.manage");
    const member = await ctx.db.get(args.memberId);
    assertSameOrg(auth, member);
    // Ensure the member is flagged as a volunteer.
    if (member && !member.isVolunteer) {
      await ctx.db.patch(args.memberId, { isVolunteer: true });
    }
    return await ctx.db.insert("volunteerCertifications", {
      orgId: auth.org._id,
      memberId: args.memberId,
      name: args.name,
      issuer: args.issuer,
      issuedDate: args.issuedDate,
      expiryDate: args.expiryDate,
      notes: args.notes,
    });
  },
});

export const removeCertification = mutation({
  args: { certId: v.id("volunteerCertifications") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireCapability(ctx, auth, "volunteers.manage");
    const cert = await ctx.db.get(args.certId);
    assertSameOrg(auth, cert);
    await ctx.db.delete(args.certId);
  },
});
