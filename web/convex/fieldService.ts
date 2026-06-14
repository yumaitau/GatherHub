import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { v, ConvexError, Infer } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrgMember, assertSameOrg, type AuthContext } from "./lib/auth";
import { getClientMutation, recordClientMutation } from "./lib/idempotency";
import { hasCapability, requireCapability } from "./lib/capabilities";
import { requireModule } from "./lib/orgConfig";
import {
  jobAuditActionValidator,
  jobPriorityValidator,
  jobStatusValidator,
} from "./schema";

/**
 * Field-service operations (GX-10): customers, sites, routes, and jobs, with an
 * immutable proof-of-service / audit log and idempotent mutations safe to retry
 * from the offline mobile queue.
 *
 * Authorisation:
 * - Read surfaces require `jobs.dispatch` (dispatchers) or `jobs.complete`
 *   (crew/drivers).
 * - Dispatch/admin writes (customers, sites, jobs, routes, assignment,
 *   corrections) require `jobs.dispatch`.
 * - Field actions (start, complete, exception) require `jobs.complete`.
 *
 * Immutability: once a job is completed or marked exception, its proof can only
 * change through `correctJobCompletion` (appends a "corrected" audit row) or
 * `reopenJob` — both audited. The fieldJobAuditLog table is append-only.
 */

type JobStatus = Infer<typeof jobStatusValidator>;
type JobAuditAction = Infer<typeof jobAuditActionValidator>;

const proofValidator = {
  signatureName: v.optional(v.string()),
  photoStorageIds: v.optional(v.array(v.string())),
  scanRef: v.optional(v.string()),
  notes: v.optional(v.string()),
  geoLatitude: v.optional(v.number()),
  geoLongitude: v.optional(v.number()),
  geoAccuracy: v.optional(v.number()),
};

type ProofArgs = {
  signatureName?: string;
  photoStorageIds?: string[];
  scanRef?: string;
  notes?: string;
  geoLatitude?: number;
  geoLongitude?: number;
  geoAccuracy?: number;
};

const DEFAULT_FIELD_CONFIG = {
  jobTypes: ["Delivery", "Pickup", "Service", "Inspection"],
  exceptionReasons: [
    "Customer not available",
    "Access blocked",
    "Unsafe conditions",
    "Wrong address",
    "Refused on arrival",
  ],
  requirePhoto: false,
  requireSignature: false,
  requireScan: false,
};

// --- gates ----------------------------------------------------------------

/** Module on + caller can see field-service surfaces (dispatch or complete). */
async function requireFieldRead(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
) {
  await requireModule(ctx, auth, "field_service");
  if (
    (await hasCapability(ctx, auth, "jobs.dispatch")) ||
    (await hasCapability(ctx, auth, "jobs.complete"))
  ) {
    return;
  }
  throw new ConvexError({
    code: "forbidden",
    message: "You do not have access to field service.",
  });
}

async function requireDispatch(ctx: MutationCtx, auth: AuthContext) {
  await requireModule(ctx, auth, "field_service");
  await requireCapability(ctx, auth, "jobs.dispatch");
}

async function requireFieldWork(ctx: MutationCtx, auth: AuthContext) {
  await requireModule(ctx, auth, "field_service");
  await requireCapability(ctx, auth, "jobs.complete");
}

// --- audit log ------------------------------------------------------------

/**
 * Append an immutable audit/proof row and stamp the job's `lastEventAt`. The
 * caller is responsible for any status patch on the job itself.
 */
async function writeJobAudit(
  ctx: MutationCtx,
  auth: AuthContext,
  params: {
    jobId: Id<"fieldJobs">;
    action: JobAuditAction;
    fromStatus?: JobStatus;
    toStatus?: JobStatus;
    exceptionReason?: string;
    proof?: ProofArgs;
    correctsEventId?: Id<"fieldJobAuditLog">;
  },
): Promise<Id<"fieldJobAuditLog">> {
  const now = Date.now();
  const proof = params.proof ?? {};
  const id = await ctx.db.insert("fieldJobAuditLog", {
    orgId: auth.org._id,
    jobId: params.jobId,
    action: params.action,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    notes: proof.notes,
    signatureName: proof.signatureName,
    photoStorageIds: proof.photoStorageIds,
    scanRef: proof.scanRef,
    exceptionReason: params.exceptionReason,
    geoLatitude: proof.geoLatitude,
    geoLongitude: proof.geoLongitude,
    geoAccuracy: proof.geoAccuracy,
    correctsEventId: params.correctsEventId,
    performedBy: auth.user._id,
    performedAt: now,
  });
  await ctx.db.patch(params.jobId, { lastEventAt: now });
  return id;
}

// --- enrichment -----------------------------------------------------------

function userName(user: Doc<"users"> | null): string | null {
  if (!user) return null;
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return name || (user.email ?? null);
}

async function enrichJob(ctx: QueryCtx, job: Doc<"fieldJobs">) {
  const [customer, site, route, assignee] = await Promise.all([
    job.customerId ? ctx.db.get(job.customerId) : Promise.resolve(null),
    job.siteId ? ctx.db.get(job.siteId) : Promise.resolve(null),
    job.routeId ? ctx.db.get(job.routeId) : Promise.resolve(null),
    job.assignedUserId ? ctx.db.get(job.assignedUserId) : Promise.resolve(null),
  ]);
  return {
    _id: job._id,
    _creationTime: job._creationTime,
    title: job.title,
    jobType: job.jobType ?? null,
    priority: job.priority,
    status: job.status,
    instructions: job.instructions ?? null,
    windowStart: job.windowStart ?? null,
    windowEnd: job.windowEnd ?? null,
    slaAt: job.slaAt ?? null,
    routeId: job.routeId ?? null,
    routeName: route?.name ?? null,
    routeOrder: job.routeOrder ?? null,
    customerId: job.customerId ?? null,
    customerName: customer?.name ?? null,
    siteId: job.siteId ?? null,
    siteName: site?.name ?? null,
    siteAddress: site?.address ?? null,
    assignedUserId: job.assignedUserId ?? null,
    assigneeName: userName(assignee),
    exceptionReason: job.exceptionReason ?? null,
    completedAt: job.completedAt ?? null,
    lastEventAt: job.lastEventAt ?? null,
  };
}

// --- config ---------------------------------------------------------------

export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    await requireFieldRead(ctx, auth);
    const row = await ctx.db
      .query("fieldServiceConfig")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .unique();
    return {
      jobTypes: row?.jobTypes ?? DEFAULT_FIELD_CONFIG.jobTypes,
      exceptionReasons:
        row?.exceptionReasons ?? DEFAULT_FIELD_CONFIG.exceptionReasons,
      requirePhoto: row?.requirePhoto ?? DEFAULT_FIELD_CONFIG.requirePhoto,
      requireSignature:
        row?.requireSignature ?? DEFAULT_FIELD_CONFIG.requireSignature,
      requireScan: row?.requireScan ?? DEFAULT_FIELD_CONFIG.requireScan,
    };
  },
});

export const updateConfig = mutation({
  args: {
    jobTypes: v.optional(v.array(v.string())),
    exceptionReasons: v.optional(v.array(v.string())),
    requirePhoto: v.optional(v.boolean()),
    requireSignature: v.optional(v.boolean()),
    requireScan: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireModule(ctx, auth, "field_service");
    await requireCapability(ctx, auth, "settings.admin");
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const existing = await ctx.db
      .query("fieldServiceConfig")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .unique();
    const next = {
      jobTypes:
        args.jobTypes ?? existing?.jobTypes ?? DEFAULT_FIELD_CONFIG.jobTypes,
      exceptionReasons:
        args.exceptionReasons ??
        existing?.exceptionReasons ??
        DEFAULT_FIELD_CONFIG.exceptionReasons,
      requirePhoto: args.requirePhoto ?? existing?.requirePhoto ?? false,
      requireSignature:
        args.requireSignature ?? existing?.requireSignature ?? false,
      requireScan: args.requireScan ?? existing?.requireScan ?? false,
      updatedAt: Date.now(),
      updatedBy: auth.user._id,
    };
    if (existing) {
      await ctx.db.patch(existing._id, next);
    } else {
      await ctx.db.insert("fieldServiceConfig", {
        orgId: auth.org._id,
        ...next,
      });
    }
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:updateConfig",
    );
  },
});

// --- customers ------------------------------------------------------------

export const listCustomers = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireFieldRead(ctx, auth);
    const rows = await ctx.db
      .query("fieldCustomers")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    return rows
      .filter((c) => args.includeInactive || c.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const createCustomer = mutation({
  args: {
    name: v.string(),
    contactName: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireDispatch(ctx, auth);
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const id = ctx.db.normalizeId("fieldCustomers", replay.resultId);
      if (!id) throw new Error("Invalid customer idempotency result.");
      return id;
    }
    if (replay) throw new Error("Missing customer idempotency result.");
    const name = args.name.trim();
    if (!name) throw new ConvexError("Customer name is required.");
    const id = await ctx.db.insert("fieldCustomers", {
      orgId: auth.org._id,
      name,
      contactName: args.contactName?.trim() || undefined,
      contactPhone: args.contactPhone?.trim() || undefined,
      contactEmail: args.contactEmail?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      isActive: true,
      createdBy: auth.user._id,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:createCustomer",
      String(id),
    );
    return id;
  },
});

export const updateCustomer = mutation({
  args: {
    customerId: v.id("fieldCustomers"),
    name: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireDispatch(ctx, auth);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const customer = await ctx.db.get(args.customerId);
    assertSameOrg(auth, customer);
    if (!customer) return;
    if (args.name !== undefined && !args.name.trim()) {
      throw new ConvexError("Customer name is required.");
    }
    await ctx.db.patch(args.customerId, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.contactName !== undefined
        ? { contactName: args.contactName.trim() || undefined }
        : {}),
      ...(args.contactPhone !== undefined
        ? { contactPhone: args.contactPhone.trim() || undefined }
        : {}),
      ...(args.contactEmail !== undefined
        ? { contactEmail: args.contactEmail.trim() || undefined }
        : {}),
      ...(args.notes !== undefined
        ? { notes: args.notes.trim() || undefined }
        : {}),
      ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:updateCustomer",
    );
  },
});

// --- sites ----------------------------------------------------------------

export const listSites = query({
  args: {
    customerId: v.optional(v.id("fieldCustomers")),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireFieldRead(ctx, auth);
    let rows = await ctx.db
      .query("fieldSites")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    if (args.customerId !== undefined) {
      rows = rows.filter((s) => s.customerId === args.customerId);
    }
    return rows
      .filter((s) => args.includeInactive || s.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const createSite = mutation({
  args: {
    name: v.string(),
    customerId: v.optional(v.id("fieldCustomers")),
    address: v.optional(v.string()),
    geoLatitude: v.optional(v.number()),
    geoLongitude: v.optional(v.number()),
    accessNotes: v.optional(v.string()),
    riskNotes: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireDispatch(ctx, auth);
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const id = ctx.db.normalizeId("fieldSites", replay.resultId);
      if (!id) throw new Error("Invalid site idempotency result.");
      return id;
    }
    if (replay) throw new Error("Missing site idempotency result.");
    const name = args.name.trim();
    if (!name) throw new ConvexError("Site name is required.");
    if (args.customerId) {
      const customer = await ctx.db.get(args.customerId);
      assertSameOrg(auth, customer);
    }
    const id = await ctx.db.insert("fieldSites", {
      orgId: auth.org._id,
      customerId: args.customerId,
      name,
      address: args.address?.trim() || undefined,
      geoLatitude: args.geoLatitude,
      geoLongitude: args.geoLongitude,
      accessNotes: args.accessNotes?.trim() || undefined,
      riskNotes: args.riskNotes?.trim() || undefined,
      contactName: args.contactName?.trim() || undefined,
      contactPhone: args.contactPhone?.trim() || undefined,
      isActive: true,
      createdBy: auth.user._id,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:createSite",
      String(id),
    );
    return id;
  },
});

/** Org members with a linked user account — assignable as a route's driver. */
export const assignableUsers = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    await requireFieldRead(ctx, auth);
    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    const seen = new Set<string>();
    const out: { userId: Id<"users">; name: string }[] = [];
    for (const member of members) {
      if (!member.userId || seen.has(String(member.userId))) continue;
      seen.add(String(member.userId));
      const user = await ctx.db.get(member.userId);
      out.push({
        userId: member.userId,
        name:
          (userName(user) ?? `${member.firstName} ${member.lastName}`.trim()) ||
          "Member",
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// --- jobs -----------------------------------------------------------------

/** Dispatch board: jobs for the org, optionally filtered by status or route. */
export const dispatchBoard = query({
  args: {
    status: v.optional(jobStatusValidator),
    routeId: v.optional(v.id("fieldRoutes")),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireFieldRead(ctx, auth);
    let rows = await ctx.db
      .query("fieldJobs")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    if (args.status !== undefined) {
      rows = rows.filter((j) => j.status === args.status);
    }
    if (args.routeId !== undefined) {
      rows = rows.filter((j) => j.routeId === args.routeId);
    }
    rows.sort((a, b) => b._creationTime - a._creationTime);
    return await Promise.all(rows.map((job) => enrichJob(ctx, job)));
  },
});

export const getJob = query({
  args: { jobId: v.id("fieldJobs") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireFieldRead(ctx, auth);
    const job = await ctx.db.get(args.jobId);
    assertSameOrg(auth, job);
    if (!job) return null;
    const events = await ctx.db
      .query("fieldJobAuditLog")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    events.sort((a, b) => a.performedAt - b.performedAt);
    const history = await Promise.all(
      events.map(async (e) => ({
        _id: e._id,
        action: e.action,
        fromStatus: e.fromStatus ?? null,
        toStatus: e.toStatus ?? null,
        notes: e.notes ?? null,
        signatureName: e.signatureName ?? null,
        photoStorageIds: e.photoStorageIds ?? [],
        scanRef: e.scanRef ?? null,
        exceptionReason: e.exceptionReason ?? null,
        geoLatitude: e.geoLatitude ?? null,
        geoLongitude: e.geoLongitude ?? null,
        correctsEventId: e.correctsEventId ?? null,
        performedAt: e.performedAt,
        performedByName: userName(await ctx.db.get(e.performedBy)),
      })),
    );
    return { ...(await enrichJob(ctx, job)), history };
  },
});

export const createJob = mutation({
  args: {
    title: v.string(),
    customerId: v.optional(v.id("fieldCustomers")),
    siteId: v.optional(v.id("fieldSites")),
    jobType: v.optional(v.string()),
    priority: v.optional(jobPriorityValidator),
    instructions: v.optional(v.string()),
    windowStart: v.optional(v.number()),
    windowEnd: v.optional(v.number()),
    slaAt: v.optional(v.number()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireDispatch(ctx, auth);
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const id = ctx.db.normalizeId("fieldJobs", replay.resultId);
      if (!id) throw new Error("Invalid job idempotency result.");
      return id;
    }
    if (replay) throw new Error("Missing job idempotency result.");
    const title = args.title.trim();
    if (!title) throw new ConvexError("Job title is required.");
    if (args.customerId) {
      assertSameOrg(auth, await ctx.db.get(args.customerId));
    }
    if (args.siteId) {
      assertSameOrg(auth, await ctx.db.get(args.siteId));
    }
    const jobId = await ctx.db.insert("fieldJobs", {
      orgId: auth.org._id,
      customerId: args.customerId,
      siteId: args.siteId,
      title,
      jobType: args.jobType?.trim() || undefined,
      priority: args.priority ?? "normal",
      status: "open",
      instructions: args.instructions?.trim() || undefined,
      windowStart: args.windowStart,
      windowEnd: args.windowEnd,
      slaAt: args.slaAt,
      createdBy: auth.user._id,
    });
    await writeJobAudit(ctx, auth, {
      jobId,
      action: "created",
      toStatus: "open",
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:createJob",
      String(jobId),
    );
    return jobId;
  },
});

export const updateJob = mutation({
  args: {
    jobId: v.id("fieldJobs"),
    title: v.optional(v.string()),
    customerId: v.optional(v.union(v.id("fieldCustomers"), v.null())),
    siteId: v.optional(v.union(v.id("fieldSites"), v.null())),
    jobType: v.optional(v.string()),
    priority: v.optional(jobPriorityValidator),
    instructions: v.optional(v.string()),
    windowStart: v.optional(v.union(v.number(), v.null())),
    windowEnd: v.optional(v.union(v.number(), v.null())),
    slaAt: v.optional(v.union(v.number(), v.null())),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireDispatch(ctx, auth);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const job = await ctx.db.get(args.jobId);
    assertSameOrg(auth, job);
    if (!job) return;
    if (job.status === "completed") {
      throw new ConvexError({
        code: "forbidden",
        message: "Completed jobs are read-only; reopen to edit.",
      });
    }
    if (args.title !== undefined && !args.title.trim()) {
      throw new ConvexError("Job title is required.");
    }
    if (args.customerId) {
      assertSameOrg(auth, await ctx.db.get(args.customerId));
    }
    if (args.siteId) {
      assertSameOrg(auth, await ctx.db.get(args.siteId));
    }
    await ctx.db.patch(args.jobId, {
      ...(args.title !== undefined ? { title: args.title.trim() } : {}),
      ...(args.customerId !== undefined
        ? { customerId: args.customerId ?? undefined }
        : {}),
      ...(args.siteId !== undefined
        ? { siteId: args.siteId ?? undefined }
        : {}),
      ...(args.jobType !== undefined
        ? { jobType: args.jobType.trim() || undefined }
        : {}),
      ...(args.priority !== undefined ? { priority: args.priority } : {}),
      ...(args.instructions !== undefined
        ? { instructions: args.instructions.trim() || undefined }
        : {}),
      ...(args.windowStart !== undefined
        ? { windowStart: args.windowStart ?? undefined }
        : {}),
      ...(args.windowEnd !== undefined
        ? { windowEnd: args.windowEnd ?? undefined }
        : {}),
      ...(args.slaAt !== undefined ? { slaAt: args.slaAt ?? undefined } : {}),
    });
    await writeJobAudit(ctx, auth, { jobId: args.jobId, action: "updated" });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:updateJob",
    );
  },
});

// --- routes ---------------------------------------------------------------

export const listRoutes = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireFieldRead(ctx, auth);
    let rows = await ctx.db
      .query("fieldRoutes")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .collect();
    if (args.date !== undefined) {
      rows = rows.filter((r) => r.date === args.date);
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return await Promise.all(
      rows.map(async (route) => {
        const jobs = await ctx.db
          .query("fieldJobs")
          .withIndex("by_route", (q) => q.eq("routeId", route._id))
          .collect();
        const assignee = route.assignedUserId
          ? await ctx.db.get(route.assignedUserId)
          : null;
        return {
          _id: route._id,
          name: route.name,
          date: route.date,
          status: route.status,
          notes: route.notes ?? null,
          assignedUserId: route.assignedUserId ?? null,
          assigneeName: userName(assignee),
          stopCount: jobs.length,
          completedCount: jobs.filter((j) => j.status === "completed").length,
        };
      }),
    );
  },
});

export const getRoute = query({
  args: { routeId: v.id("fieldRoutes") },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireFieldRead(ctx, auth);
    const route = await ctx.db.get(args.routeId);
    assertSameOrg(auth, route);
    if (!route) return null;
    const jobs = await ctx.db
      .query("fieldJobs")
      .withIndex("by_route", (q) => q.eq("routeId", route._id))
      .collect();
    jobs.sort((a, b) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0));
    const assignee = route.assignedUserId
      ? await ctx.db.get(route.assignedUserId)
      : null;
    return {
      _id: route._id,
      name: route.name,
      date: route.date,
      status: route.status,
      notes: route.notes ?? null,
      assignedUserId: route.assignedUserId ?? null,
      assigneeName: userName(assignee),
      stops: await Promise.all(jobs.map((job) => enrichJob(ctx, job))),
    };
  },
});

export const createRoute = mutation({
  args: {
    name: v.string(),
    date: v.string(),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireDispatch(ctx, auth);
    const replay = await getClientMutation(ctx, auth, args.clientMutationId);
    if (replay?.resultId) {
      const id = ctx.db.normalizeId("fieldRoutes", replay.resultId);
      if (!id) throw new Error("Invalid route idempotency result.");
      return id;
    }
    if (replay) throw new Error("Missing route idempotency result.");
    const name = args.name.trim();
    if (!name) throw new ConvexError("Route name is required.");
    if (!args.date.trim()) throw new ConvexError("Route date is required.");
    const id = await ctx.db.insert("fieldRoutes", {
      orgId: auth.org._id,
      name,
      date: args.date,
      status: "planned",
      notes: args.notes?.trim() || undefined,
      createdBy: auth.user._id,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:createRoute",
      String(id),
    );
    return id;
  },
});

/** Set the ordered stop list for a route, syncing each job's route + order. */
export const setRouteJobs = mutation({
  args: {
    routeId: v.id("fieldRoutes"),
    jobIds: v.array(v.id("fieldJobs")),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireDispatch(ctx, auth);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const route = await ctx.db.get(args.routeId);
    assertSameOrg(auth, route);
    if (!route) return;

    // Validate every job belongs to this org.
    const jobs = await Promise.all(args.jobIds.map((id) => ctx.db.get(id)));
    jobs.forEach((job) => assertSameOrg(auth, job));
    const nextIds = new Set(args.jobIds.map(String));

    // Detach jobs that were on the route but are no longer in the list.
    const current = await ctx.db
      .query("fieldJobs")
      .withIndex("by_route", (q) => q.eq("routeId", route._id))
      .collect();
    for (const job of current) {
      if (!nextIds.has(String(job._id))) {
        await ctx.db.patch(job._id, {
          routeId: undefined,
          routeOrder: undefined,
          ...(job.status === "scheduled" ? { status: "open" as const } : {}),
        });
      }
    }

    // Attach + order the new list.
    for (let i = 0; i < args.jobIds.length; i++) {
      const job = jobs[i]!;
      await ctx.db.patch(job._id, {
        routeId: route._id,
        routeOrder: i,
        ...(job.status === "open" ? { status: "scheduled" as const } : {}),
        ...(route.assignedUserId
          ? { assignedUserId: route.assignedUserId }
          : {}),
        ...(route.assignedTeamId
          ? { assignedTeamId: route.assignedTeamId }
          : {}),
      });
    }
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:setRouteJobs",
    );
  },
});

/** Assign a crew/driver to a route and cascade to its stops. */
export const assignRoute = mutation({
  args: {
    routeId: v.id("fieldRoutes"),
    assignedTeamId: v.optional(v.union(v.id("teams"), v.null())),
    assignedUserId: v.optional(v.union(v.id("users"), v.null())),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireDispatch(ctx, auth);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const route = await ctx.db.get(args.routeId);
    assertSameOrg(auth, route);
    if (!route) return;
    if (args.assignedTeamId) {
      assertSameOrg(auth, await ctx.db.get(args.assignedTeamId));
    }
    if (args.assignedUserId) {
      // Assignee must be a member of this org.
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_org_and_user", (q) =>
          q.eq("orgId", auth.org._id).eq("userId", args.assignedUserId!),
        )
        .unique();
      if (!membership) {
        throw new ConvexError("Assignee is not a member of this organisation.");
      }
    }
    const teamId =
      args.assignedTeamId === null
        ? undefined
        : (args.assignedTeamId ?? route.assignedTeamId);
    const userId =
      args.assignedUserId === null
        ? undefined
        : (args.assignedUserId ?? route.assignedUserId);
    await ctx.db.patch(route._id, {
      assignedTeamId: teamId,
      assignedUserId: userId,
    });
    const jobs = await ctx.db
      .query("fieldJobs")
      .withIndex("by_route", (q) => q.eq("routeId", route._id))
      .collect();
    for (const job of jobs) {
      await ctx.db.patch(job._id, {
        assignedTeamId: teamId,
        assignedUserId: userId,
      });
      await writeJobAudit(ctx, auth, { jobId: job._id, action: "assigned" });
    }
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:assignRoute",
    );
  },
});

/** Routes assigned to the caller (driver/crew view) with their ordered stops. */
export const myRuns = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireFieldRead(ctx, auth);
    let routes = await ctx.db
      .query("fieldRoutes")
      .withIndex("by_org_and_assignee", (q) =>
        q.eq("orgId", auth.org._id).eq("assignedUserId", auth.user._id),
      )
      .collect();
    routes = routes.filter((r) => r.status !== "cancelled");
    if (args.date !== undefined) {
      routes = routes.filter((r) => r.date === args.date);
    }
    routes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return await Promise.all(
      routes.map(async (route) => {
        const jobs = await ctx.db
          .query("fieldJobs")
          .withIndex("by_route", (q) => q.eq("routeId", route._id))
          .collect();
        jobs.sort((a, b) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0));
        return {
          _id: route._id,
          name: route.name,
          date: route.date,
          status: route.status,
          stops: await Promise.all(jobs.map((job) => enrichJob(ctx, job))),
        };
      }),
    );
  },
});

// --- field lifecycle (mobile) ---------------------------------------------

const liveStatuses: JobStatus[] = ["open", "scheduled", "en_route", "on_site"];

/** Advance a job to en route or on site. */
export const startJob = mutation({
  args: {
    jobId: v.id("fieldJobs"),
    stage: v.union(v.literal("en_route"), v.literal("on_site")),
    geoLatitude: v.optional(v.number()),
    geoLongitude: v.optional(v.number()),
    geoAccuracy: v.optional(v.number()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireFieldWork(ctx, auth);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const job = await ctx.db.get(args.jobId);
    assertSameOrg(auth, job);
    if (!job) return;
    if (!liveStatuses.includes(job.status)) {
      throw new ConvexError({
        code: "forbidden",
        message: "This job is already closed.",
      });
    }
    const from = job.status;
    await ctx.db.patch(args.jobId, { status: args.stage });
    await writeJobAudit(ctx, auth, {
      jobId: args.jobId,
      action: args.stage,
      fromStatus: from,
      toStatus: args.stage,
      proof: {
        geoLatitude: args.geoLatitude,
        geoLongitude: args.geoLongitude,
        geoAccuracy: args.geoAccuracy,
      },
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:startJob",
    );
  },
});

/** Complete a job with proof-of-service. Enforces the org's proof rules. */
export const completeJob = mutation({
  args: {
    jobId: v.id("fieldJobs"),
    ...proofValidator,
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireFieldWork(ctx, auth);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const job = await ctx.db.get(args.jobId);
    assertSameOrg(auth, job);
    if (!job) return;
    if (!liveStatuses.includes(job.status)) {
      throw new ConvexError({
        code: "forbidden",
        message: "This job is already closed. Use a correction to amend it.",
      });
    }
    const config = await ctx.db
      .query("fieldServiceConfig")
      .withIndex("by_org", (q) => q.eq("orgId", auth.org._id))
      .unique();
    if (config?.requireSignature && !args.signatureName?.trim()) {
      throw new ConvexError("A signature is required to complete this job.");
    }
    if (config?.requirePhoto && !(args.photoStorageIds?.length ?? 0)) {
      throw new ConvexError("A photo is required to complete this job.");
    }
    if (config?.requireScan && !args.scanRef?.trim()) {
      throw new ConvexError("A scan is required to complete this job.");
    }
    const from = job.status;
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "completed",
      completedAt: now,
      completedBy: auth.user._id,
      exceptionReason: undefined,
    });
    await writeJobAudit(ctx, auth, {
      jobId: args.jobId,
      action: "completed",
      fromStatus: from,
      toStatus: "completed",
      proof: args,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:completeJob",
    );
  },
});

/** Mark a job as an exception (could not complete) with a reason. */
export const raiseException = mutation({
  args: {
    jobId: v.id("fieldJobs"),
    exceptionReason: v.string(),
    ...proofValidator,
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireFieldWork(ctx, auth);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const job = await ctx.db.get(args.jobId);
    assertSameOrg(auth, job);
    if (!job) return;
    if (!liveStatuses.includes(job.status)) {
      throw new ConvexError({
        code: "forbidden",
        message: "This job is already closed. Use a correction to amend it.",
      });
    }
    const reason = args.exceptionReason.trim();
    if (!reason) throw new ConvexError("An exception reason is required.");
    const from = job.status;
    await ctx.db.patch(args.jobId, {
      status: "exception",
      exceptionReason: reason,
    });
    await writeJobAudit(ctx, auth, {
      jobId: args.jobId,
      action: "exception",
      fromStatus: from,
      toStatus: "exception",
      exceptionReason: reason,
      proof: args,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:raiseException",
    );
  },
});

/**
 * Amend the proof of an already-closed job. Appends an immutable "corrected"
 * row referencing the superseded completion/exception event; the originals are
 * never mutated. Dispatcher-only.
 */
export const correctJobCompletion = mutation({
  args: {
    jobId: v.id("fieldJobs"),
    reason: v.string(),
    ...proofValidator,
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireDispatch(ctx, auth);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const job = await ctx.db.get(args.jobId);
    assertSameOrg(auth, job);
    if (!job) return;
    if (job.status !== "completed" && job.status !== "exception") {
      throw new ConvexError({
        code: "forbidden",
        message: "Only a closed job can be corrected.",
      });
    }
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("A correction reason is required.");
    // The most recent completion/exception (or prior correction) being amended.
    const events = await ctx.db
      .query("fieldJobAuditLog")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    events.sort((a, b) => b.performedAt - a.performedAt);
    const superseded = events.find(
      (e) =>
        e.action === "completed" ||
        e.action === "exception" ||
        e.action === "corrected",
    );
    await writeJobAudit(ctx, auth, {
      jobId: args.jobId,
      action: "corrected",
      exceptionReason: job.status === "exception" ? reason : undefined,
      proof: { ...args, notes: args.notes ?? reason },
      correctsEventId: superseded?._id,
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:correctJobCompletion",
    );
  },
});

/** Reopen a closed job back into the live flow (audited). Dispatcher-only. */
export const reopenJob = mutation({
  args: {
    jobId: v.id("fieldJobs"),
    notes: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    await requireDispatch(ctx, auth);
    if (await getClientMutation(ctx, auth, args.clientMutationId)) return;
    const job = await ctx.db.get(args.jobId);
    assertSameOrg(auth, job);
    if (!job) return;
    if (job.status !== "completed" && job.status !== "exception") {
      throw new ConvexError({
        code: "forbidden",
        message: "Only a closed job can be reopened.",
      });
    }
    const from = job.status;
    const to: JobStatus = job.routeId ? "scheduled" : "open";
    await ctx.db.patch(args.jobId, {
      status: to,
      completedAt: undefined,
      completedBy: undefined,
      exceptionReason: undefined,
    });
    await writeJobAudit(ctx, auth, {
      jobId: args.jobId,
      action: "reopened",
      fromStatus: from,
      toStatus: to,
      proof: { notes: args.notes },
    });
    await recordClientMutation(
      ctx,
      auth,
      args.clientMutationId,
      "fieldService:reopenJob",
    );
  },
});
