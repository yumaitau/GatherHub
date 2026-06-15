import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { requireOrgMember, assertSameOrg, type AuthContext } from "./lib/auth";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";
import { requireCapability } from "./lib/capabilities";
import { requireModule } from "./lib/orgConfig";
import {
  wasteStreamClassificationValidator,
  wasteUnitValidator,
} from "./schema";
import {
  canTransition,
  detectDiscrepancies,
  parseWasteConfig,
  type WasteConfig,
  type WasteLoadStatus,
} from "./lib/wasteLogic";

/**
 * Waste-removal vertical (GX-11). Tracks loads of trackable waste from a
 * consignor, via a transporter, to a receiving facility, against a transport
 * certificate / manifest, with an immutable chain-of-custody log.
 *
 * Authorisation (all gated behind the `waste` module being enabled):
 * - reads require `waste.view`,
 * - field actions (pickup, arrival, custody notes) require `waste.operate`,
 * - dispatch and decisions (create, accept/reject/process, config) require
 *   `waste.manage`,
 * - exports require `waste.export`.
 *
 * Idempotency: every state-changing field action accepts a `clientMutationId`.
 * Replays return the original load id without appending a second custody event,
 * so the chain-of-custody stays correct under mobile retry. Custody events are
 * append-only (see schema) — the load row is the mutable projection of them.
 */

// --- Auth helpers -----------------------------------------------------------

async function requireWasteRead(ctx: QueryCtx | MutationCtx) {
  const auth = await requireOrgMember(ctx);
  await requireModule(ctx, auth, "waste");
  await requireCapability(ctx, auth, "waste.view");
  return auth;
}

async function requireWasteOperate(ctx: MutationCtx) {
  const auth = await requireOrgMember(ctx);
  await requireModule(ctx, auth, "waste");
  await requireCapability(ctx, auth, "waste.operate");
  return auth;
}

async function requireWasteManage(ctx: MutationCtx) {
  const auth = await requireOrgMember(ctx);
  await requireModule(ctx, auth, "waste");
  await requireCapability(ctx, auth, "waste.manage");
  return auth;
}

async function requireWasteExport(ctx: QueryCtx | MutationCtx) {
  const auth = await requireOrgMember(ctx);
  await requireModule(ctx, auth, "waste");
  await requireCapability(ctx, auth, "waste.export");
  return auth;
}

// --- Config -----------------------------------------------------------------

async function getWasteConfig(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
): Promise<WasteConfig> {
  const row = await ctx.db
    .query("organizationModules")
    .withIndex("by_org_key", (q) =>
      q.eq("orgId", auth.org._id).eq("key", "waste"),
    )
    .unique();
  return parseWasteConfig(row?.configJson);
}

// --- Entity loaders (cross-org safe) ----------------------------------------

async function requireLoad(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  loadId: Id<"wasteLoads">,
): Promise<Doc<"wasteLoads">> {
  const load = await ctx.db.get(loadId);
  assertSameOrg(auth, load);
  return load!;
}

async function requireStream(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  streamId: Id<"wasteStreams">,
): Promise<Doc<"wasteStreams">> {
  const stream = await ctx.db.get(streamId);
  assertSameOrg(auth, stream);
  return stream!;
}

async function requireParty(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  partyId: Id<"wasteParties">,
): Promise<Doc<"wasteParties">> {
  const party = await ctx.db.get(partyId);
  assertSameOrg(auth, party);
  return party!;
}

async function requireOrgAsset(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  assetId: Id<"assets">,
): Promise<Doc<"assets">> {
  const asset = await ctx.db.get(assetId);
  assertSameOrg(auth, asset);
  return asset!;
}

async function requireOrgMemberDoc(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  memberId: Id<"members">,
): Promise<Doc<"members">> {
  const member = await ctx.db.get(memberId);
  assertSameOrg(auth, member);
  return member!;
}

// --- Idempotency replay -----------------------------------------------------

async function checkReplay(
  ctx: MutationCtx,
  auth: AuthContext,
  clientMutationId: string | undefined,
): Promise<Id<"wasteLoads"> | null> {
  const replay = await getClientMutation(ctx, auth, clientMutationId);
  if (!replay) return null;
  if (replay.resultId) {
    const id = ctx.db.normalizeId("wasteLoads", replay.resultId);
    if (id) return id;
  }
  throw new ConvexError("This action was already recorded.");
}

// --- Custody transition core -------------------------------------------------

type GeoArgs = {
  geoLatitude?: number;
  geoLongitude?: number;
  geoAccuracy?: number;
};

type TransitionArgs = {
  load: Doc<"wasteLoads">;
  to: WasteLoadStatus;
  eventType: Doc<"wasteCustodyEvents">["type"];
  patch: Partial<Doc<"wasteLoads">>;
  fromPartyId?: Id<"wasteParties">;
  toPartyId?: Id<"wasteParties">;
  amount?: number;
  unit?: Doc<"wasteLoads">["pickupUnit"];
  manifestNumber?: string;
  signatureFileId?: Id<"uploadedFiles">;
  photoFileIds?: Id<"uploadedFiles">[];
  geo?: GeoArgs;
  notes?: string;
  performedByMemberId?: Id<"members">;
  clientMutationId?: string;
};

/**
 * Apply a lifecycle transition: validate it, recompute discrepancies, patch the
 * load, and append the custody event(s). The mutable load row is always
 * reconciled to the discrepancies derivable from its own fields, so the result
 * is deterministic and retry-safe.
 */
async function transitionLoad(
  ctx: MutationCtx,
  auth: AuthContext,
  args: TransitionArgs,
): Promise<Id<"wasteLoads">> {
  const { load, to } = args;
  if (load.status !== to && !canTransition(load.status, to)) {
    throw new ConvexError(
      `A ${load.status.replace(/_/g, " ")} load cannot move to ${to.replace(/_/g, " ")}.`,
    );
  }

  const config = await getWasteConfig(ctx, auth);
  const merged = { ...load, ...args.patch, status: to };
  const flags = detectDiscrepancies(merged, config);
  const flagsChanged =
    JSON.stringify(flags) !== JSON.stringify(load.discrepancyFlags);
  const now = Date.now();

  await ctx.db.patch(load._id, {
    ...args.patch,
    status: to,
    discrepancyFlags: flags,
    hasDiscrepancy: flags.length > 0,
    // A newly detected discrepancy clears any prior manual resolution.
    ...(flagsChanged && flags.length > 0
      ? {
          discrepancyResolvedAt: undefined,
          discrepancyResolvedBy: undefined,
          discrepancyResolutionNotes: undefined,
        }
      : {}),
    updatedAt: now,
  });

  await ctx.db.insert("wasteCustodyEvents", {
    orgId: auth.org._id,
    loadId: load._id,
    type: args.eventType,
    fromPartyId: args.fromPartyId,
    toPartyId: args.toPartyId,
    amount: args.amount,
    unit: args.unit,
    manifestNumber: args.manifestNumber,
    signatureFileId: args.signatureFileId,
    photoFileIds: args.photoFileIds,
    geoLatitude: args.geo?.geoLatitude,
    geoLongitude: args.geo?.geoLongitude,
    geoAccuracy: args.geo?.geoAccuracy,
    notes: args.notes,
    performedBy: auth.user._id,
    performedByMemberId: args.performedByMemberId,
    clientMutationId: args.clientMutationId,
    occurredAt: now,
  });

  // Record a distinct, immutable discrepancy event when flags newly appear.
  if (flagsChanged && flags.length > 0) {
    await ctx.db.insert("wasteCustodyEvents", {
      orgId: auth.org._id,
      loadId: load._id,
      type: "discrepancy_flagged",
      discrepancyFlags: flags,
      notes: flags.map((f) => f.replace(/_/g, " ")).join(", "),
      performedBy: auth.user._id,
      performedByMemberId: args.performedByMemberId,
      clientMutationId: args.clientMutationId,
      occurredAt: now,
    });
  }

  return load._id;
}

const geoArgs = {
  geoLatitude: v.optional(v.number()),
  geoLongitude: v.optional(v.number()),
  geoAccuracy: v.optional(v.number()),
};

function pickGeo(args: GeoArgs): GeoArgs {
  return {
    geoLatitude: args.geoLatitude,
    geoLongitude: args.geoLongitude,
    geoAccuracy: args.geoAccuracy,
  };
}

// --- Reference / dashboard queries ------------------------------------------

function partyName(party: Doc<"wasteParties"> | null): string | null {
  return party?.name ?? null;
}

function memberName(member: Doc<"members"> | null): string | null {
  return member ? `${member.firstName} ${member.lastName}`.trim() : null;
}

export const referenceData = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireWasteRead(ctx);
    const [streams, parties, assets, members] = await Promise.all([
      ctx.db
        .query("wasteStreams")
        .withIndex("by_org_and_active", (q) =>
          q.eq("orgId", auth.org._id).eq("active", true),
        )
        .collect(),
      ctx.db
        .query("wasteParties")
        .withIndex("by_org_and_active", (q) =>
          q.eq("orgId", auth.org._id).eq("active", true),
        )
        .collect(),
      ctx.db
        .query("assets")
        .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
        .collect(),
      ctx.db
        .query("members")
        .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
        .collect(),
    ]);

    const containers = assets
      .filter((a) => a.assetType === "bin" || a.assetType === "container")
      .map((a) => ({ id: a._id, name: a.name, assetType: a.assetType }));
    const vehicles = assets
      .filter((a) => a.assetType === "vehicle" || a.assetType === "trailer")
      .map((a) => ({ id: a._id, name: a.name, assetType: a.assetType }));

    return {
      streams: streams.map((s) => ({
        id: s._id,
        name: s.name,
        code: s.code ?? null,
        classification: s.classification,
        hazardous: s.hazardous,
        defaultUnit: s.defaultUnit,
      })),
      parties: parties.map((p) => ({
        id: p._id,
        name: p.name,
        consignor: p.consignor,
        transporter: p.transporter,
        receiver: p.receiver,
        licenceNumber: p.licenceNumber ?? null,
      })),
      containers,
      vehicles,
      drivers: members.map((m) => ({ id: m._id, name: memberName(m) })),
    };
  },
});

export const config = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireWasteRead(ctx);
    return await getWasteConfig(ctx, auth);
  },
});

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireWasteRead(ctx);
    const loads = await ctx.db
      .query("wasteLoads")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();

    const byStatus: Record<string, number> = {};
    for (const load of loads) {
      byStatus[load.status] = (byStatus[load.status] ?? 0) + 1;
    }
    const openDiscrepancies = loads.filter((l) => l.hasDiscrepancy).length;
    const active = loads.filter(
      (l) =>
        l.status !== "processed" &&
        l.status !== "redirected" &&
        l.status !== "cancelled",
    ).length;

    const [streams, parties] = await Promise.all([
      ctx.db
        .query("wasteStreams")
        .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
        .collect(),
      ctx.db
        .query("wasteParties")
        .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
        .collect(),
    ]);

    const recent = [...loads]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((l) => ({
        id: l._id,
        reference: l.reference,
        status: l.status,
        hasDiscrepancy: l.hasDiscrepancy,
        discrepancyFlags: l.discrepancyFlags,
        scheduledFor: l.scheduledFor ?? null,
      }));

    return {
      counts: {
        total: loads.length,
        active,
        openDiscrepancies,
        streams: streams.filter((s) => s.active).length,
        parties: parties.filter((p) => p.active).length,
      },
      byStatus,
      recent,
    };
  },
});

// --- Load list / detail -----------------------------------------------------

async function enrichLoads(
  ctx: QueryCtx,
  auth: AuthContext,
  loads: Doc<"wasteLoads">[],
) {
  const [streams, parties, members, assets] = await Promise.all([
    ctx.db
      .query("wasteStreams")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect(),
    ctx.db
      .query("wasteParties")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect(),
    ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect(),
    ctx.db
      .query("assets")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect(),
  ]);
  const streamMap = new Map(streams.map((s) => [s._id, s]));
  const partyMap = new Map(parties.map((p) => [p._id, p]));
  const memberMap = new Map(members.map((m) => [m._id, m]));
  const assetMap = new Map(assets.map((a) => [a._id, a]));

  return loads.map((l) => {
    const stream = streamMap.get(l.streamId) ?? null;
    return {
      id: l._id,
      reference: l.reference,
      status: l.status,
      streamName: stream?.name ?? null,
      classification: stream?.classification ?? null,
      hazardous: stream?.hazardous ?? false,
      consignor: partyName(partyMap.get(l.consignorPartyId) ?? null),
      transporter: l.transporterPartyId
        ? partyName(partyMap.get(l.transporterPartyId) ?? null)
        : null,
      plannedReceiver: partyName(
        partyMap.get(l.plannedReceiverPartyId) ?? null,
      ),
      actualReceiver: l.actualReceiverPartyId
        ? partyName(partyMap.get(l.actualReceiverPartyId) ?? null)
        : null,
      container: l.containerAssetId
        ? (assetMap.get(l.containerAssetId)?.name ?? null)
        : null,
      driver: l.driverMemberId
        ? memberName(memberMap.get(l.driverMemberId) ?? null)
        : null,
      scheduledFor: l.scheduledFor ?? null,
      manifestNumber: l.manifestNumber ?? null,
      pickupAmount: l.pickupAmount ?? null,
      pickupUnit: l.pickupUnit ?? null,
      arrivalAmount: l.arrivalAmount ?? null,
      arrivalUnit: l.arrivalUnit ?? null,
      hasDiscrepancy: l.hasDiscrepancy,
      discrepancyFlags: l.discrepancyFlags,
      rejectionReason: l.rejectionReason ?? null,
      createdAt: l.createdAt,
    };
  });
}

export const listLoads = query({
  args: {
    status: v.optional(v.string()),
    hasDiscrepancy: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteRead(ctx);
    let loads: Doc<"wasteLoads">[];
    if (args.status) {
      loads = await ctx.db
        .query("wasteLoads")
        .withIndex("by_org_and_status", (q) =>
          q
            .eq("orgId", auth.org._id)
            .eq("status", args.status as WasteLoadStatus),
        )
        .collect();
    } else if (args.hasDiscrepancy !== undefined) {
      loads = await ctx.db
        .query("wasteLoads")
        .withIndex("by_org_and_discrepancy", (q) =>
          q
            .eq("orgId", auth.org._id)
            .eq("hasDiscrepancy", args.hasDiscrepancy!),
        )
        .collect();
    } else {
      loads = await ctx.db
        .query("wasteLoads")
        .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
        .collect();
    }
    loads.sort((a, b) => b.createdAt - a.createdAt);
    return await enrichLoads(ctx, auth, loads);
  },
});

export const discrepancies = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireWasteRead(ctx);
    const loads = await ctx.db
      .query("wasteLoads")
      .withIndex("by_org_and_discrepancy", (q) =>
        q.eq("orgId", auth.org._id).eq("hasDiscrepancy", true),
      )
      .collect();
    loads.sort((a, b) => b.createdAt - a.createdAt);
    return await enrichLoads(ctx, auth, loads);
  },
});

export const getLoad = query({
  args: { loadId: v.id("wasteLoads") },
  handler: async (ctx, args) => {
    const auth = await requireWasteRead(ctx);
    const load = await requireLoad(ctx, auth, args.loadId);

    const [stream, events] = await Promise.all([
      ctx.db.get(load.streamId),
      ctx.db
        .query("wasteCustodyEvents")
        .withIndex("by_load", (q) => q.eq("loadId", load._id))
        .collect(),
    ]);
    events.sort((a, b) => a.occurredAt - b.occurredAt);

    const partyIds = new Set<Id<"wasteParties">>();
    [
      load.consignorPartyId,
      load.transporterPartyId,
      load.plannedReceiverPartyId,
      load.actualReceiverPartyId,
      load.redirectedToPartyId,
    ].forEach((id) => id && partyIds.add(id));
    events.forEach((e) => {
      if (e.fromPartyId) partyIds.add(e.fromPartyId);
      if (e.toPartyId) partyIds.add(e.toPartyId);
    });
    const partyDocs = await Promise.all(
      [...partyIds].map((id) => ctx.db.get(id)),
    );
    const partyMap = new Map(
      partyDocs.filter(Boolean).map((p) => [p!._id, p!]),
    );

    const userIds = [...new Set(events.map((e) => e.performedBy))];
    const userDocs = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(userDocs.filter(Boolean).map((u) => [u!._id, u!]));
    const userName = (u: Doc<"users"> | undefined | null) =>
      u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email : null;

    const driver = load.driverMemberId
      ? await ctx.db.get(load.driverMemberId)
      : null;
    const container = load.containerAssetId
      ? await ctx.db.get(load.containerAssetId)
      : null;
    const vehicle = load.vehicleAssetId
      ? await ctx.db.get(load.vehicleAssetId)
      : null;

    return {
      load: {
        ...load,
        streamName: stream?.name ?? null,
        classification: stream?.classification ?? null,
        hazardous: stream?.hazardous ?? false,
        consignor: partyName(partyMap.get(load.consignorPartyId) ?? null),
        transporter: load.transporterPartyId
          ? partyName(partyMap.get(load.transporterPartyId) ?? null)
          : null,
        plannedReceiver: partyName(
          partyMap.get(load.plannedReceiverPartyId) ?? null,
        ),
        actualReceiver: load.actualReceiverPartyId
          ? partyName(partyMap.get(load.actualReceiverPartyId) ?? null)
          : null,
        redirectedTo: load.redirectedToPartyId
          ? partyName(partyMap.get(load.redirectedToPartyId) ?? null)
          : null,
        driver: memberName(driver),
        container: container?.name ?? null,
        vehicle: vehicle?.name ?? null,
      },
      events: events.map((e) => ({
        id: e._id,
        type: e.type,
        from: e.fromPartyId
          ? partyName(partyMap.get(e.fromPartyId) ?? null)
          : null,
        to: e.toPartyId ? partyName(partyMap.get(e.toPartyId) ?? null) : null,
        amount: e.amount ?? null,
        unit: e.unit ?? null,
        manifestNumber: e.manifestNumber ?? null,
        discrepancyFlags: e.discrepancyFlags ?? null,
        notes: e.notes ?? null,
        performedBy: userName(userMap.get(e.performedBy)),
        hasSignature: Boolean(e.signatureFileId),
        photoCount: e.photoFileIds?.length ?? 0,
        geo:
          e.geoLatitude != null && e.geoLongitude != null
            ? {
                lat: e.geoLatitude,
                lng: e.geoLongitude,
                accuracy: e.geoAccuracy,
              }
            : null,
        occurredAt: e.occurredAt,
      })),
    };
  },
});

// --- Export -----------------------------------------------------------------

export const exportData = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireWasteExport(ctx);
    const loads = await ctx.db
      .query("wasteLoads")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    loads.sort((a, b) => b.createdAt - a.createdAt);
    const enriched = await enrichLoads(ctx, auth, loads);

    const loadRows = enriched.map((l) => ({
      reference: l.reference,
      status: l.status,
      stream: l.streamName ?? "",
      classification: l.classification ?? "",
      consignor: l.consignor ?? "",
      transporter: l.transporter ?? "",
      plannedReceiver: l.plannedReceiver ?? "",
      actualReceiver: l.actualReceiver ?? "",
      driver: l.driver ?? "",
      scheduledFor: l.scheduledFor ?? "",
      manifestNumber: l.manifestNumber ?? "",
      pickup:
        l.pickupAmount != null ? `${l.pickupAmount} ${l.pickupUnit ?? ""}` : "",
      arrival:
        l.arrivalAmount != null
          ? `${l.arrivalAmount} ${l.arrivalUnit ?? ""}`
          : "",
      discrepancies: l.discrepancyFlags.join("; "),
      rejectionReason: l.rejectionReason ?? "",
    }));

    const discrepancyRows = enriched
      .filter((l) => l.hasDiscrepancy)
      .flatMap((l) =>
        l.discrepancyFlags.map((flag) => ({
          reference: l.reference,
          status: l.status,
          discrepancy: flag,
          stream: l.streamName ?? "",
          consignor: l.consignor ?? "",
          plannedReceiver: l.plannedReceiver ?? "",
          actualReceiver: l.actualReceiver ?? "",
        })),
      );

    return { loads: loadRows, discrepancies: discrepancyRows };
  },
});

// --- Stream / party / config mutations --------------------------------------

export const upsertStream = mutation({
  args: {
    streamId: v.optional(v.id("wasteStreams")),
    name: v.string(),
    code: v.optional(v.string()),
    classification: wasteStreamClassificationValidator,
    hazardous: v.boolean(),
    defaultUnit: wasteUnitValidator,
    notes: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteManage(ctx);
    const now = Date.now();
    if (args.streamId) {
      const stream = await requireStream(ctx, auth, args.streamId);
      await ctx.db.patch(stream._id, {
        name: args.name,
        code: args.code,
        classification: args.classification,
        hazardous: args.hazardous,
        defaultUnit: args.defaultUnit,
        notes: args.notes,
        active: args.active ?? stream.active,
        updatedAt: now,
      });
      return stream._id;
    }
    return await ctx.db.insert("wasteStreams", {
      orgId: auth.org._id,
      name: args.name,
      code: args.code,
      classification: args.classification,
      hazardous: args.hazardous,
      defaultUnit: args.defaultUnit,
      notes: args.notes,
      active: args.active ?? true,
      createdBy: auth.user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertParty = mutation({
  args: {
    partyId: v.optional(v.id("wasteParties")),
    name: v.string(),
    consignor: v.boolean(),
    transporter: v.boolean(),
    receiver: v.boolean(),
    licenceNumber: v.optional(v.string()),
    contactName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteManage(ctx);
    if (!args.consignor && !args.transporter && !args.receiver) {
      throw new ConvexError("A party must have at least one role.");
    }
    const now = Date.now();
    if (args.partyId) {
      const party = await requireParty(ctx, auth, args.partyId);
      await ctx.db.patch(party._id, {
        name: args.name,
        consignor: args.consignor,
        transporter: args.transporter,
        receiver: args.receiver,
        licenceNumber: args.licenceNumber,
        contactName: args.contactName,
        phone: args.phone,
        email: args.email,
        address: args.address,
        notes: args.notes,
        active: args.active ?? party.active,
        updatedAt: now,
      });
      return party._id;
    }
    return await ctx.db.insert("wasteParties", {
      orgId: auth.org._id,
      name: args.name,
      consignor: args.consignor,
      transporter: args.transporter,
      receiver: args.receiver,
      licenceNumber: args.licenceNumber,
      contactName: args.contactName,
      phone: args.phone,
      email: args.email,
      address: args.address,
      notes: args.notes,
      active: args.active ?? true,
      createdBy: auth.user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateConfig = mutation({
  args: {
    quantityTolerancePct: v.optional(v.number()),
    lateGraceHours: v.optional(v.number()),
    region: v.optional(v.string()),
    complianceLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteManage(ctx);
    const existing = await ctx.db
      .query("organizationModules")
      .withIndex("by_org_key", (q) =>
        q.eq("orgId", auth.org._id).eq("key", "waste"),
      )
      .unique();
    const current = parseWasteConfig(existing?.configJson);
    const next: WasteConfig = {
      quantityTolerancePct:
        args.quantityTolerancePct ?? current.quantityTolerancePct,
      lateGraceHours: args.lateGraceHours ?? current.lateGraceHours,
      region: args.region ?? current.region,
      complianceLabel: args.complianceLabel ?? current.complianceLabel,
    };
    const configJson = JSON.stringify(next);
    if (existing) {
      await ctx.db.patch(existing._id, {
        configJson,
        enabled: true,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("organizationModules", {
        orgId: auth.org._id,
        key: "waste",
        enabled: true,
        version: "1",
        configJson,
        updatedAt: Date.now(),
      });
    }
    return next;
  },
});

// --- Load dispatch + lifecycle ----------------------------------------------

export const createLoad = mutation({
  args: {
    reference: v.string(),
    streamId: v.id("wasteStreams"),
    consignorPartyId: v.id("wasteParties"),
    plannedReceiverPartyId: v.id("wasteParties"),
    transporterPartyId: v.optional(v.id("wasteParties")),
    containerAssetId: v.optional(v.id("assets")),
    vehicleAssetId: v.optional(v.id("assets")),
    driverMemberId: v.optional(v.id("members")),
    scheduledFor: v.optional(v.string()),
    scheduledArrivalAt: v.optional(v.number()),
    manifestNumber: v.optional(v.string()),
    quantityTolerancePct: v.optional(v.number()),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteManage(ctx);
    const replay = await checkReplay(ctx, auth, args.clientMutationId);
    if (replay) return replay;

    await requireStream(ctx, auth, args.streamId);
    const consignor = await requireParty(ctx, auth, args.consignorPartyId);
    if (!consignor.consignor) {
      throw new ConvexError("Selected consignor is not marked as a consignor.");
    }
    const receiver = await requireParty(ctx, auth, args.plannedReceiverPartyId);
    if (!receiver.receiver) {
      throw new ConvexError("Selected receiver is not a receiving facility.");
    }
    if (args.transporterPartyId) {
      await requireParty(ctx, auth, args.transporterPartyId);
    }
    if (args.containerAssetId) {
      await requireOrgAsset(ctx, auth, args.containerAssetId);
    }
    if (args.vehicleAssetId) {
      await requireOrgAsset(ctx, auth, args.vehicleAssetId);
    }
    if (args.driverMemberId) {
      await requireOrgMemberDoc(ctx, auth, args.driverMemberId);
    }

    const now = Date.now();
    const loadId = await ctx.db.insert("wasteLoads", {
      orgId: auth.org._id,
      reference: args.reference,
      streamId: args.streamId,
      containerAssetId: args.containerAssetId,
      vehicleAssetId: args.vehicleAssetId,
      consignorPartyId: args.consignorPartyId,
      transporterPartyId: args.transporterPartyId,
      plannedReceiverPartyId: args.plannedReceiverPartyId,
      driverMemberId: args.driverMemberId,
      status: "scheduled",
      scheduledFor: args.scheduledFor,
      scheduledArrivalAt: args.scheduledArrivalAt,
      manifestNumber: args.manifestNumber,
      quantityTolerancePct: args.quantityTolerancePct,
      discrepancyFlags: [],
      hasDiscrepancy: false,
      notes: args.notes,
      createdBy: auth.user._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("wasteCustodyEvents", {
      orgId: auth.org._id,
      loadId,
      type: "scheduled",
      toPartyId: args.consignorPartyId,
      manifestNumber: args.manifestNumber,
      notes: args.notes,
      performedBy: auth.user._id,
      clientMutationId: args.clientMutationId,
      occurredAt: now,
    });

    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "waste:createLoad",
      loadId,
    );
    return loadId;
  },
});

export const updateLoad = mutation({
  args: {
    loadId: v.id("wasteLoads"),
    reference: v.optional(v.string()),
    transporterPartyId: v.optional(v.id("wasteParties")),
    containerAssetId: v.optional(v.id("assets")),
    vehicleAssetId: v.optional(v.id("assets")),
    driverMemberId: v.optional(v.id("members")),
    scheduledFor: v.optional(v.string()),
    scheduledArrivalAt: v.optional(v.number()),
    manifestNumber: v.optional(v.string()),
    quantityTolerancePct: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteManage(ctx);
    const load = await requireLoad(ctx, auth, args.loadId);
    if (load.status === "processed" || load.status === "cancelled") {
      throw new ConvexError("This load is closed and cannot be edited.");
    }
    if (args.transporterPartyId) {
      await requireParty(ctx, auth, args.transporterPartyId);
    }
    if (args.containerAssetId) {
      await requireOrgAsset(ctx, auth, args.containerAssetId);
    }
    if (args.vehicleAssetId) {
      await requireOrgAsset(ctx, auth, args.vehicleAssetId);
    }
    if (args.driverMemberId) {
      await requireOrgMemberDoc(ctx, auth, args.driverMemberId);
    }

    const patch: Partial<Doc<"wasteLoads">> = { updatedAt: Date.now() };
    if (args.reference !== undefined) patch.reference = args.reference;
    if (args.transporterPartyId !== undefined)
      patch.transporterPartyId = args.transporterPartyId;
    if (args.containerAssetId !== undefined)
      patch.containerAssetId = args.containerAssetId;
    if (args.vehicleAssetId !== undefined)
      patch.vehicleAssetId = args.vehicleAssetId;
    if (args.driverMemberId !== undefined)
      patch.driverMemberId = args.driverMemberId;
    if (args.scheduledFor !== undefined) patch.scheduledFor = args.scheduledFor;
    if (args.scheduledArrivalAt !== undefined)
      patch.scheduledArrivalAt = args.scheduledArrivalAt;
    if (args.manifestNumber !== undefined)
      patch.manifestNumber = args.manifestNumber;
    if (args.quantityTolerancePct !== undefined)
      patch.quantityTolerancePct = args.quantityTolerancePct;
    if (args.notes !== undefined) patch.notes = args.notes;

    // Recompute discrepancies in case the manifest number / tolerance changed.
    const config = await getWasteConfig(ctx, auth);
    const merged = { ...load, ...patch };
    const flags = detectDiscrepancies(merged, config);
    await ctx.db.patch(load._id, {
      ...patch,
      discrepancyFlags: flags,
      hasDiscrepancy: flags.length > 0,
    });
    return load._id;
  },
});

export const recordPickup = mutation({
  args: {
    loadId: v.id("wasteLoads"),
    pickupAmount: v.optional(v.number()),
    pickupUnit: v.optional(wasteUnitValidator),
    manifestNumber: v.optional(v.string()),
    signatureFileId: v.optional(v.id("uploadedFiles")),
    photoFileIds: v.optional(v.array(v.id("uploadedFiles"))),
    notes: v.optional(v.string()),
    performedByMemberId: v.optional(v.id("members")),
    ...geoArgs,
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteOperate(ctx);
    const replay = await checkReplay(ctx, auth, args.clientMutationId);
    if (replay) return replay;
    const load = await requireLoad(ctx, auth, args.loadId);

    const patch: Partial<Doc<"wasteLoads">> = {
      pickupAmount: args.pickupAmount,
      pickupUnit: args.pickupUnit,
      pickupAt: Date.now(),
    };
    if (args.manifestNumber !== undefined)
      patch.manifestNumber = args.manifestNumber;

    const id = await transitionLoad(ctx, auth, {
      load,
      to: "picked_up",
      eventType: "picked_up",
      patch,
      fromPartyId: load.consignorPartyId,
      toPartyId: load.transporterPartyId,
      amount: args.pickupAmount,
      unit: args.pickupUnit,
      manifestNumber: args.manifestNumber,
      signatureFileId: args.signatureFileId,
      photoFileIds: args.photoFileIds,
      geo: pickGeo(args),
      notes: args.notes,
      performedByMemberId: args.performedByMemberId,
      clientMutationId: args.clientMutationId,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "waste:recordPickup",
      id,
    );
    return id;
  },
});

export const recordTransit = mutation({
  args: {
    loadId: v.id("wasteLoads"),
    notes: v.optional(v.string()),
    performedByMemberId: v.optional(v.id("members")),
    ...geoArgs,
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteOperate(ctx);
    const replay = await checkReplay(ctx, auth, args.clientMutationId);
    if (replay) return replay;
    const load = await requireLoad(ctx, auth, args.loadId);
    const id = await transitionLoad(ctx, auth, {
      load,
      to: "in_transit",
      eventType: "in_transit",
      patch: {},
      geo: pickGeo(args),
      notes: args.notes,
      performedByMemberId: args.performedByMemberId,
      clientMutationId: args.clientMutationId,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "waste:recordTransit",
      id,
    );
    return id;
  },
});

export const recordArrival = mutation({
  args: {
    loadId: v.id("wasteLoads"),
    arrivalAmount: v.optional(v.number()),
    arrivalUnit: v.optional(wasteUnitValidator),
    actualReceiverPartyId: v.optional(v.id("wasteParties")),
    manifestNumber: v.optional(v.string()),
    signatureFileId: v.optional(v.id("uploadedFiles")),
    photoFileIds: v.optional(v.array(v.id("uploadedFiles"))),
    notes: v.optional(v.string()),
    performedByMemberId: v.optional(v.id("members")),
    ...geoArgs,
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteOperate(ctx);
    const replay = await checkReplay(ctx, auth, args.clientMutationId);
    if (replay) return replay;
    const load = await requireLoad(ctx, auth, args.loadId);
    if (args.actualReceiverPartyId) {
      await requireParty(ctx, auth, args.actualReceiverPartyId);
    }
    const actualReceiverPartyId =
      args.actualReceiverPartyId ?? load.plannedReceiverPartyId;

    const patch: Partial<Doc<"wasteLoads">> = {
      arrivalAmount: args.arrivalAmount,
      arrivalUnit: args.arrivalUnit,
      arrivedAt: Date.now(),
      actualReceiverPartyId,
    };
    if (args.manifestNumber !== undefined)
      patch.manifestNumber = args.manifestNumber;

    const id = await transitionLoad(ctx, auth, {
      load,
      to: "arrived",
      eventType: "arrived",
      patch,
      fromPartyId: load.transporterPartyId,
      toPartyId: actualReceiverPartyId,
      amount: args.arrivalAmount,
      unit: args.arrivalUnit,
      manifestNumber: args.manifestNumber,
      signatureFileId: args.signatureFileId,
      photoFileIds: args.photoFileIds,
      geo: pickGeo(args),
      notes: args.notes,
      performedByMemberId: args.performedByMemberId,
      clientMutationId: args.clientMutationId,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "waste:recordArrival",
      id,
    );
    return id;
  },
});

export const acceptLoad = mutation({
  args: {
    loadId: v.id("wasteLoads"),
    notes: v.optional(v.string()),
    signatureFileId: v.optional(v.id("uploadedFiles")),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteManage(ctx);
    const replay = await checkReplay(ctx, auth, args.clientMutationId);
    if (replay) return replay;
    const load = await requireLoad(ctx, auth, args.loadId);
    const id = await transitionLoad(ctx, auth, {
      load,
      to: "accepted",
      eventType: "accepted",
      patch: {},
      toPartyId: load.actualReceiverPartyId ?? load.plannedReceiverPartyId,
      signatureFileId: args.signatureFileId,
      notes: args.notes,
      clientMutationId: args.clientMutationId,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "waste:acceptLoad",
      id,
    );
    return id;
  },
});

export const processLoad = mutation({
  args: {
    loadId: v.id("wasteLoads"),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteManage(ctx);
    const replay = await checkReplay(ctx, auth, args.clientMutationId);
    if (replay) return replay;
    const load = await requireLoad(ctx, auth, args.loadId);
    const id = await transitionLoad(ctx, auth, {
      load,
      to: "processed",
      eventType: "processed",
      patch: {},
      notes: args.notes,
      clientMutationId: args.clientMutationId,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "waste:processLoad",
      id,
    );
    return id;
  },
});

export const rejectLoad = mutation({
  args: {
    loadId: v.id("wasteLoads"),
    reason: v.string(),
    notes: v.optional(v.string()),
    signatureFileId: v.optional(v.id("uploadedFiles")),
    photoFileIds: v.optional(v.array(v.id("uploadedFiles"))),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteManage(ctx);
    const replay = await checkReplay(ctx, auth, args.clientMutationId);
    if (replay) return replay;
    const load = await requireLoad(ctx, auth, args.loadId);
    const id = await transitionLoad(ctx, auth, {
      load,
      to: "rejected",
      eventType: "rejected",
      patch: { rejectionReason: args.reason },
      signatureFileId: args.signatureFileId,
      photoFileIds: args.photoFileIds,
      notes: args.notes ?? args.reason,
      clientMutationId: args.clientMutationId,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "waste:rejectLoad",
      id,
    );
    return id;
  },
});

export const redirectLoad = mutation({
  args: {
    loadId: v.id("wasteLoads"),
    redirectedToPartyId: v.id("wasteParties"),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteManage(ctx);
    const replay = await checkReplay(ctx, auth, args.clientMutationId);
    if (replay) return replay;
    const load = await requireLoad(ctx, auth, args.loadId);
    const target = await requireParty(ctx, auth, args.redirectedToPartyId);
    if (!target.receiver) {
      throw new ConvexError("Redirect target is not a receiving facility.");
    }
    const id = await transitionLoad(ctx, auth, {
      load,
      to: "redirected",
      eventType: "redirected",
      patch: { redirectedToPartyId: args.redirectedToPartyId },
      toPartyId: args.redirectedToPartyId,
      notes: args.notes,
      clientMutationId: args.clientMutationId,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "waste:redirectLoad",
      id,
    );
    return id;
  },
});

export const cancelLoad = mutation({
  args: {
    loadId: v.id("wasteLoads"),
    reason: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteManage(ctx);
    const replay = await checkReplay(ctx, auth, args.clientMutationId);
    if (replay) return replay;
    const load = await requireLoad(ctx, auth, args.loadId);
    const id = await transitionLoad(ctx, auth, {
      load,
      to: "cancelled",
      eventType: "cancelled",
      patch: {},
      notes: args.reason,
      clientMutationId: args.clientMutationId,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "waste:cancelLoad",
      id,
    );
    return id;
  },
});

export const addCustodyNote = mutation({
  args: {
    loadId: v.id("wasteLoads"),
    notes: v.string(),
    photoFileIds: v.optional(v.array(v.id("uploadedFiles"))),
    performedByMemberId: v.optional(v.id("members")),
    ...geoArgs,
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteOperate(ctx);
    const replay = await checkReplay(ctx, auth, args.clientMutationId);
    if (replay) return replay;
    const load = await requireLoad(ctx, auth, args.loadId);
    const now = Date.now();
    await ctx.db.insert("wasteCustodyEvents", {
      orgId: auth.org._id,
      loadId: load._id,
      type: "note",
      notes: args.notes,
      photoFileIds: args.photoFileIds,
      geoLatitude: args.geoLatitude,
      geoLongitude: args.geoLongitude,
      geoAccuracy: args.geoAccuracy,
      performedBy: auth.user._id,
      performedByMemberId: args.performedByMemberId,
      clientMutationId: args.clientMutationId,
      occurredAt: now,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "waste:addCustodyNote",
      load._id,
    );
    return load._id;
  },
});

export const resolveDiscrepancy = mutation({
  args: {
    loadId: v.id("wasteLoads"),
    resolutionNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await requireWasteManage(ctx);
    const load = await requireLoad(ctx, auth, args.loadId);
    if (!load.hasDiscrepancy) {
      throw new ConvexError("This load has no open discrepancy.");
    }
    const now = Date.now();
    await ctx.db.patch(load._id, {
      hasDiscrepancy: false,
      discrepancyResolvedAt: now,
      discrepancyResolvedBy: auth.user._id,
      discrepancyResolutionNotes: args.resolutionNotes,
      updatedAt: now,
    });
    await ctx.db.insert("wasteCustodyEvents", {
      orgId: auth.org._id,
      loadId: load._id,
      type: "discrepancy_resolved",
      discrepancyFlags: load.discrepancyFlags,
      notes: args.resolutionNotes,
      performedBy: auth.user._id,
      occurredAt: now,
    });
    return load._id;
  },
});
