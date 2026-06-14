import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireOrgMember, assertSameOrg, type AuthContext } from "./lib/auth";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";
import { requireCapability } from "./lib/capabilities";
import { requireModule } from "./lib/orgConfig";
import { writeAudit } from "./lib/audit";
import {
  fleetAssetTypeValidator,
  fleetInspectionTypeValidator,
  fleetInspectionResultValidator,
  assetDefectSeverityValidator,
  assetDefectStatusValidator,
  maintenanceKindValidator,
  maintenanceStatusValidator,
} from "./schema";

/**
 * Fleet / asset-compliance backend (GX-12). Turns assets with an `assetType`
 * into compliance-tracked fleet (vehicles, trailers, plant, bins, …) with a
 * pre-start/periodic inspection log, defect tracking, and maintenance/service
 * scheduling.
 *
 * Authorisation:
 * - reads require `assets.read` (crews/drivers have it),
 * - field actions (inspections, defect reports) require `fleet.inspect`,
 * - management (defect resolution, maintenance, service rules, fleet metadata)
 *   requires `fleet.manage`.
 * All gated behind the `fleet` module being enabled for the org.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_SOON_DAYS = 30;

type Severity = Doc<"assetDefects">["severity"];

/** Critical/major defects block work assignment by default; minor do not. */
function defaultBlocksAssignment(severity: Severity): boolean {
  return severity !== "minor";
}

function memberName(member: Doc<"members"> | null): string | null {
  return member ? `${member.firstName} ${member.lastName}`.trim() : null;
}

/** Parse an ISO yyyy-mm-dd date to epoch ms, or null. */
function isoToMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

async function requireFleetRead(ctx: QueryCtx | MutationCtx) {
  const auth = await requireOrgMember(ctx);
  await requireModule(ctx, auth, "fleet");
  await requireCapability(ctx, auth, "assets.read");
  return auth;
}

async function requireFleetAsset(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  assetId: Id<"assets">,
): Promise<Doc<"assets">> {
  const asset = await ctx.db.get(assetId);
  assertSameOrg(auth, asset);
  return asset!;
}

/**
 * Whether an asset is blocked from being assigned to a route/job, with reasons.
 * Exported so field-service job assignment can consult it once GX-10 lands on
 * `main` (forward-compatible hook for the "defects block assignment" criterion).
 */
export async function assetAssignmentBlock(
  ctx: QueryCtx | MutationCtx,
  assetId: Id<"assets">,
): Promise<{ blocked: boolean; reasons: string[] }> {
  const open = await ctx.db
    .query("assetDefects")
    .withIndex("by_asset_and_status", (q) =>
      q.eq("assetId", assetId).eq("status", "open"),
    )
    .collect();
  const blocking = open.filter((d) => d.blocksAssignment);
  return {
    blocked: blocking.length > 0,
    reasons: blocking.map((d) => `${d.severity}: ${d.title}`),
  };
}

type ComplianceFlag =
  | "out_of_service"
  | "defect"
  | "overdue_service"
  | "expiring_docs"
  | "ok";

/** Roll an asset + its open defects into a single dashboard compliance state. */
function complianceState(
  asset: Doc<"assets">,
  openDefects: Doc<"assetDefects">[],
  now: number,
): { flag: ComplianceFlag; blocked: boolean; alerts: string[] } {
  const alerts: string[] = [];
  const blocking = openDefects.filter((d) => d.blocksAssignment);
  const blocked = blocking.length > 0;

  const soon = now + EXPIRY_SOON_DAYS * DAY_MS;
  const expiryChecks: [string, string | undefined][] = [
    ["Registration", asset.registrationExpiry],
    ["Insurance", asset.insuranceExpiry],
    ["Inspection", asset.inspectionExpiry],
  ];
  let expiring = false;
  for (const [label, iso] of expiryChecks) {
    const ms = isoToMs(iso);
    if (ms === null) continue;
    if (ms < now) {
      alerts.push(`${label} expired`);
      expiring = true;
    } else if (ms < soon) {
      alerts.push(`${label} expires soon`);
      expiring = true;
    }
  }

  const serviceDateMs = isoToMs(asset.nextServiceDate);
  const overdueByDate = serviceDateMs !== null && serviceDateMs < now;
  const overdueByOdo =
    asset.nextServiceOdometer !== undefined &&
    asset.odometer !== undefined &&
    asset.odometer >= asset.nextServiceOdometer;
  const overdueService = overdueByDate || overdueByOdo;
  if (overdueService) alerts.push("Service overdue");

  for (const d of blocking) alerts.push(`${d.severity} defect: ${d.title}`);

  let flag: ComplianceFlag = "ok";
  if (asset.status === "maintenance" || blocked) flag = "out_of_service";
  else if (openDefects.length > 0) flag = "defect";
  else if (overdueService) flag = "overdue_service";
  else if (expiring) flag = "expiring_docs";

  return { flag, blocked, alerts };
}

// --- Queries ----------------------------------------------------------------

/** Fleet dashboard: every compliance-tracked asset with its rolled-up state. */
export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireFleetRead(ctx);
    const now = Date.now();
    const assets = (
      await ctx.db
        .query("assets")
        .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
        .collect()
    ).filter((a) => a.assetType !== undefined && a.status !== "retired");

    const rows = await Promise.all(
      assets.map(async (asset) => {
        const openDefects = await ctx.db
          .query("assetDefects")
          .withIndex("by_asset_and_status", (q) =>
            q.eq("assetId", asset._id).eq("status", "open"),
          )
          .collect();
        const driver = asset.assignedDriverMemberId
          ? await ctx.db.get(asset.assignedDriverMemberId)
          : null;
        const state = complianceState(asset, openDefects, now);
        return {
          _id: asset._id,
          name: asset.name,
          assetType: asset.assetType!,
          registration: asset.registration ?? null,
          status: asset.status,
          odometer: asset.odometer ?? null,
          odometerUnit: asset.odometerUnit ?? "km",
          assignedDriverName: memberName(driver),
          openDefectCount: openDefects.length,
          ...state,
        };
      }),
    );

    const counts = {
      total: rows.length,
      outOfService: rows.filter((r) => r.flag === "out_of_service").length,
      defect: rows.filter((r) => r.flag === "defect").length,
      overdueService: rows.filter((r) => r.flag === "overdue_service").length,
      expiringDocs: rows.filter((r) => r.flag === "expiring_docs").length,
      ok: rows.filter((r) => r.flag === "ok").length,
    };

    // Worst-state first so attention items float to the top.
    const order: Record<ComplianceFlag, number> = {
      out_of_service: 0,
      defect: 1,
      overdue_service: 2,
      expiring_docs: 3,
      ok: 4,
    };
    rows.sort(
      (a, b) => order[a.flag] - order[b.flag] || a.name.localeCompare(b.name),
    );

    return { counts, assets: rows };
  },
});

/** Full detail for one fleet asset: inspections, defects, maintenance, rules. */
export const vehicle = query({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const auth = await requireFleetRead(ctx);
    const asset = await requireFleetAsset(ctx, auth, args.assetId);
    const now = Date.now();

    const [inspections, defects, maintenance, rules, driver] =
      await Promise.all([
        ctx.db
          .query("assetInspections")
          .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
          .collect(),
        ctx.db
          .query("assetDefects")
          .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
          .collect(),
        ctx.db
          .query("maintenanceJobs")
          .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
          .collect(),
        ctx.db
          .query("fleetServiceRules")
          .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
          .collect(),
        asset.assignedDriverMemberId
          ? ctx.db.get(asset.assignedDriverMemberId)
          : Promise.resolve(null),
      ]);

    inspections.sort((a, b) => b.performedAt - a.performedAt);
    defects.sort((a, b) => b.reportedAt - a.reportedAt);
    maintenance.sort(
      (a, b) =>
        (isoToMs(b.scheduledFor) ?? b.createdAt) -
        (isoToMs(a.scheduledFor) ?? a.createdAt),
    );

    const openDefects = defects.filter((d) => d.status !== "resolved");
    const state = complianceState(asset, openDefects, now);

    return {
      asset: { ...asset, assignedDriverName: memberName(driver) },
      compliance: state,
      inspections,
      defects,
      maintenance,
      serviceRules: rules,
    };
  },
});

/** Forward-compatible: is this asset OK to assign to a route/job right now? */
export const assignmentBlock = query({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const auth = await requireFleetRead(ctx);
    await requireFleetAsset(ctx, auth, args.assetId);
    return await assetAssignmentBlock(ctx, args.assetId);
  },
});

// --- Mutations --------------------------------------------------------------

/** Mark an asset as fleet/compliance-tracked and edit its fleet metadata. */
export const setFleetMeta = mutation({
  args: {
    assetId: v.id("assets"),
    assetType: v.optional(v.union(fleetAssetTypeValidator, v.null())),
    registration: v.optional(v.string()),
    registrationExpiry: v.optional(v.string()),
    insuranceExpiry: v.optional(v.string()),
    odometer: v.optional(v.number()),
    odometerUnit: v.optional(v.string()),
    engineHours: v.optional(v.number()),
    fuelType: v.optional(v.string()),
    homeDepot: v.optional(v.string()),
    assignedDriverMemberId: v.optional(v.union(v.id("members"), v.null())),
    inspectionExpiry: v.optional(v.string()),
    nextServiceDate: v.optional(v.string()),
    nextServiceOdometer: v.optional(v.number()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "fleet");
    await requireCapability(ctx, auth, "fleet.manage");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return args.assetId;
    const asset = await requireFleetAsset(ctx, auth, args.assetId);

    if (args.assignedDriverMemberId) {
      const driver = await ctx.db.get(args.assignedDriverMemberId);
      assertSameOrg(auth, driver);
    }

    const patch: Partial<Doc<"assets">> = {};
    if (args.assetType !== undefined)
      patch.assetType = args.assetType ?? undefined;
    if (args.registration !== undefined)
      patch.registration = args.registration.trim() || undefined;
    if (args.registrationExpiry !== undefined)
      patch.registrationExpiry = args.registrationExpiry || undefined;
    if (args.insuranceExpiry !== undefined)
      patch.insuranceExpiry = args.insuranceExpiry || undefined;
    if (args.odometer !== undefined) patch.odometer = args.odometer;
    if (args.odometerUnit !== undefined)
      patch.odometerUnit = args.odometerUnit || undefined;
    if (args.engineHours !== undefined) patch.engineHours = args.engineHours;
    if (args.fuelType !== undefined)
      patch.fuelType = args.fuelType.trim() || undefined;
    if (args.homeDepot !== undefined)
      patch.homeDepot = args.homeDepot.trim() || undefined;
    if (args.assignedDriverMemberId !== undefined)
      patch.assignedDriverMemberId = args.assignedDriverMemberId ?? undefined;
    if (args.inspectionExpiry !== undefined)
      patch.inspectionExpiry = args.inspectionExpiry || undefined;
    if (args.nextServiceDate !== undefined)
      patch.nextServiceDate = args.nextServiceDate || undefined;
    if (args.nextServiceOdometer !== undefined)
      patch.nextServiceOdometer = args.nextServiceOdometer;

    await ctx.db.patch(asset._id, patch);
    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId: asset._id,
      action: "updated",
      performedBy: auth.user._id,
      notes: "Fleet details updated.",
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fleet:setFleetMeta",
      String(asset._id),
    );
    return asset._id;
  },
});

const inspectionDefectInput = v.object({
  title: v.string(),
  severity: assetDefectSeverityValidator,
  description: v.optional(v.string()),
  blocksAssignment: v.optional(v.boolean()),
});

/** Record an inspection (pre-start / periodic / return). May report defects in
 * the same call so a mobile pre-start checklist submits in one offline op. */
export const recordInspection = mutation({
  args: {
    assetId: v.id("assets"),
    type: fleetInspectionTypeValidator,
    result: fleetInspectionResultValidator,
    odometer: v.optional(v.number()),
    engineHours: v.optional(v.number()),
    notes: v.optional(v.string()),
    checklist: v.optional(
      v.array(
        v.object({
          label: v.string(),
          ok: v.boolean(),
          note: v.optional(v.string()),
        }),
      ),
    ),
    photoFileIds: v.optional(v.array(v.id("uploadedFiles"))),
    geoLatitude: v.optional(v.number()),
    geoLongitude: v.optional(v.number()),
    geoAccuracy: v.optional(v.number()),
    defects: v.optional(v.array(inspectionDefectInput)),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "fleet");
    await requireCapability(ctx, auth, "fleet.inspect");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const id = ctx.db.normalizeId("assetInspections", replay.resultId);
      if (id) return id;
    }
    if (replay) throw new Error("Inspection already recorded.");
    const asset = await requireFleetAsset(ctx, auth, args.assetId);

    const now = Date.now();
    const callerMemberId = await callerMember(ctx, auth);
    const inspectionId = await ctx.db.insert("assetInspections", {
      orgId: auth.org._id,
      assetId: asset._id,
      type: args.type,
      result: args.result,
      performedBy: auth.user._id,
      performedByMemberId: callerMemberId ?? undefined,
      odometer: args.odometer,
      engineHours: args.engineHours,
      notes: args.notes?.trim() || undefined,
      checklist: args.checklist,
      photoFileIds: args.photoFileIds,
      geoLatitude: args.geoLatitude,
      geoLongitude: args.geoLongitude,
      geoAccuracy: args.geoAccuracy,
      performedAt: now,
    });

    let anyBlocking = false;
    for (const d of args.defects ?? []) {
      const blocks = d.blocksAssignment ?? defaultBlocksAssignment(d.severity);
      anyBlocking ||= blocks;
      await ctx.db.insert("assetDefects", {
        orgId: auth.org._id,
        assetId: asset._id,
        inspectionId,
        severity: d.severity,
        status: "open",
        title: d.title.trim(),
        description: d.description?.trim() || undefined,
        blocksAssignment: blocks,
        reportedBy: auth.user._id,
        reportedByMemberId: callerMemberId ?? undefined,
        reportedAt: now,
      });
    }

    // Advance odometer/engine hours only forward.
    const meterPatch: Partial<Doc<"assets">> = {};
    if (args.odometer !== undefined && args.odometer > (asset.odometer ?? -1))
      meterPatch.odometer = args.odometer;
    if (
      args.engineHours !== undefined &&
      args.engineHours > (asset.engineHours ?? -1)
    )
      meterPatch.engineHours = args.engineHours;
    // A failed inspection or a blocking defect takes the asset out of service.
    if (
      (args.result === "fail" || anyBlocking) &&
      asset.status !== "retired" &&
      asset.status !== "lost"
    )
      meterPatch.status = "maintenance";
    if (Object.keys(meterPatch).length > 0)
      await ctx.db.patch(asset._id, meterPatch);

    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId: asset._id,
      action: "maintenance",
      performedBy: auth.user._id,
      notes: `Inspection (${args.type}): ${args.result}`,
      geoLatitude: args.geoLatitude,
      geoLongitude: args.geoLongitude,
      geoAccuracy: args.geoAccuracy,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fleet:recordInspection",
      String(inspectionId),
    );
    return inspectionId;
  },
});

/** Report a standalone defect against a fleet asset. */
export const reportDefect = mutation({
  args: {
    assetId: v.id("assets"),
    severity: assetDefectSeverityValidator,
    title: v.string(),
    description: v.optional(v.string()),
    blocksAssignment: v.optional(v.boolean()),
    photoFileIds: v.optional(v.array(v.id("uploadedFiles"))),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "fleet");
    await requireCapability(ctx, auth, "fleet.inspect");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const id = ctx.db.normalizeId("assetDefects", replay.resultId);
      if (id) return id;
    }
    if (replay) throw new Error("Defect already reported.");
    const asset = await requireFleetAsset(ctx, auth, args.assetId);

    const blocks =
      args.blocksAssignment ?? defaultBlocksAssignment(args.severity);
    const now = Date.now();
    const callerMemberId = await callerMember(ctx, auth);
    const defectId = await ctx.db.insert("assetDefects", {
      orgId: auth.org._id,
      assetId: asset._id,
      severity: args.severity,
      status: "open",
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      blocksAssignment: blocks,
      photoFileIds: args.photoFileIds,
      reportedBy: auth.user._id,
      reportedByMemberId: callerMemberId ?? undefined,
      reportedAt: now,
    });

    if (blocks && asset.status !== "retired" && asset.status !== "lost")
      await ctx.db.patch(asset._id, { status: "maintenance" });

    await writeAudit(ctx, {
      orgId: auth.org._id,
      assetId: asset._id,
      action: "maintenance",
      performedBy: auth.user._id,
      notes: `Defect reported (${args.severity}): ${args.title.trim()}`,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fleet:reportDefect",
      String(defectId),
    );
    return defectId;
  },
});

/** Resolve (or update) a defect. Resolution is a management action. */
export const resolveDefect = mutation({
  args: {
    defectId: v.id("assetDefects"),
    status: v.optional(assetDefectStatusValidator),
    blocksAssignment: v.optional(v.boolean()),
    resolutionNotes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "fleet");
    await requireCapability(ctx, auth, "fleet.manage");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return args.defectId;
    const defect = await ctx.db.get(args.defectId);
    assertSameOrg(auth, defect);
    const status = args.status ?? "resolved";

    await ctx.db.patch(defect!._id, {
      status,
      blocksAssignment: args.blocksAssignment ?? defect!.blocksAssignment,
      resolutionNotes: args.resolutionNotes?.trim() || defect!.resolutionNotes,
      resolvedBy: status === "resolved" ? auth.user._id : undefined,
      resolvedAt: status === "resolved" ? Date.now() : undefined,
    });

    // If nothing else keeps the asset out of service, return it to available.
    const asset = await ctx.db.get(defect!.assetId);
    if (asset && asset.status === "maintenance") {
      const block = await assetAssignmentBlock(ctx, asset._id);
      const openMaint = await ctx.db
        .query("maintenanceJobs")
        .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
        .collect();
      const inMaint = openMaint.some(
        (m) => m.status === "scheduled" || m.status === "in_progress",
      );
      if (!block.blocked && !inMaint)
        await ctx.db.patch(asset._id, { status: "available" });
    }

    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fleet:resolveDefect",
      String(defect!._id),
    );
    return defect!._id;
  },
});

/** Schedule a maintenance / service / repair job for an asset. */
export const scheduleMaintenance = mutation({
  args: {
    assetId: v.id("assets"),
    title: v.string(),
    kind: maintenanceKindValidator,
    scheduledFor: v.optional(v.string()),
    dueOdometer: v.optional(v.number()),
    assignedToMemberId: v.optional(v.id("members")),
    vendor: v.optional(v.string()),
    cost: v.optional(v.number()),
    notes: v.optional(v.string()),
    serviceRuleId: v.optional(v.id("fleetServiceRules")),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "fleet");
    await requireCapability(ctx, auth, "fleet.manage");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const id = ctx.db.normalizeId("maintenanceJobs", replay.resultId);
      if (id) return id;
    }
    if (replay) throw new Error("Maintenance already scheduled.");
    const asset = await requireFleetAsset(ctx, auth, args.assetId);
    if (args.assignedToMemberId) {
      const m = await ctx.db.get(args.assignedToMemberId);
      assertSameOrg(auth, m);
    }

    const maintenanceId = await ctx.db.insert("maintenanceJobs", {
      orgId: auth.org._id,
      assetId: asset._id,
      title: args.title.trim(),
      kind: args.kind,
      status: "scheduled",
      scheduledFor: args.scheduledFor || undefined,
      dueOdometer: args.dueOdometer,
      assignedToMemberId: args.assignedToMemberId,
      vendor: args.vendor?.trim() || undefined,
      cost: args.cost,
      notes: args.notes?.trim() || undefined,
      serviceRuleId: args.serviceRuleId,
      createdBy: auth.user._id,
      createdAt: Date.now(),
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fleet:scheduleMaintenance",
      String(maintenanceId),
    );
    return maintenanceId;
  },
});

/** Update a maintenance job; completing it advances any linked service rule. */
export const updateMaintenance = mutation({
  args: {
    maintenanceId: v.id("maintenanceJobs"),
    status: v.optional(maintenanceStatusValidator),
    title: v.optional(v.string()),
    scheduledFor: v.optional(v.string()),
    dueOdometer: v.optional(v.number()),
    assignedToMemberId: v.optional(v.union(v.id("members"), v.null())),
    vendor: v.optional(v.string()),
    cost: v.optional(v.number()),
    notes: v.optional(v.string()),
    completedOdometer: v.optional(v.number()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "fleet");
    await requireCapability(ctx, auth, "fleet.manage");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return args.maintenanceId;
    const job = await ctx.db.get(args.maintenanceId);
    assertSameOrg(auth, job);

    const patch: Partial<Doc<"maintenanceJobs">> = {};
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.scheduledFor !== undefined)
      patch.scheduledFor = args.scheduledFor || undefined;
    if (args.dueOdometer !== undefined) patch.dueOdometer = args.dueOdometer;
    if (args.assignedToMemberId !== undefined)
      patch.assignedToMemberId = args.assignedToMemberId ?? undefined;
    if (args.vendor !== undefined)
      patch.vendor = args.vendor.trim() || undefined;
    if (args.cost !== undefined) patch.cost = args.cost;
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;

    const now = Date.now();
    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "completed") {
        patch.completedAt = now;
        patch.completedBy = auth.user._id;
      }
    }
    await ctx.db.patch(job!._id, patch);

    if (args.status === "completed") {
      await onMaintenanceCompleted(ctx, job!, args.completedOdometer, now);
    }

    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fleet:updateMaintenance",
      String(job!._id),
    );
    return job!._id;
  },
});

/** Create or update a recurring service rule for an asset. */
export const upsertServiceRule = mutation({
  args: {
    ruleId: v.optional(v.id("fleetServiceRules")),
    assetId: v.id("assets"),
    label: v.string(),
    intervalDays: v.optional(v.number()),
    intervalKm: v.optional(v.number()),
    lastServiceDate: v.optional(v.string()),
    lastServiceOdometer: v.optional(v.number()),
    active: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "fleet");
    await requireCapability(ctx, auth, "fleet.manage");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const id = ctx.db.normalizeId("fleetServiceRules", replay.resultId);
      if (id) return id;
    }
    if (replay) throw new Error("Service rule already saved.");
    const asset = await requireFleetAsset(ctx, auth, args.assetId);

    let ruleId: Id<"fleetServiceRules">;
    if (args.ruleId) {
      const existing = await ctx.db.get(args.ruleId);
      assertSameOrg(auth, existing);
      await ctx.db.patch(existing!._id, {
        label: args.label.trim(),
        intervalDays: args.intervalDays,
        intervalKm: args.intervalKm,
        lastServiceDate: args.lastServiceDate || undefined,
        lastServiceOdometer: args.lastServiceOdometer,
        active: args.active ?? existing!.active,
      });
      ruleId = existing!._id;
    } else {
      ruleId = await ctx.db.insert("fleetServiceRules", {
        orgId: auth.org._id,
        assetId: asset._id,
        label: args.label.trim(),
        intervalDays: args.intervalDays,
        intervalKm: args.intervalKm,
        lastServiceDate: args.lastServiceDate || undefined,
        lastServiceOdometer: args.lastServiceOdometer,
        active: args.active ?? true,
        createdBy: auth.user._id,
        createdAt: Date.now(),
      });
    }
    await refreshNextService(ctx, asset._id);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fleet:upsertServiceRule",
      String(ruleId),
    );
    return ruleId;
  },
});

/** Delete a service rule. */
export const removeServiceRule = mutation({
  args: {
    ruleId: v.id("fleetServiceRules"),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "fleet");
    await requireCapability(ctx, auth, "fleet.manage");
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay) return null;
    const rule = await ctx.db.get(args.ruleId);
    assertSameOrg(auth, rule);
    const assetId = rule!.assetId;
    await ctx.db.delete(rule!._id);
    await refreshNextService(ctx, assetId);
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fleet:removeServiceRule",
      String(args.ruleId),
    );
    return null;
  },
});

// --- Internal helpers -------------------------------------------------------

/** The caller's member record in this org, if they have one. */
async function callerMember(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
): Promise<Id<"members"> | null> {
  const rows = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", auth.user._id))
    .collect();
  const mine = rows.find((m) => m.orgId === auth.org._id);
  return mine?._id ?? null;
}

/** On completion, advance the linked rule's last-service marks + asset meters. */
async function onMaintenanceCompleted(
  ctx: MutationCtx,
  job: Doc<"maintenanceJobs">,
  completedOdometer: number | undefined,
  now: number,
) {
  const asset = await ctx.db.get(job.assetId);
  if (!asset) return;
  if (
    completedOdometer !== undefined &&
    completedOdometer > (asset.odometer ?? -1)
  )
    await ctx.db.patch(asset._id, { odometer: completedOdometer });
  if (job.serviceRuleId) {
    const rule = await ctx.db.get(job.serviceRuleId);
    if (rule) {
      await ctx.db.patch(rule._id, {
        lastServiceDate: new Date(now).toISOString().slice(0, 10),
        lastServiceOdometer:
          completedOdometer ?? asset.odometer ?? rule.lastServiceOdometer,
      });
    }
  }
  await refreshNextService(ctx, asset._id);
  // Bring the asset back into service if nothing else blocks it.
  const fresh = await ctx.db.get(asset._id);
  if (fresh && fresh.status === "maintenance") {
    const block = await assetAssignmentBlock(ctx, asset._id);
    if (!block.blocked) await ctx.db.patch(asset._id, { status: "available" });
  }
}

/** Recompute the asset's soonest next-service date/odometer from its rules. */
async function refreshNextService(ctx: MutationCtx, assetId: Id<"assets">) {
  const rules = (
    await ctx.db
      .query("fleetServiceRules")
      .withIndex("by_asset", (q) => q.eq("assetId", assetId))
      .collect()
  ).filter((r) => r.active);

  let nextDateMs: number | null = null;
  let nextOdo: number | null = null;
  for (const rule of rules) {
    if (rule.intervalDays && rule.lastServiceDate) {
      const base = Date.parse(rule.lastServiceDate);
      if (!Number.isNaN(base)) {
        const due = base + rule.intervalDays * DAY_MS;
        nextDateMs = nextDateMs === null ? due : Math.min(nextDateMs, due);
      }
    }
    if (rule.intervalKm && rule.lastServiceOdometer !== undefined) {
      const due = rule.lastServiceOdometer + rule.intervalKm;
      nextOdo = nextOdo === null ? due : Math.min(nextOdo, due);
    }
  }
  await ctx.db.patch(assetId, {
    nextServiceDate:
      nextDateMs === null
        ? undefined
        : new Date(nextDateMs).toISOString().slice(0, 10),
    nextServiceOdometer: nextOdo === null ? undefined : nextOdo,
  });
}
