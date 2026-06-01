import { query } from "./_generated/server";
import { requireOrgMember } from "./lib/auth";

/** Aggregate counts and headline figures for the workspace dashboard. */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const orgId = auth.org._id;

    const [members, teams, assets, sponsors] = await Promise.all([
      ctx.db
        .query("members")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect(),
      ctx.db
        .query("teams")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect(),
      ctx.db
        .query("assets")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect(),
      ctx.db
        .query("sponsors")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect(),
    ]);

    const now = Date.now();
    const upcomingEvents = (
      await ctx.db
        .query("events")
        .withIndex("by_org_and_start", (q) => q.eq("orgId", orgId))
        .collect()
    ).filter((e) => (e.endTime ?? e.startTime) >= now);

    const horizon = new Date(now + 60 * 86_400_000).toISOString().slice(0, 10);
    const expiringCerts = (
      await ctx.db
        .query("volunteerCertifications")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    ).filter((c) => c.expiryDate !== undefined && c.expiryDate <= horizon);

    return {
      memberCount: members.filter((m) => m.status === "active").length,
      totalMemberCount: members.length,
      teamCount: teams.filter((t) => t.isActive).length,
      upcomingEventCount: upcomingEvents.length,
      assetCount: assets.length,
      checkedOutCount: assets.filter(
        (a) => a.status === "checked_out" || a.status === "in_use",
      ).length,
      lostCount: assets.filter((a) => a.status === "lost").length,
      maintenanceCount: assets.filter((a) => a.status === "maintenance").length,
      overdueCount: assets.filter(
        (a) =>
          a.status === "checked_out" &&
          a.dueBack !== undefined &&
          a.dueBack < now,
      ).length,
      volunteerCount: members.filter((m) => m.isVolunteer).length,
      expiringCertCount: expiringCerts.length,
      sponsorCount: sponsors.length,
      sponsorValue: sponsors.reduce(
        (sum, s) => sum + (s.sponsorshipValue ?? 0),
        0,
      ),
    };
  },
});

/** Most recent audit-log entries across all assets (basic audit report). */
export const recentAudit = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const entries = await ctx.db
      .query("assetAuditLog")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .order("desc")
      .take(50);
    return await Promise.all(
      entries.map(async (e) => {
        const asset = await ctx.db.get(e.assetId);
        const performer = await ctx.db.get(e.performedBy);
        return {
          ...e,
          assetName: asset?.name ?? "(deleted asset)",
          performerName: performer
            ? `${performer.firstName ?? ""} ${performer.lastName ?? ""}`.trim()
            : "Unknown",
        };
      }),
    );
  },
});
