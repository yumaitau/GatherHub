import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { requireOrgMember, assertSameOrg, type AuthContext } from "./lib/auth";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";
import {
  hasCapability,
  requireCapability,
  type Capability,
} from "./lib/capabilities";
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
  fleetVehicleStatusValidator,
  fleetDriverStatusValidator,
  fleetMaintenanceStatusValidator,
  fleetMaintenanceCategoryValidator,
  fleetDefectSeverityValidator,
  fleetDefectStatusValidator,
  fleetJobTypeValidator,
  fleetJobStatusValidator,
  fleetProjectStatusValidator,
  fleetCostCategoryValidator,
  fleetApprovalStatusValidator,
} from "./schema";
import {
  computeServiceDue,
  criticalDefectRequiresUnavailable,
  driverApprovedForVehicle,
  isoToMs as fleetIsoToMs,
  renewalState,
  timeRangesOverlap,
} from "./lib/fleetLogic";

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

// --- Fleet operations module ------------------------------------------------

const readableFleetCaps: Capability[] = [
  "fleet.view",
  "fleet.dashboards.view",
  "fleet.manage",
  "assets.read",
];
const manageVehicleCaps: Capability[] = [
  "fleet.vehicles.manage",
  "fleet.manage",
];
const manageDriverCaps: Capability[] = ["fleet.drivers.manage", "fleet.manage"];
const assignJobCaps: Capability[] = [
  "fleet.jobs.assign",
  "jobs.dispatch",
  "fleet.manage",
];
const driverPortalCaps: Capability[] = [
  "fleet.driver_portal",
  "jobs.complete",
  "fleet.inspect",
  "fleet.manage",
];
const submitDefectCaps: Capability[] = [
  "fleet.defects.submit",
  "fleet.inspect",
  "fleet.manage",
];
const manageMaintenanceCaps: Capability[] = [
  "fleet.maintenance.manage",
  "fleet.manage",
];
const manageCostCaps: Capability[] = ["fleet.costs.manage", "fleet.manage"];
const approveCostCaps: Capability[] = ["fleet.costs.approve", "fleet.manage"];
const exportCaps: Capability[] = [
  "fleet.export",
  "reports.export",
  "fleet.manage",
];

async function requireFleetAny(
  ctx: QueryCtx | MutationCtx,
  capabilities: Capability[],
): Promise<AuthContext> {
  const auth = await requireOrgMember(ctx);
  await requireModule(ctx, auth, "fleet");
  for (const capability of capabilities) {
    if (await hasCapability(ctx, auth, capability)) return auth;
  }
  throw new ConvexError({
    code: "forbidden",
    capability: capabilities[0],
    message: `Missing permission: ${capabilities.join(" or ")}.`,
  });
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function todayIso(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function notDeleted<T extends { deletedAt?: number }>(row: T): boolean {
  return row.deletedAt === undefined;
}

function asJson(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return JSON.stringify(value);
}

async function writeFleetAudit(
  ctx: MutationCtx,
  auth: AuthContext,
  params: {
    entityType: string;
    entityId: string;
    action: string;
    oldValue?: unknown;
    newValue?: unknown;
    metadata?: unknown;
  },
) {
  await ctx.db.insert("auditLogs", {
    orgId: auth.org._id,
    actorId: auth.user._id,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    oldValue: asJson(params.oldValue),
    newValue: asJson(params.newValue),
    timestamp: Date.now(),
    metadata: asJson(params.metadata),
  });
}

function documentStatus(expiryDate: string | undefined, now = Date.now()) {
  const state = renewalState(expiryDate, now);
  return state === "expired"
    ? "expired"
    : state === "due_soon"
      ? "due_soon"
      : "current";
}

function vehicleServiceState(vehicle: Doc<"vehicles">, now = Date.now()) {
  return computeServiceDue(
    {
      currentOdometer: vehicle.odometer,
      currentEngineHours: vehicle.engineHours,
      lastServiceDate: vehicle.lastServiceDate,
      lastServiceOdometer: vehicle.lastServiceOdometer,
      lastServiceEngineHours: vehicle.lastServiceEngineHours,
      serviceIntervalKm: vehicle.serviceIntervalKm,
      serviceIntervalMonths: vehicle.serviceIntervalMonths,
      serviceIntervalEngineHours: vehicle.serviceIntervalEngineHours,
      nextServiceDueDate: vehicle.nextServiceDueDate,
      nextServiceDueOdometer: vehicle.nextServiceDueOdometer,
      nextServiceDueEngineHours: vehicle.nextServiceDueEngineHours,
    },
    now,
  );
}

function vehicleCompliance(
  vehicle: Doc<"vehicles">,
  defects: Doc<"defectReports">[],
  now = Date.now(),
) {
  const service = vehicleServiceState(vehicle, now);
  const rego = documentStatus(vehicle.regoExpiry, now);
  const insurance = documentStatus(vehicle.insuranceExpiry, now);
  const inspection = documentStatus(vehicle.inspectionExpiry, now);
  const roadworthy = documentStatus(vehicle.roadworthyExpiry, now);
  const criticalDefects = defects.filter(
    (defect) =>
      notDeleted(defect) &&
      !["fixed", "closed", "rejected"].includes(defect.status) &&
      criticalDefectRequiresUnavailable(defect.severity, defect.safeToOperate),
  );
  const warnings = [
    rego === "expired" ? "Registration expired" : null,
    rego === "due_soon" ? "Registration due soon" : null,
    insurance === "expired" ? "Insurance expired" : null,
    insurance === "due_soon" ? "Insurance due soon" : null,
    inspection === "expired" ? "Inspection expired" : null,
    inspection === "due_soon" ? "Inspection due soon" : null,
    roadworthy === "expired" ? "Roadworthy expired" : null,
    roadworthy === "due_soon" ? "Roadworthy due soon" : null,
    service.state === "overdue" ? "Service overdue" : null,
    service.state === "due_soon" ? "Service due soon" : null,
    criticalDefects.length > 0 ? "Critical defect open" : null,
  ].filter((value): value is string => Boolean(value));
  return {
    rego,
    insurance,
    inspection,
    roadworthy,
    service,
    openDefectCount: defects.filter(
      (d) =>
        notDeleted(d) && !["fixed", "closed", "rejected"].includes(d.status),
    ).length,
    criticalDefectCount: criticalDefects.length,
    warnings,
  };
}

async function getDriverForCurrentUser(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
) {
  const byUser = await ctx.db
    .query("drivers")
    .withIndex("by_user", (q) => q.eq("userId", auth.user._id))
    .collect();
  const direct = byUser.find(
    (driver) => driver.orgId === auth.org._id && notDeleted(driver),
  );
  if (direct) return direct;
  const member = await callerMember(ctx, auth);
  if (!member) return null;
  const byMember = await ctx.db
    .query("drivers")
    .withIndex("by_member", (q) => q.eq("memberId", member))
    .collect();
  return (
    byMember.find(
      (driver) => driver.orgId === auth.org._id && notDeleted(driver),
    ) ?? null
  );
}

async function allFleetRows(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
) {
  const [
    depots,
    suppliers,
    customers,
    vehicles,
    drivers,
    projects,
    jobs,
    maintenance,
    defects,
    fuelLogs,
    costs,
    reminders,
    notifications,
  ] = await Promise.all([
    ctx.db
      .query("depots")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect(),
    ctx.db
      .query("suppliers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect(),
    ctx.db
      .query("customers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect(),
    ctx.db
      .query("vehicles")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect(),
    ctx.db
      .query("drivers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect(),
    ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect(),
    ctx.db
      .query("jobs")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect(),
    ctx.db
      .query("maintenanceRecords")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect(),
    ctx.db
      .query("defectReports")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect(),
    ctx.db
      .query("fuelLogs")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect(),
    ctx.db
      .query("costEntries")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect(),
    ctx.db
      .query("reminders")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect(),
    ctx.db
      .query("notifications")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect(),
  ]);
  return {
    depots: depots.filter(notDeleted),
    suppliers: suppliers.filter(notDeleted),
    customers: customers.filter(notDeleted),
    vehicles: vehicles.filter(notDeleted),
    drivers: drivers.filter(notDeleted),
    projects: projects.filter(notDeleted),
    jobs: jobs.filter(notDeleted),
    maintenance: maintenance.filter(notDeleted),
    defects: defects.filter(notDeleted),
    fuelLogs: fuelLogs.filter(notDeleted),
    costs: costs.filter(notDeleted),
    reminders: reminders.filter(notDeleted),
    notifications,
  };
}

export const referenceData = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireFleetAny(ctx, readableFleetCaps);
    const rows = await allFleetRows(ctx, auth.org._id);
    return {
      depots: rows.depots,
      suppliers: rows.suppliers,
      customers: rows.customers,
      vehicles: rows.vehicles.map((v) => ({
        _id: v._id,
        name: v.name,
        registrationNumber: v.registrationNumber,
        vehicleType: v.vehicleType,
        status: v.status,
      })),
      drivers: rows.drivers.map((d) => ({
        _id: d._id,
        name: d.name,
        status: d.status,
        approvedVehicleTypes: d.approvedVehicleTypes,
      })),
      projects: rows.projects.map((p) => ({
        _id: p._id,
        name: p.name,
        status: p.status,
        budget: p.budget,
      })),
    };
  },
});

export const operationsDashboard = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireFleetAny(ctx, [
      "fleet.dashboards.view",
      ...readableFleetCaps,
    ]);
    const now = Date.now();
    const rows = await allFleetRows(ctx, auth.org._id);
    const defectsByVehicle = new Map<string, Doc<"defectReports">[]>();
    for (const defect of rows.defects) {
      const key = String(defect.vehicleId);
      defectsByVehicle.set(key, [...(defectsByVehicle.get(key) ?? []), defect]);
    }

    const vehicleCards = rows.vehicles.map((vehicle) => {
      const compliance = vehicleCompliance(
        vehicle,
        defectsByVehicle.get(String(vehicle._id)) ?? [],
        now,
      );
      return {
        ...vehicle,
        compliance,
        driverName: rows.drivers.find((d) => d._id === vehicle.primaryDriverId)
          ?.name,
        depotName: rows.depots.find((d) => d._id === vehicle.depotId)?.name,
      };
    });
    const activeJobs = rows.jobs.filter((job) =>
      ["scheduled", "assigned", "in_progress"].includes(job.status),
    );
    const completedThisWeek = rows.jobs.filter(
      (job) =>
        job.status === "completed" &&
        (job.completedAt ?? job.updatedAt) >= now - 7 * DAY_MS,
    );
    const completedThisMonth = rows.jobs.filter(
      (job) =>
        job.status === "completed" &&
        (job.completedAt ?? job.updatedAt) >= now - 30 * DAY_MS,
    );
    const totalDistance = rows.jobs.reduce(
      (sum, job) => sum + (job.actualDistance ?? job.estimatedDistance ?? 0),
      0,
    );
    const totalCosts = rows.costs.reduce((sum, cost) => sum + cost.amount, 0);
    const activeVehicleIds = new Set(
      rows.jobs
        .filter((job) => job.startDateTime <= now && job.endDateTime >= now)
        .map((job) => job.assignedVehicleId)
        .filter(Boolean)
        .map(String),
    );
    const activeDriverIds = new Set(
      rows.jobs
        .filter((job) => job.startDateTime <= now && job.endDateTime >= now)
        .map((job) => job.assignedDriverId)
        .filter(Boolean)
        .map(String),
    );
    const monthStart = new Date();
    const monthlyFleetCosts = Array.from({ length: 6 }).map((_, index) => {
      const d = new Date(
        Date.UTC(
          monthStart.getUTCFullYear(),
          monthStart.getUTCMonth() - (5 - index),
          1,
        ),
      );
      const month = d.toISOString().slice(0, 7);
      return {
        month,
        total: rows.costs
          .filter((cost) => cost.date.startsWith(month))
          .reduce((sum, cost) => sum + cost.amount, 0),
      };
    });
    const costByVehicle = new Map<string, number>();
    for (const cost of rows.costs) {
      if (!cost.vehicleId) continue;
      const key = String(cost.vehicleId);
      costByVehicle.set(key, (costByVehicle.get(key) ?? 0) + cost.amount);
    }

    return {
      counts: {
        totalVehicles: rows.vehicles.length,
        activeVehicles: rows.vehicles.filter((v) => v.status === "active")
          .length,
        unavailableVehicles: rows.vehicles.filter((v) =>
          ["unavailable", "retired", "sold", "written_off"].includes(v.status),
        ).length,
        vehiclesInMaintenance: rows.vehicles.filter(
          (v) => v.status === "in_maintenance",
        ).length,
        regoExpiringSoon: vehicleCards.filter(
          (v) => v.compliance.rego === "due_soon",
        ).length,
        regoExpired: vehicleCards.filter((v) => v.compliance.rego === "expired")
          .length,
        insuranceExpiringSoon: vehicleCards.filter(
          (v) => v.compliance.insurance === "due_soon",
        ).length,
        servicesDueSoon: vehicleCards.filter(
          (v) => v.compliance.service.state === "due_soon",
        ).length,
        servicesOverdue: vehicleCards.filter(
          (v) => v.compliance.service.state === "overdue",
        ).length,
        openDefects: rows.defects.filter(
          (d) => !["fixed", "closed", "rejected"].includes(d.status),
        ).length,
        criticalDefects: rows.defects.filter(
          (d) =>
            d.severity === "critical" &&
            !["fixed", "closed", "rejected"].includes(d.status),
        ).length,
        activeJobs: activeJobs.length,
        jobsCompletedThisWeek: completedThisWeek.length,
        jobsCompletedThisMonth: completedThisMonth.length,
        driverComplianceIssues: rows.drivers.filter((driver) =>
          [
            driver.licenceExpiry,
            driver.medicalClearanceExpiry,
            driver.policeCheckExpiry,
            driver.workingWithChildrenCheckExpiry,
          ].some((date) => renewalState(date, now) !== "current"),
        ).length,
      },
      utilisation: {
        fleetUtilisation:
          rows.vehicles.length === 0
            ? 0
            : Math.round((activeVehicleIds.size / rows.vehicles.length) * 100),
        vehicleUtilisation:
          rows.vehicles.length === 0
            ? 0
            : Math.round(
                (activeJobs.filter((job) => job.assignedVehicleId).length /
                  rows.vehicles.length) *
                  100,
              ),
        driverUtilisation:
          rows.drivers.length === 0
            ? 0
            : Math.round((activeDriverIds.size / rows.drivers.length) * 100),
      },
      costSummary: {
        monthlyFleetCosts,
        totalCosts,
        costPerKm: totalDistance > 0 ? totalCosts / totalDistance : 0,
        maintenanceSpend: rows.costs
          .filter(
            (c) => c.category === "maintenance" || c.category === "repairs",
          )
          .reduce((sum, c) => sum + c.amount, 0),
        fuelSpend: rows.costs
          .filter((c) => c.category === "fuel")
          .reduce((sum, c) => sum + c.amount, 0),
        highCostVehicles: [...costByVehicle.entries()]
          .map(([vehicleId, amount]) => ({
            vehicleId,
            vehicleName:
              rows.vehicles.find((v) => String(v._id) === vehicleId)?.name ??
              "Unknown",
            amount,
          }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5),
      },
      vehicles: vehicleCards.sort((a, b) => a.name.localeCompare(b.name)),
      drivers: rows.drivers.sort((a, b) => a.name.localeCompare(b.name)),
      jobs: rows.jobs.sort((a, b) => a.startDateTime - b.startDateTime),
      projects: rows.projects,
      defects: rows.defects,
      maintenance: rows.maintenance,
      costs: rows.costs,
      fuelLogs: rows.fuelLogs,
      reminders: rows.reminders
        .filter((reminder) => reminder.status !== "resolved")
        .sort((a, b) => a.dueAt - b.dueAt)
        .slice(0, 20),
      notifications: rows.notifications
        .filter((notification) => notification.status !== "read")
        .slice(0, 20),
    };
  },
});

export const listVehicles = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireFleetAny(ctx, readableFleetCaps);
    const rows = await allFleetRows(ctx, auth.org._id);
    return rows.vehicles.map((vehicle) => ({
      ...vehicle,
      compliance: vehicleCompliance(
        vehicle,
        rows.defects.filter((defect) => defect.vehicleId === vehicle._id),
      ),
      driverName: rows.drivers.find(
        (driver) => driver._id === vehicle.primaryDriverId,
      )?.name,
      depotName: rows.depots.find((depot) => depot._id === vehicle.depotId)
        ?.name,
    }));
  },
});

export const getVehicle = query({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, readableFleetCaps);
    const vehicle = await ctx.db.get(args.vehicleId);
    assertSameOrg(auth, vehicle);
    if (vehicle!.deletedAt) throw new ConvexError("Vehicle not found.");
    const [
      documents,
      jobs,
      maintenance,
      defects,
      costs,
      fuelLogs,
      reminders,
      auditLog,
    ] = await Promise.all([
      ctx.db
        .query("vehicleDocuments")
        .withIndex("by_vehicle", (q) => q.eq("vehicleId", args.vehicleId))
        .collect(),
      ctx.db
        .query("jobs")
        .withIndex("by_vehicle", (q) =>
          q.eq("assignedVehicleId", args.vehicleId),
        )
        .collect(),
      ctx.db
        .query("maintenanceRecords")
        .withIndex("by_vehicle", (q) => q.eq("vehicleId", args.vehicleId))
        .collect(),
      ctx.db
        .query("defectReports")
        .withIndex("by_vehicle", (q) => q.eq("vehicleId", args.vehicleId))
        .collect(),
      ctx.db
        .query("costEntries")
        .withIndex("by_vehicle", (q) => q.eq("vehicleId", args.vehicleId))
        .collect(),
      ctx.db
        .query("fuelLogs")
        .withIndex("by_vehicle", (q) => q.eq("vehicleId", args.vehicleId))
        .collect(),
      ctx.db
        .query("reminders")
        .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
        .collect(),
      ctx.db
        .query("auditLogs")
        .withIndex("by_org_entity", (q) =>
          q
            .eq("orgId", auth.org._id)
            .eq("entityType", "vehicle")
            .eq("entityId", String(args.vehicleId)),
        )
        .order("desc")
        .take(100),
    ]);
    const driver = vehicle!.primaryDriverId
      ? await ctx.db.get(vehicle!.primaryDriverId)
      : null;
    return {
      vehicle: {
        ...vehicle!,
        driverName: driver?.name,
        compliance: vehicleCompliance(vehicle!, defects.filter(notDeleted)),
      },
      documents: documents.filter(notDeleted),
      jobs: jobs
        .filter(notDeleted)
        .sort((a, b) => b.startDateTime - a.startDateTime),
      maintenance: maintenance
        .filter(notDeleted)
        .sort((a, b) => b.createdAt - a.createdAt),
      defects: defects
        .filter(notDeleted)
        .sort((a, b) => b.dateTime - a.dateTime),
      costs: costs
        .filter(notDeleted)
        .sort((a, b) => b.date.localeCompare(a.date)),
      fuelLogs: fuelLogs
        .filter(notDeleted)
        .sort((a, b) => b.date.localeCompare(a.date)),
      reminders: reminders
        .filter(
          (r) =>
            notDeleted(r) &&
            r.entityType === "vehicle" &&
            r.entityId === String(args.vehicleId),
        )
        .sort((a, b) => a.dueAt - b.dueAt),
      auditLog,
    };
  },
});

export const listDrivers = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireFleetAny(ctx, readableFleetCaps);
    const rows = await allFleetRows(ctx, auth.org._id);
    return rows.drivers.map((driver) => ({
      ...driver,
      defaultVehicleName: rows.vehicles.find(
        (v) => v._id === driver.defaultVehicleId,
      )?.name,
      depotName: rows.depots.find((d) => d._id === driver.depotId)?.name,
      complianceIssues: [
        driver.licenceExpiry && renewalState(driver.licenceExpiry) !== "current"
          ? "Licence"
          : null,
        driver.medicalClearanceExpiry &&
        renewalState(driver.medicalClearanceExpiry) !== "current"
          ? "Medical"
          : null,
        driver.policeCheckExpiry &&
        renewalState(driver.policeCheckExpiry) !== "current"
          ? "Police check"
          : null,
        driver.workingWithChildrenCheckExpiry &&
        renewalState(driver.workingWithChildrenCheckExpiry) !== "current"
          ? "WWCC"
          : null,
      ].filter(Boolean),
    }));
  },
});

export const getDriver = query({
  args: { driverId: v.id("drivers") },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, readableFleetCaps);
    const driver = await ctx.db.get(args.driverId);
    assertSameOrg(auth, driver);
    const [documents, compliance, jobs, costs, auditLog] = await Promise.all([
      ctx.db
        .query("driverDocuments")
        .withIndex("by_driver", (q) => q.eq("driverId", args.driverId))
        .collect(),
      ctx.db
        .query("driverComplianceItems")
        .withIndex("by_driver", (q) => q.eq("driverId", args.driverId))
        .collect(),
      ctx.db
        .query("jobs")
        .withIndex("by_driver", (q) => q.eq("assignedDriverId", args.driverId))
        .collect(),
      ctx.db
        .query("costEntries")
        .withIndex("by_driver", (q) => q.eq("driverId", args.driverId))
        .collect(),
      ctx.db
        .query("auditLogs")
        .withIndex("by_org_entity", (q) =>
          q
            .eq("orgId", auth.org._id)
            .eq("entityType", "driver")
            .eq("entityId", String(args.driverId)),
        )
        .order("desc")
        .take(100),
    ]);
    return {
      driver,
      documents: documents.filter(notDeleted),
      compliance: compliance.filter(notDeleted),
      jobs: jobs.filter(notDeleted),
      costs: costs.filter(notDeleted),
      auditLog,
    };
  },
});

async function assignmentIssues(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  args: {
    jobId?: Id<"jobs">;
    vehicleId?: Id<"vehicles">;
    driverId?: Id<"drivers">;
    startDateTime: number;
    endDateTime: number;
  },
) {
  const issues: Array<{
    code: string;
    severity: "block" | "warning";
    message: string;
  }> = [];
  if (args.endDateTime <= args.startDateTime) {
    issues.push({
      code: "invalid_time_range",
      severity: "block",
      message: "Job end must be after the start time.",
    });
  }
  const [vehicle, driver, jobs, defects] = await Promise.all([
    args.vehicleId ? ctx.db.get(args.vehicleId) : Promise.resolve(null),
    args.driverId ? ctx.db.get(args.driverId) : Promise.resolve(null),
    ctx.db
      .query("jobs")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect(),
    ctx.db
      .query("defectReports")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect(),
  ]);
  if (args.vehicleId) assertSameOrg(auth, vehicle);
  if (args.driverId) assertSameOrg(auth, driver);
  if (vehicle) {
    if (
      ["unavailable", "retired", "sold", "written_off"].includes(vehicle.status)
    ) {
      issues.push({
        code: "vehicle_unavailable",
        severity: "block",
        message: "Vehicle is unavailable for assignment.",
      });
    }
    if (vehicle.status === "in_maintenance") {
      issues.push({
        code: "vehicle_in_maintenance",
        severity: "block",
        message: "Vehicle is currently in maintenance.",
      });
    }
    if (renewalState(vehicle.regoExpiry) === "expired") {
      issues.push({
        code: "vehicle_rego_expired",
        severity: "block",
        message: "Vehicle registration is expired.",
      });
    }
    if (renewalState(vehicle.insuranceExpiry) === "expired") {
      issues.push({
        code: "vehicle_insurance_expired",
        severity: "block",
        message: "Vehicle insurance is expired.",
      });
    }
    const service = vehicleServiceState(vehicle);
    if (service.state === "overdue") {
      issues.push({
        code: "vehicle_service_overdue",
        severity: "warning",
        message: "Vehicle service is overdue.",
      });
    }
    const unsafeDefect = defects.find(
      (defect) =>
        notDeleted(defect) &&
        defect.vehicleId === vehicle._id &&
        !["fixed", "closed", "rejected"].includes(defect.status) &&
        criticalDefectRequiresUnavailable(
          defect.severity,
          defect.safeToOperate,
        ),
    );
    if (unsafeDefect) {
      issues.push({
        code: "critical_defect_open",
        severity: "block",
        message: "Vehicle has a critical or unsafe defect open.",
      });
    }
  }
  if (driver) {
    if (["suspended", "inactive"].includes(driver.status)) {
      issues.push({
        code: "driver_inactive",
        severity: "block",
        message: "Driver is inactive or suspended.",
      });
    }
    if (renewalState(driver.licenceExpiry) === "expired") {
      issues.push({
        code: "driver_licence_expired",
        severity: "block",
        message: "Driver licence is expired.",
      });
    }
    if (
      vehicle &&
      !driverApprovedForVehicle(
        driver.approvedVehicleTypes,
        vehicle.vehicleType,
      )
    ) {
      issues.push({
        code: "driver_vehicle_type",
        severity: "block",
        message: "Driver is not approved for this vehicle type.",
      });
    }
  }
  for (const job of jobs.filter(notDeleted)) {
    if (args.jobId && job._id === args.jobId) continue;
    if (["completed", "cancelled", "failed"].includes(job.status)) continue;
    if (
      !timeRangesOverlap(
        args.startDateTime,
        args.endDateTime,
        job.startDateTime,
        job.endDateTime,
      )
    )
      continue;
    if (args.vehicleId && job.assignedVehicleId === args.vehicleId) {
      issues.push({
        code: "vehicle_overlap",
        severity: "block",
        message: `Vehicle is already booked on ${job.title}.`,
      });
    }
    if (args.driverId && job.assignedDriverId === args.driverId) {
      issues.push({
        code: "driver_overlap",
        severity: "block",
        message: `Driver is already booked on ${job.title}.`,
      });
    }
  }
  return issues;
}

export const checkJobAssignment = query({
  args: {
    jobId: v.optional(v.id("jobs")),
    vehicleId: v.optional(v.id("vehicles")),
    driverId: v.optional(v.id("drivers")),
    startDateTime: v.number(),
    endDateTime: v.number(),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, readableFleetCaps);
    const issues = await assignmentIssues(ctx, auth, args);
    return {
      blocked: issues.some((issue) => issue.severity === "block"),
      issues,
    };
  },
});

export const availabilityCalendar = query({
  args: {
    vehicleId: v.optional(v.id("vehicles")),
    driverId: v.optional(v.id("drivers")),
    projectId: v.optional(v.id("projects")),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, readableFleetCaps);
    const rows = await allFleetRows(ctx, auth.org._id);
    return [
      ...rows.jobs
        .filter(
          (job) => !args.vehicleId || job.assignedVehicleId === args.vehicleId,
        )
        .filter(
          (job) => !args.driverId || job.assignedDriverId === args.driverId,
        )
        .filter((job) => !args.projectId || job.projectId === args.projectId)
        .filter((job) => !args.status || job.status === args.status)
        .map((job) => ({
          id: String(job._id),
          kind: "job",
          title: job.title,
          start: job.startDateTime,
          end: job.endDateTime,
          status: job.status,
          vehicleId: job.assignedVehicleId,
          driverId: job.assignedDriverId,
          projectId: job.projectId,
        })),
      ...rows.maintenance.map((record) => ({
        id: String(record._id),
        kind: "maintenance",
        title: record.description,
        start:
          fleetIsoToMs(record.scheduledDate ?? record.dateReported) ??
          record.createdAt,
        end:
          fleetIsoToMs(
            record.completedDate ?? record.scheduledDate ?? record.dateReported,
          ) ?? record.updatedAt,
        status: record.status,
        vehicleId: record.vehicleId,
      })),
      ...rows.reminders.map((reminder) => ({
        id: String(reminder._id),
        kind: "reminder",
        title: reminder.title,
        start: reminder.dueAt,
        end: reminder.dueAt,
        status: reminder.status,
        entityType: reminder.entityType,
        entityId: reminder.entityId,
      })),
    ].sort((a, b) => a.start - b.start);
  },
});

export const createDepot = mutation({
  args: { name: v.string(), address: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, manageVehicleCaps);
    const now = Date.now();
    const id = await ctx.db.insert("depots", {
      orgId: auth.org._id,
      name: args.name.trim(),
      address: clean(args.address),
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user._id,
      updatedBy: auth.user._id,
    });
    await writeFleetAudit(ctx, auth, {
      entityType: "depot",
      entityId: String(id),
      action: "depot_created",
    });
    return id;
  },
});

export const createVehicle = mutation({
  args: {
    name: v.string(),
    registrationNumber: v.string(),
    registrationState: v.optional(v.string()),
    vin: v.optional(v.string()),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    year: v.optional(v.number()),
    vehicleType: v.string(),
    fuelType: v.optional(v.string()),
    odometer: v.optional(v.number()),
    engineHours: v.optional(v.number()),
    status: v.optional(fleetVehicleStatusValidator),
    depotId: v.optional(v.id("depots")),
    location: v.optional(v.string()),
    teamDepartment: v.optional(v.string()),
    primaryDriverId: v.optional(v.id("drivers")),
    purchaseDate: v.optional(v.string()),
    purchaseCost: v.optional(v.number()),
    leaseDetails: v.optional(v.string()),
    insuranceProvider: v.optional(v.string()),
    insuranceExpiry: v.optional(v.string()),
    regoExpiry: v.optional(v.string()),
    inspectionExpiry: v.optional(v.string()),
    roadworthyExpiry: v.optional(v.string()),
    serviceIntervalKm: v.optional(v.number()),
    serviceIntervalMonths: v.optional(v.number()),
    serviceIntervalEngineHours: v.optional(v.number()),
    nextServiceDueDate: v.optional(v.string()),
    nextServiceDueOdometer: v.optional(v.number()),
    lastServiceDate: v.optional(v.string()),
    lastServiceOdometer: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, manageVehicleCaps);
    if (args.depotId) assertSameOrg(auth, await ctx.db.get(args.depotId));
    if (args.primaryDriverId)
      assertSameOrg(auth, await ctx.db.get(args.primaryDriverId));
    const now = Date.now();
    const id = await ctx.db.insert("vehicles", {
      orgId: auth.org._id,
      name: args.name.trim(),
      registrationNumber: args.registrationNumber.trim().toUpperCase(),
      registrationState: clean(args.registrationState),
      vin: clean(args.vin),
      make: clean(args.make),
      model: clean(args.model),
      year: args.year,
      vehicleType: args.vehicleType.trim(),
      fuelType: clean(args.fuelType),
      odometer: args.odometer ?? 0,
      engineHours: args.engineHours,
      status: args.status ?? "active",
      depotId: args.depotId,
      location: clean(args.location),
      teamDepartment: clean(args.teamDepartment),
      primaryDriverId: args.primaryDriverId,
      purchaseDate: args.purchaseDate || undefined,
      purchaseCost: args.purchaseCost,
      leaseDetails: clean(args.leaseDetails),
      insuranceProvider: clean(args.insuranceProvider),
      insuranceExpiry: args.insuranceExpiry || undefined,
      insuranceStatus: documentStatus(args.insuranceExpiry),
      regoExpiry: args.regoExpiry || undefined,
      regoStatus: documentStatus(args.regoExpiry),
      inspectionExpiry: args.inspectionExpiry || undefined,
      inspectionStatus: documentStatus(args.inspectionExpiry),
      roadworthyExpiry: args.roadworthyExpiry || undefined,
      roadworthyStatus: documentStatus(args.roadworthyExpiry),
      serviceIntervalKm: args.serviceIntervalKm,
      serviceIntervalMonths: args.serviceIntervalMonths,
      serviceIntervalEngineHours: args.serviceIntervalEngineHours,
      nextServiceDueDate: args.nextServiceDueDate || undefined,
      nextServiceDueOdometer: args.nextServiceDueOdometer,
      lastServiceDate: args.lastServiceDate || undefined,
      lastServiceOdometer: args.lastServiceOdometer,
      notes: clean(args.notes),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user._id,
      updatedBy: auth.user._id,
    });
    await writeFleetAudit(ctx, auth, {
      entityType: "vehicle",
      entityId: String(id),
      action: "vehicle_created",
      newValue: args,
    });
    await generateRemindersForOrg(ctx, auth);
    return id;
  },
});

export const updateVehicle = mutation({
  args: {
    vehicleId: v.id("vehicles"),
    name: v.optional(v.string()),
    registrationNumber: v.optional(v.string()),
    status: v.optional(fleetVehicleStatusValidator),
    odometer: v.optional(v.number()),
    engineHours: v.optional(v.number()),
    depotId: v.optional(v.union(v.id("depots"), v.null())),
    location: v.optional(v.string()),
    teamDepartment: v.optional(v.string()),
    primaryDriverId: v.optional(v.union(v.id("drivers"), v.null())),
    insuranceExpiry: v.optional(v.string()),
    regoExpiry: v.optional(v.string()),
    inspectionExpiry: v.optional(v.string()),
    roadworthyExpiry: v.optional(v.string()),
    serviceIntervalKm: v.optional(v.number()),
    serviceIntervalMonths: v.optional(v.number()),
    nextServiceDueDate: v.optional(v.string()),
    nextServiceDueOdometer: v.optional(v.number()),
    lastServiceDate: v.optional(v.string()),
    lastServiceOdometer: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, manageVehicleCaps);
    const vehicle = await ctx.db.get(args.vehicleId);
    assertSameOrg(auth, vehicle);
    if (args.depotId) assertSameOrg(auth, await ctx.db.get(args.depotId));
    if (args.primaryDriverId)
      assertSameOrg(auth, await ctx.db.get(args.primaryDriverId));
    const patch: Partial<Doc<"vehicles">> = {
      updatedAt: Date.now(),
      updatedBy: auth.user._id,
    };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.registrationNumber !== undefined)
      patch.registrationNumber = args.registrationNumber.trim().toUpperCase();
    if (args.status !== undefined) patch.status = args.status;
    if (args.odometer !== undefined) patch.odometer = args.odometer;
    if (args.engineHours !== undefined) patch.engineHours = args.engineHours;
    if (args.depotId !== undefined) patch.depotId = args.depotId ?? undefined;
    if (args.location !== undefined) patch.location = clean(args.location);
    if (args.teamDepartment !== undefined)
      patch.teamDepartment = clean(args.teamDepartment);
    if (args.primaryDriverId !== undefined)
      patch.primaryDriverId = args.primaryDriverId ?? undefined;
    if (args.insuranceExpiry !== undefined) {
      patch.insuranceExpiry = args.insuranceExpiry || undefined;
      patch.insuranceStatus = documentStatus(args.insuranceExpiry);
    }
    if (args.regoExpiry !== undefined) {
      patch.regoExpiry = args.regoExpiry || undefined;
      patch.regoStatus = documentStatus(args.regoExpiry);
    }
    if (args.inspectionExpiry !== undefined) {
      patch.inspectionExpiry = args.inspectionExpiry || undefined;
      patch.inspectionStatus = documentStatus(args.inspectionExpiry);
    }
    if (args.roadworthyExpiry !== undefined) {
      patch.roadworthyExpiry = args.roadworthyExpiry || undefined;
      patch.roadworthyStatus = documentStatus(args.roadworthyExpiry);
    }
    if (args.serviceIntervalKm !== undefined)
      patch.serviceIntervalKm = args.serviceIntervalKm;
    if (args.serviceIntervalMonths !== undefined)
      patch.serviceIntervalMonths = args.serviceIntervalMonths;
    if (args.nextServiceDueDate !== undefined)
      patch.nextServiceDueDate = args.nextServiceDueDate || undefined;
    if (args.nextServiceDueOdometer !== undefined)
      patch.nextServiceDueOdometer = args.nextServiceDueOdometer;
    if (args.lastServiceDate !== undefined)
      patch.lastServiceDate = args.lastServiceDate || undefined;
    if (args.lastServiceOdometer !== undefined)
      patch.lastServiceOdometer = args.lastServiceOdometer;
    if (args.notes !== undefined) patch.notes = clean(args.notes);
    await ctx.db.patch(args.vehicleId, patch);
    await writeFleetAudit(ctx, auth, {
      entityType: "vehicle",
      entityId: String(args.vehicleId),
      action:
        vehicle!.status !== patch.status && patch.status
          ? "vehicle_status_changed"
          : "vehicle_updated",
      oldValue: vehicle,
      newValue: patch,
    });
    await generateRemindersForOrg(ctx, auth);
    return args.vehicleId;
  },
});

export const addVehicleDocument = mutation({
  args: {
    vehicleId: v.id("vehicles"),
    documentType: v.string(),
    storageId: v.optional(v.string()),
    fileId: v.optional(v.id("uploadedFiles")),
    fileName: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    renewalCost: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, manageVehicleCaps);
    assertSameOrg(auth, await ctx.db.get(args.vehicleId));
    const uploaded = args.storageId
      ? await ctx.db
          .query("uploadedFiles")
          .withIndex("by_storage", (q) => q.eq("storageId", args.storageId!))
          .unique()
      : null;
    if (uploaded) assertSameOrg(auth, uploaded);
    const now = Date.now();
    const id = await ctx.db.insert("vehicleDocuments", {
      orgId: auth.org._id,
      vehicleId: args.vehicleId,
      documentType: args.documentType.trim(),
      fileId: args.fileId ?? uploaded?._id,
      fileName: clean(args.fileName),
      expiryDate: args.expiryDate || undefined,
      renewalStatus: documentStatus(args.expiryDate),
      renewalCost: args.renewalCost,
      notes: clean(args.notes),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user._id,
      updatedBy: auth.user._id,
    });
    await writeFleetAudit(ctx, auth, {
      entityType: "vehicle",
      entityId: String(args.vehicleId),
      action: `${args.documentType.toLowerCase()}_updated`,
      newValue: args,
    });
    await generateRemindersForOrg(ctx, auth);
    return id;
  },
});

export const createDriver = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    driverType: v.optional(v.string()),
    licenceNumber: v.optional(v.string()),
    licenceClass: v.optional(v.string()),
    licenceExpiry: v.optional(v.string()),
    medicalClearanceExpiry: v.optional(v.string()),
    policeCheckExpiry: v.optional(v.string()),
    workingWithChildrenCheckExpiry: v.optional(v.string()),
    inductionStatus: v.optional(v.string()),
    approvedVehicleTypes: v.optional(v.array(v.string())),
    status: v.optional(fleetDriverStatusValidator),
    defaultVehicleId: v.optional(v.id("vehicles")),
    depotId: v.optional(v.id("depots")),
    teamDepartment: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, manageDriverCaps);
    if (args.defaultVehicleId)
      assertSameOrg(auth, await ctx.db.get(args.defaultVehicleId));
    if (args.depotId) assertSameOrg(auth, await ctx.db.get(args.depotId));
    const now = Date.now();
    const id = await ctx.db.insert("drivers", {
      orgId: auth.org._id,
      name: args.name.trim(),
      email: clean(args.email),
      phone: clean(args.phone),
      emergencyContactName: clean(args.emergencyContactName),
      emergencyContactPhone: clean(args.emergencyContactPhone),
      driverType: args.driverType?.trim() || "driver",
      licenceNumber: clean(args.licenceNumber),
      licenceClass: clean(args.licenceClass),
      licenceExpiry: args.licenceExpiry || undefined,
      medicalClearanceExpiry: args.medicalClearanceExpiry || undefined,
      policeCheckExpiry: args.policeCheckExpiry || undefined,
      workingWithChildrenCheckExpiry:
        args.workingWithChildrenCheckExpiry || undefined,
      inductionStatus: clean(args.inductionStatus),
      approvedVehicleTypes: args.approvedVehicleTypes ?? [],
      status: args.status ?? "active",
      defaultVehicleId: args.defaultVehicleId,
      depotId: args.depotId,
      teamDepartment: clean(args.teamDepartment),
      notes: clean(args.notes),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user._id,
      updatedBy: auth.user._id,
    });
    await writeFleetAudit(ctx, auth, {
      entityType: "driver",
      entityId: String(id),
      action: "driver_created",
      newValue: args,
    });
    await generateRemindersForOrg(ctx, auth);
    return id;
  },
});

export const updateDriver = mutation({
  args: {
    driverId: v.id("drivers"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    licenceExpiry: v.optional(v.string()),
    medicalClearanceExpiry: v.optional(v.string()),
    policeCheckExpiry: v.optional(v.string()),
    workingWithChildrenCheckExpiry: v.optional(v.string()),
    approvedVehicleTypes: v.optional(v.array(v.string())),
    status: v.optional(fleetDriverStatusValidator),
    defaultVehicleId: v.optional(v.union(v.id("vehicles"), v.null())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, manageDriverCaps);
    const driver = await ctx.db.get(args.driverId);
    assertSameOrg(auth, driver);
    if (args.defaultVehicleId)
      assertSameOrg(auth, await ctx.db.get(args.defaultVehicleId));
    const patch: Partial<Doc<"drivers">> = {
      updatedAt: Date.now(),
      updatedBy: auth.user._id,
    };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.email !== undefined) patch.email = clean(args.email);
    if (args.phone !== undefined) patch.phone = clean(args.phone);
    if (args.licenceExpiry !== undefined)
      patch.licenceExpiry = args.licenceExpiry || undefined;
    if (args.medicalClearanceExpiry !== undefined)
      patch.medicalClearanceExpiry = args.medicalClearanceExpiry || undefined;
    if (args.policeCheckExpiry !== undefined)
      patch.policeCheckExpiry = args.policeCheckExpiry || undefined;
    if (args.workingWithChildrenCheckExpiry !== undefined)
      patch.workingWithChildrenCheckExpiry =
        args.workingWithChildrenCheckExpiry || undefined;
    if (args.approvedVehicleTypes !== undefined)
      patch.approvedVehicleTypes = args.approvedVehicleTypes;
    if (args.status !== undefined) patch.status = args.status;
    if (args.defaultVehicleId !== undefined)
      patch.defaultVehicleId = args.defaultVehicleId ?? undefined;
    if (args.notes !== undefined) patch.notes = clean(args.notes);
    await ctx.db.patch(args.driverId, patch);
    await writeFleetAudit(ctx, auth, {
      entityType: "driver",
      entityId: String(args.driverId),
      action:
        driver!.status !== patch.status && patch.status
          ? "driver_status_changed"
          : "driver_updated",
      oldValue: driver,
      newValue: patch,
    });
    await generateRemindersForOrg(ctx, auth);
    return args.driverId;
  },
});

export const addDriverDocument = mutation({
  args: {
    driverId: v.id("drivers"),
    documentType: v.string(),
    storageId: v.optional(v.string()),
    fileId: v.optional(v.id("uploadedFiles")),
    fileName: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, manageDriverCaps);
    assertSameOrg(auth, await ctx.db.get(args.driverId));
    const uploaded = args.storageId
      ? await ctx.db
          .query("uploadedFiles")
          .withIndex("by_storage", (q) => q.eq("storageId", args.storageId!))
          .unique()
      : null;
    if (uploaded) assertSameOrg(auth, uploaded);
    const now = Date.now();
    const id = await ctx.db.insert("driverDocuments", {
      orgId: auth.org._id,
      driverId: args.driverId,
      documentType: args.documentType.trim(),
      fileId: args.fileId ?? uploaded?._id,
      fileName: clean(args.fileName),
      expiryDate: args.expiryDate || undefined,
      renewalStatus: documentStatus(args.expiryDate),
      notes: clean(args.notes),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user._id,
      updatedBy: auth.user._id,
    });
    await generateRemindersForOrg(ctx, auth);
    return id;
  },
});

export const createProject = mutation({
  args: {
    name: v.string(),
    clientName: v.optional(v.string()),
    status: v.optional(fleetProjectStatusValidator),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    budget: v.optional(v.number()),
    revenue: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, assignJobCaps);
    const now = Date.now();
    const id = await ctx.db.insert("projects", {
      orgId: auth.org._id,
      name: args.name.trim(),
      clientName: clean(args.clientName),
      status: args.status ?? "active",
      startDate: args.startDate || undefined,
      endDate: args.endDate || undefined,
      budget: args.budget,
      revenue: args.revenue,
      notes: clean(args.notes),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user._id,
      updatedBy: auth.user._id,
    });
    await writeFleetAudit(ctx, auth, {
      entityType: "project",
      entityId: String(id),
      action: "project_updated",
      newValue: args,
    });
    return id;
  },
});

export const createJob = mutation({
  args: {
    title: v.string(),
    referenceNumber: v.optional(v.string()),
    customerName: v.optional(v.string()),
    internalDepartment: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    pickupLocation: v.optional(v.string()),
    dropoffLocation: v.optional(v.string()),
    startDateTime: v.number(),
    endDateTime: v.number(),
    assignedVehicleId: v.optional(v.id("vehicles")),
    assignedDriverId: v.optional(v.id("drivers")),
    cargoPassengersEquipment: v.optional(v.string()),
    jobType: v.optional(fleetJobTypeValidator),
    status: v.optional(fleetJobStatusValidator),
    estimatedDistance: v.optional(v.number()),
    estimatedCost: v.optional(v.number()),
    notes: v.optional(v.string()),
    allowWarnings: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, assignJobCaps);
    if (args.projectId) assertSameOrg(auth, await ctx.db.get(args.projectId));
    const issues = await assignmentIssues(ctx, auth, {
      vehicleId: args.assignedVehicleId,
      driverId: args.assignedDriverId,
      startDateTime: args.startDateTime,
      endDateTime: args.endDateTime,
    });
    const blocks = issues.filter((issue) => issue.severity === "block");
    if (blocks.length > 0) {
      throw new ConvexError({ code: "assignment_blocked", issues: blocks });
    }
    const now = Date.now();
    const id = await ctx.db.insert("jobs", {
      orgId: auth.org._id,
      title: args.title.trim(),
      referenceNumber: clean(args.referenceNumber),
      customerName: clean(args.customerName),
      internalDepartment: clean(args.internalDepartment),
      projectId: args.projectId,
      pickupLocation: clean(args.pickupLocation),
      dropoffLocation: clean(args.dropoffLocation),
      startDateTime: args.startDateTime,
      endDateTime: args.endDateTime,
      assignedVehicleId: args.assignedVehicleId,
      assignedDriverId: args.assignedDriverId,
      cargoPassengersEquipment: clean(args.cargoPassengersEquipment),
      jobType: args.jobType ?? "transport",
      status:
        args.status ??
        (args.assignedVehicleId || args.assignedDriverId
          ? "assigned"
          : "scheduled"),
      estimatedDistance: args.estimatedDistance,
      estimatedCost: args.estimatedCost,
      notes: clean(args.notes),
      warningsJson: issues.length ? JSON.stringify(issues) : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user._id,
      updatedBy: auth.user._id,
    });
    if (args.assignedVehicleId)
      await ctx.db.patch(args.assignedVehicleId, {
        status: "booked",
        updatedAt: now,
        updatedBy: auth.user._id,
      });
    await writeFleetAudit(ctx, auth, {
      entityType: "job",
      entityId: String(id),
      action:
        args.assignedVehicleId || args.assignedDriverId
          ? "job_assigned"
          : "job_created",
      newValue: args,
      metadata: { issues },
    });
    await notifyFleet(ctx, auth, {
      title: "Job assigned",
      body: args.title,
      entityType: "job",
      entityId: String(id),
      driverId: args.assignedDriverId,
    });
    await generateRemindersForOrg(ctx, auth);
    return { jobId: id, warnings: issues };
  },
});

export const updateJobStatus = mutation({
  args: {
    jobId: v.id("jobs"),
    status: fleetJobStatusValidator,
    actualDistance: v.optional(v.number()),
    actualCost: v.optional(v.number()),
    completionChecklistJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, [
      ...assignJobCaps,
      ...driverPortalCaps,
    ]);
    const job = await ctx.db.get(args.jobId);
    assertSameOrg(auth, job);
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: args.status,
      actualDistance: args.actualDistance ?? job!.actualDistance,
      actualCost: args.actualCost ?? job!.actualCost,
      completionChecklistJson:
        args.completionChecklistJson ?? job!.completionChecklistJson,
      startedAt: args.status === "in_progress" ? now : job!.startedAt,
      completedAt: args.status === "completed" ? now : job!.completedAt,
      updatedAt: now,
      updatedBy: auth.user._id,
    });
    if (args.status === "completed" && job!.assignedVehicleId) {
      await ctx.db.patch(job!.assignedVehicleId, {
        status: "active",
        updatedAt: now,
        updatedBy: auth.user._id,
      });
    }
    await writeFleetAudit(ctx, auth, {
      entityType: "job",
      entityId: String(args.jobId),
      action: args.status === "completed" ? "job_completed" : "job_changed",
      oldValue: job,
      newValue: args,
    });
    return args.jobId;
  },
});

export const createMaintenanceRecord = mutation({
  args: {
    vehicleId: v.id("vehicles"),
    maintenanceType: v.optional(fleetMaintenanceCategoryValidator),
    dateReported: v.optional(v.string()),
    scheduledDate: v.optional(v.string()),
    odometer: v.optional(v.number()),
    vendorMechanic: v.optional(v.string()),
    status: v.optional(fleetMaintenanceStatusValidator),
    description: v.string(),
    partsCost: v.optional(v.number()),
    labourCost: v.optional(v.number()),
    downtimeHours: v.optional(v.number()),
    notes: v.optional(v.string()),
    linkedDefectId: v.optional(v.id("defectReports")),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, manageMaintenanceCaps);
    assertSameOrg(auth, await ctx.db.get(args.vehicleId));
    if (args.linkedDefectId)
      assertSameOrg(auth, await ctx.db.get(args.linkedDefectId));
    const now = Date.now();
    const totalCost = (args.partsCost ?? 0) + (args.labourCost ?? 0);
    const id = await ctx.db.insert("maintenanceRecords", {
      orgId: auth.org._id,
      vehicleId: args.vehicleId,
      maintenanceType: args.maintenanceType ?? "scheduled_service",
      dateReported: args.dateReported || todayIso(now),
      scheduledDate: args.scheduledDate || undefined,
      odometer: args.odometer,
      vendorMechanic: clean(args.vendorMechanic),
      status: args.status ?? "scheduled",
      description: args.description.trim(),
      partsCost: args.partsCost,
      labourCost: args.labourCost,
      totalCost: totalCost || undefined,
      downtimeHours: args.downtimeHours,
      notes: clean(args.notes),
      linkedDefectId: args.linkedDefectId,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user._id,
      updatedBy: auth.user._id,
    });
    if (
      ["scheduled", "in_progress", "reported"].includes(
        args.status ?? "scheduled",
      )
    ) {
      await ctx.db.patch(args.vehicleId, {
        status: "in_maintenance",
        updatedAt: now,
        updatedBy: auth.user._id,
      });
    }
    await writeFleetAudit(ctx, auth, {
      entityType: "maintenance",
      entityId: String(id),
      action: "maintenance_created",
      newValue: args,
    });
    await generateRemindersForOrg(ctx, auth);
    return id;
  },
});

export const completeMaintenanceRecord = mutation({
  args: {
    maintenanceId: v.id("maintenanceRecords"),
    completedDate: v.optional(v.string()),
    odometer: v.optional(v.number()),
    partsCost: v.optional(v.number()),
    labourCost: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, manageMaintenanceCaps);
    const record = await ctx.db.get(args.maintenanceId);
    assertSameOrg(auth, record);
    const vehicle = await ctx.db.get(record!.vehicleId);
    assertSameOrg(auth, vehicle);
    const now = Date.now();
    const totalCost =
      (args.partsCost ?? record!.partsCost ?? 0) +
      (args.labourCost ?? record!.labourCost ?? 0);
    await ctx.db.patch(args.maintenanceId, {
      status: "completed",
      completedDate: args.completedDate || todayIso(now),
      odometer: args.odometer ?? record!.odometer,
      partsCost: args.partsCost ?? record!.partsCost,
      labourCost: args.labourCost ?? record!.labourCost,
      totalCost: totalCost || record!.totalCost,
      notes: clean(args.notes) ?? record!.notes,
      updatedAt: now,
      updatedBy: auth.user._id,
    });
    await ctx.db.patch(vehicle!._id, {
      status: "active",
      odometer: Math.max(
        vehicle!.odometer,
        args.odometer ?? record!.odometer ?? vehicle!.odometer,
      ),
      lastServiceDate: args.completedDate || todayIso(now),
      lastServiceOdometer:
        args.odometer ?? record!.odometer ?? vehicle!.odometer,
      updatedAt: now,
      updatedBy: auth.user._id,
    });
    await writeFleetAudit(ctx, auth, {
      entityType: "maintenance",
      entityId: String(args.maintenanceId),
      action: "maintenance_completed",
      oldValue: record,
      newValue: args,
    });
    await writeFleetAudit(ctx, auth, {
      entityType: "vehicle",
      entityId: String(vehicle!._id),
      action: "service_completed",
      newValue: args,
    });
    await generateRemindersForOrg(ctx, auth);
    return args.maintenanceId;
  },
});

export const submitDefect = mutation({
  args: {
    vehicleId: v.id("vehicles"),
    odometer: v.optional(v.number()),
    category: v.optional(v.string()),
    severity: fleetDefectSeverityValidator,
    notes: v.optional(v.string()),
    safeToOperate: v.boolean(),
    immediateActionRequired: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, submitDefectCaps);
    const vehicle = await ctx.db.get(args.vehicleId);
    assertSameOrg(auth, vehicle);
    const driver = await getDriverForCurrentUser(ctx, auth);
    const now = Date.now();
    const id = await ctx.db.insert("defectReports", {
      orgId: auth.org._id,
      vehicleId: args.vehicleId,
      reporterUserId: auth.user._id,
      reporterDriverId: driver?._id,
      dateTime: now,
      odometer: args.odometer,
      category: args.category?.trim() || "General",
      severity: args.severity,
      notes: clean(args.notes),
      safeToOperate: args.safeToOperate,
      immediateActionRequired:
        args.immediateActionRequired ??
        criticalDefectRequiresUnavailable(args.severity, args.safeToOperate),
      status: "open",
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user._id,
      updatedBy: auth.user._id,
    });
    if (args.odometer !== undefined && args.odometer > vehicle!.odometer) {
      await ctx.db.patch(args.vehicleId, {
        odometer: args.odometer,
        updatedAt: now,
        updatedBy: auth.user._id,
      });
    }
    if (criticalDefectRequiresUnavailable(args.severity, args.safeToOperate)) {
      await ctx.db.patch(args.vehicleId, {
        status: "unavailable",
        updatedAt: now,
        updatedBy: auth.user._id,
      });
      const maintenanceId = await ctx.db.insert("maintenanceRecords", {
        orgId: auth.org._id,
        vehicleId: args.vehicleId,
        maintenanceType: "defect_repair",
        dateReported: todayIso(now),
        status: "reported",
        description: `Defect repair: ${args.category ?? "General"}`,
        linkedDefectId: id,
        createdAt: now,
        updatedAt: now,
        createdBy: auth.user._id,
        updatedBy: auth.user._id,
      });
      await ctx.db.patch(id, { linkedMaintenanceRecordId: maintenanceId });
      await notifyFleet(ctx, auth, {
        title: "Critical defect submitted",
        body: `${vehicle!.name}: ${args.notes ?? args.category ?? "Defect requires attention"}`,
        entityType: "defect",
        entityId: String(id),
      });
    }
    await writeFleetAudit(ctx, auth, {
      entityType: "defect",
      entityId: String(id),
      action: "defect_submitted",
      newValue: args,
    });
    await generateRemindersForOrg(ctx, auth);
    return id;
  },
});

export const resolveFleetDefect = mutation({
  args: {
    defectId: v.id("defectReports"),
    status: v.optional(fleetDefectStatusValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, manageMaintenanceCaps);
    const defect = await ctx.db.get(args.defectId);
    assertSameOrg(auth, defect);
    const status = args.status ?? "fixed";
    const now = Date.now();
    await ctx.db.patch(args.defectId, {
      status,
      notes: clean(args.notes) ?? defect!.notes,
      updatedAt: now,
      updatedBy: auth.user._id,
    });
    const openUnsafe = (
      await ctx.db
        .query("defectReports")
        .withIndex("by_vehicle", (q) => q.eq("vehicleId", defect!.vehicleId))
        .collect()
    ).some(
      (row) =>
        row._id !== args.defectId &&
        notDeleted(row) &&
        !["fixed", "closed", "rejected"].includes(row.status) &&
        criticalDefectRequiresUnavailable(row.severity, row.safeToOperate),
    );
    if (!openUnsafe) {
      await ctx.db.patch(defect!.vehicleId, {
        status: "active",
        updatedAt: now,
        updatedBy: auth.user._id,
      });
    }
    await writeFleetAudit(ctx, auth, {
      entityType: "defect",
      entityId: String(args.defectId),
      action: "defect_resolved",
      oldValue: defect,
      newValue: { status },
    });
    return args.defectId;
  },
});

export const createFuelLog = mutation({
  args: {
    vehicleId: v.id("vehicles"),
    driverId: v.optional(v.id("drivers")),
    jobId: v.optional(v.id("jobs")),
    projectId: v.optional(v.id("projects")),
    date: v.optional(v.string()),
    odometer: v.number(),
    litres: v.number(),
    cost: v.number(),
    fuelType: v.optional(v.string()),
    locationStation: v.optional(v.string()),
    fullTank: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, [
      ...driverPortalCaps,
      ...manageCostCaps,
    ]);
    const vehicle = await ctx.db.get(args.vehicleId);
    assertSameOrg(auth, vehicle);
    if (args.driverId) assertSameOrg(auth, await ctx.db.get(args.driverId));
    if (args.jobId) assertSameOrg(auth, await ctx.db.get(args.jobId));
    if (args.projectId) assertSameOrg(auth, await ctx.db.get(args.projectId));
    const now = Date.now();
    const id = await ctx.db.insert("fuelLogs", {
      orgId: auth.org._id,
      vehicleId: args.vehicleId,
      driverId: args.driverId,
      jobId: args.jobId,
      projectId: args.projectId,
      date: args.date || todayIso(now),
      odometer: args.odometer,
      litres: args.litres,
      cost: args.cost,
      fuelType: clean(args.fuelType) ?? vehicle!.fuelType,
      locationStation: clean(args.locationStation),
      fullTank: args.fullTank ?? true,
      notes: clean(args.notes),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user._id,
      updatedBy: auth.user._id,
    });
    await ctx.db.patch(args.vehicleId, {
      odometer: Math.max(vehicle!.odometer, args.odometer),
      updatedAt: now,
      updatedBy: auth.user._id,
    });
    await ctx.db.insert("costEntries", {
      orgId: auth.org._id,
      date: args.date || todayIso(now),
      category: "fuel",
      amount: args.cost,
      vehicleId: args.vehicleId,
      driverId: args.driverId,
      jobId: args.jobId,
      projectId: args.projectId,
      notes: "Fuel log",
      approvalStatus: "submitted",
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user._id,
      updatedBy: auth.user._id,
    });
    await writeFleetAudit(ctx, auth, {
      entityType: "fuelLog",
      entityId: String(id),
      action: "cost_added",
      newValue: args,
    });
    return id;
  },
});

export const createCostEntry = mutation({
  args: {
    date: v.optional(v.string()),
    category: fleetCostCategoryValidator,
    amount: v.number(),
    taxGst: v.optional(v.number()),
    vehicleId: v.optional(v.id("vehicles")),
    driverId: v.optional(v.id("drivers")),
    jobId: v.optional(v.id("jobs")),
    projectId: v.optional(v.id("projects")),
    notes: v.optional(v.string()),
    approvalStatus: v.optional(fleetApprovalStatusValidator),
  },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, manageCostCaps);
    if (args.vehicleId) assertSameOrg(auth, await ctx.db.get(args.vehicleId));
    if (args.driverId) assertSameOrg(auth, await ctx.db.get(args.driverId));
    if (args.jobId) assertSameOrg(auth, await ctx.db.get(args.jobId));
    if (args.projectId) assertSameOrg(auth, await ctx.db.get(args.projectId));
    const now = Date.now();
    const id = await ctx.db.insert("costEntries", {
      orgId: auth.org._id,
      date: args.date || todayIso(now),
      category: args.category,
      amount: args.amount,
      taxGst: args.taxGst,
      vehicleId: args.vehicleId,
      driverId: args.driverId,
      jobId: args.jobId,
      projectId: args.projectId,
      notes: clean(args.notes),
      approvalStatus: args.approvalStatus ?? "submitted",
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user._id,
      updatedBy: auth.user._id,
    });
    await writeFleetAudit(ctx, auth, {
      entityType: "cost",
      entityId: String(id),
      action: "cost_added",
      newValue: args,
    });
    return id;
  },
});

export const approveCostEntry = mutation({
  args: { costId: v.id("costEntries"), approved: v.boolean() },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, approveCostCaps);
    const cost = await ctx.db.get(args.costId);
    assertSameOrg(auth, cost);
    await ctx.db.patch(args.costId, {
      approvalStatus: args.approved ? "approved" : "rejected",
      approvedBy: auth.user._id,
      approvedAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: auth.user._id,
    });
    await writeFleetAudit(ctx, auth, {
      entityType: "cost",
      entityId: String(args.costId),
      action: "cost_approved",
      oldValue: cost,
      newValue: { approved: args.approved },
    });
    return args.costId;
  },
});

export const driverPortal = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireFleetAny(ctx, driverPortalCaps);
    const driver = await getDriverForCurrentUser(ctx, auth);
    const rows = await allFleetRows(ctx, auth.org._id);
    const now = Date.now();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday.getTime() + DAY_MS);
    const jobs = rows.jobs
      .filter((job) => !driver || job.assignedDriverId === driver._id)
      .filter(
        (job) => !["completed", "cancelled", "failed"].includes(job.status),
      )
      .sort((a, b) => a.startDateTime - b.startDateTime);
    return {
      driver,
      todayJobs: jobs.filter(
        (job) =>
          job.startDateTime < endOfToday.getTime() &&
          job.endDateTime >= startOfToday.getTime(),
      ),
      upcomingJobs: jobs
        .filter((job) => job.startDateTime >= endOfToday.getTime())
        .slice(0, 10),
      vehicles: rows.vehicles,
    };
  },
});

export const generateReminders = mutation({
  args: {},
  handler: async (ctx) => {
    const auth = await requireFleetAny(ctx, [
      "fleet.reminders.manage",
      "fleet.manage",
    ]);
    return await generateRemindersForOrg(ctx, auth);
  },
});

export const markReminderResolved = mutation({
  args: { reminderId: v.id("reminders") },
  handler: async (ctx, args) => {
    const auth = await requireFleetAny(ctx, [
      "fleet.reminders.manage",
      "fleet.manage",
    ]);
    const reminder = await ctx.db.get(args.reminderId);
    assertSameOrg(auth, reminder);
    await ctx.db.patch(args.reminderId, {
      status: "resolved",
      resolvedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const exportData = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireFleetAny(ctx, exportCaps);
    const rows = await allFleetRows(ctx, auth.org._id);
    return {
      vehicles: rows.vehicles,
      drivers: rows.drivers,
      jobs: rows.jobs,
      maintenance: rows.maintenance,
      defects: rows.defects,
      costs: rows.costs,
      fuelLogs: rows.fuelLogs,
      reminders: rows.reminders,
      projects: rows.projects,
      auditLogs: await ctx.db
        .query("auditLogs")
        .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
        .order("desc")
        .take(500),
    };
  },
});

async function notifyFleet(
  ctx: MutationCtx,
  auth: AuthContext,
  args: {
    title: string;
    body: string;
    entityType: string;
    entityId: string;
    driverId?: Id<"drivers">;
  },
) {
  await ctx.db.insert("notifications", {
    orgId: auth.org._id,
    channel: "in_app",
    status: "queued",
    recipientDriverId: args.driverId,
    title: args.title,
    body: args.body,
    entityType: args.entityType,
    entityId: args.entityId,
    createdAt: Date.now(),
  });
}

async function upsertReminder(
  ctx: MutationCtx,
  auth: AuthContext,
  args: {
    type: Doc<"reminders">["type"];
    entityType: string;
    entityId: string;
    title: string;
    description?: string;
    dueAt: number;
    timingDays: number;
    severity?: string;
    assignedDriverId?: Id<"drivers">;
  },
) {
  const sourceKey = `${args.entityType}:${args.entityId}:${args.type}:${args.timingDays}`;
  const existing = await ctx.db
    .query("reminders")
    .withIndex("by_org_source", (q) =>
      q.eq("orgId", auth.org._id).eq("sourceKey", sourceKey),
    )
    .unique();
  const now = Date.now();
  const triggerAt = args.dueAt - args.timingDays * DAY_MS;
  const status: Doc<"reminders">["status"] =
    args.dueAt < now ? "overdue" : triggerAt <= now ? "due" : "scheduled";
  if (existing) {
    if (existing.status === "resolved" || existing.deletedAt) return false;
    await ctx.db.patch(existing._id, {
      title: args.title,
      description: args.description,
      dueAt: args.dueAt,
      triggerAt,
      status,
      severity: args.severity,
      assignedDriverId: args.assignedDriverId,
      updatedAt: now,
    });
    return false;
  }
  await ctx.db.insert("reminders", {
    orgId: auth.org._id,
    type: args.type,
    entityType: args.entityType,
    entityId: args.entityId,
    title: args.title,
    description: args.description,
    dueAt: args.dueAt,
    triggerAt,
    timingDays: args.timingDays,
    status,
    severity: args.severity,
    assignedDriverId: args.assignedDriverId,
    sourceKey,
    createdAt: now,
    updatedAt: now,
  });
  return true;
}

async function remindersForDate(
  ctx: MutationCtx,
  auth: AuthContext,
  args: {
    type: Doc<"reminders">["type"];
    entityType: string;
    entityId: string;
    entityName: string;
    label: string;
    iso?: string;
    timingDays: number[];
    severity?: string;
    assignedDriverId?: Id<"drivers">;
  },
) {
  const dueAt = fleetIsoToMs(args.iso);
  if (dueAt === null) return 0;
  let created = 0;
  for (const timingDays of args.timingDays) {
    if (
      await upsertReminder(ctx, auth, {
        type: args.type,
        entityType: args.entityType,
        entityId: args.entityId,
        title: `${args.entityName}: ${args.label}`,
        dueAt,
        timingDays,
        severity: args.severity,
        assignedDriverId: args.assignedDriverId,
      })
    ) {
      created += 1;
    }
  }
  return created;
}

async function generateRemindersForOrg(ctx: MutationCtx, auth: AuthContext) {
  const rows = await allFleetRows(ctx, auth.org._id);
  const profileModule = (
    await ctx.db
      .query("organizationModules")
      .withIndex("by_org_key", (q) =>
        q.eq("orgId", auth.org._id).eq("key", "fleet"),
      )
      .unique()
  )?.configJson;
  let timingDays = [90, 60, 30, 14, 7, 0];
  if (profileModule) {
    try {
      const parsed = JSON.parse(profileModule) as { reminderDays?: number[] };
      if (Array.isArray(parsed.reminderDays)) timingDays = parsed.reminderDays;
    } catch {
      // Keep default timings.
    }
  }
  let created = 0;
  for (const vehicle of rows.vehicles) {
    created += await remindersForDate(ctx, auth, {
      type: "rego_expiry",
      entityType: "vehicle",
      entityId: String(vehicle._id),
      entityName: vehicle.name,
      label: "Registration expiry",
      iso: vehicle.regoExpiry,
      timingDays,
      severity:
        renewalState(vehicle.regoExpiry) === "expired" ? "critical" : "warning",
    });
    created += await remindersForDate(ctx, auth, {
      type: "insurance_expiry",
      entityType: "vehicle",
      entityId: String(vehicle._id),
      entityName: vehicle.name,
      label: "Insurance expiry",
      iso: vehicle.insuranceExpiry,
      timingDays,
    });
    created += await remindersForDate(ctx, auth, {
      type: "inspection_expiry",
      entityType: "vehicle",
      entityId: String(vehicle._id),
      entityName: vehicle.name,
      label: "Inspection expiry",
      iso: vehicle.inspectionExpiry,
      timingDays,
    });
    created += await remindersForDate(ctx, auth, {
      type: "roadworthy_expiry",
      entityType: "vehicle",
      entityId: String(vehicle._id),
      entityName: vehicle.name,
      label: "Roadworthy expiry",
      iso: vehicle.roadworthyExpiry,
      timingDays,
    });
    const service = vehicleServiceState(vehicle);
    if (service.nextServiceDueDate) {
      created += await remindersForDate(ctx, auth, {
        type: "service_due_date",
        entityType: "vehicle",
        entityId: String(vehicle._id),
        entityName: vehicle.name,
        label: "Service due",
        iso: service.nextServiceDueDate,
        timingDays,
        severity: service.state === "overdue" ? "critical" : "warning",
      });
    }
    if (service.nextServiceDueOdometer !== undefined) {
      const sourceKey = `vehicle:${vehicle._id}:service_due_odometer:0`;
      const dueAt = Date.now();
      const existing = await ctx.db
        .query("reminders")
        .withIndex("by_org_source", (q) =>
          q.eq("orgId", auth.org._id).eq("sourceKey", sourceKey),
        )
        .unique();
      if (!existing && service.state !== "ok") {
        await ctx.db.insert("reminders", {
          orgId: auth.org._id,
          type: "service_due_odometer",
          entityType: "vehicle",
          entityId: String(vehicle._id),
          title: `${vehicle.name}: Service due by odometer`,
          dueAt,
          triggerAt: dueAt,
          timingDays: 0,
          status: service.state === "overdue" ? "overdue" : "due",
          severity: service.state === "overdue" ? "critical" : "warning",
          sourceKey,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        created += 1;
      }
    }
  }
  for (const driver of rows.drivers) {
    created += await remindersForDate(ctx, auth, {
      type: "licence_expiry",
      entityType: "driver",
      entityId: String(driver._id),
      entityName: driver.name,
      label: "Licence expiry",
      iso: driver.licenceExpiry,
      timingDays,
      assignedDriverId: driver._id,
    });
    created += await remindersForDate(ctx, auth, {
      type: "wwcc_expiry",
      entityType: "driver",
      entityId: String(driver._id),
      entityName: driver.name,
      label: "WWCC expiry",
      iso: driver.workingWithChildrenCheckExpiry,
      timingDays,
      assignedDriverId: driver._id,
    });
    created += await remindersForDate(ctx, auth, {
      type: "police_check_expiry",
      entityType: "driver",
      entityId: String(driver._id),
      entityName: driver.name,
      label: "Police check expiry",
      iso: driver.policeCheckExpiry,
      timingDays,
      assignedDriverId: driver._id,
    });
    created += await remindersForDate(ctx, auth, {
      type: "medical_clearance_expiry",
      entityType: "driver",
      entityId: String(driver._id),
      entityName: driver.name,
      label: "Medical clearance expiry",
      iso: driver.medicalClearanceExpiry,
      timingDays,
      assignedDriverId: driver._id,
    });
  }
  for (const job of rows.jobs) {
    if (
      !["completed", "cancelled", "failed"].includes(job.status) &&
      job.endDateTime < Date.now()
    ) {
      await upsertReminder(ctx, auth, {
        type: "job_overdue",
        entityType: "job",
        entityId: String(job._id),
        title: `${job.title}: Job overdue`,
        dueAt: job.endDateTime,
        timingDays: 0,
        severity: "warning",
        assignedDriverId: job.assignedDriverId,
      });
    }
  }
  for (const project of rows.projects) {
    const actual = rows.costs
      .filter((cost) => cost.projectId === project._id)
      .reduce((sum, cost) => sum + cost.amount, 0);
    if (project.budget !== undefined && actual > project.budget) {
      await upsertReminder(ctx, auth, {
        type: "project_budget_exceeded",
        entityType: "project",
        entityId: String(project._id),
        title: `${project.name}: Budget exceeded`,
        dueAt: Date.now(),
        timingDays: 0,
        severity: "warning",
      });
    }
  }
  return { created };
}

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
