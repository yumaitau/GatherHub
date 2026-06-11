import { ConvexError } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { type AuthContext, type Role } from "./auth";

export const CAPABILITIES = [
  "settings.admin",
  "roles.manage",
  "invitations.manage",
  "members.read",
  "members.write",
  "members.delete",
  "teams.read",
  "teams.write",
  "teams.delete",
  "events.read",
  "events.write",
  "events.delete",
  "announcements.write",
  "posts.write",
  "posts.moderate",
  "assets.read",
  "assets.operate",
  "assets.admin",
  "volunteers.manage",
  "training.manage",
  "tasks.manage",
  "public_site.manage",
  "sponsors.manage",
  "news.manage",
  "soccer.manage",
  "soccer.grade",
  "audit.read",
  "reports.export",
  "mobile.offline_sync",
  "jobs.dispatch",
  "jobs.complete",
  "fleet.inspect",
  "safety.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ALL_CAPABILITIES = [...CAPABILITIES];

const OWNER_CAPABILITIES = ALL_CAPABILITIES;
const ADMIN_CAPABILITIES = ALL_CAPABILITIES;
const COMMITTEE_CAPABILITIES: Capability[] = [
  "settings.admin",
  "roles.manage",
  "invitations.manage",
  "members.read",
  "members.write",
  "members.delete",
  "teams.read",
  "teams.write",
  "teams.delete",
  "events.read",
  "events.write",
  "events.delete",
  "announcements.write",
  "posts.write",
  "posts.moderate",
  "assets.read",
  "assets.operate",
  "assets.admin",
  "volunteers.manage",
  "training.manage",
  "tasks.manage",
  "public_site.manage",
  "sponsors.manage",
  "news.manage",
  "soccer.manage",
  "soccer.grade",
  "audit.read",
  "reports.export",
  "mobile.offline_sync",
];
const COACH_CAPABILITIES: Capability[] = [
  "members.read",
  "members.write",
  "teams.read",
  "events.read",
  "events.write",
  "posts.write",
  "assets.read",
  "assets.operate",
  "soccer.grade",
  "mobile.offline_sync",
];
const VOLUNTEER_CAPABILITIES: Capability[] = [
  "events.read",
  "assets.read",
  "assets.operate",
  "mobile.offline_sync",
];
const FAMILY_CAPABILITIES: Capability[] = [
  "events.read",
  "mobile.offline_sync",
];

export const LEGACY_ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  owner: OWNER_CAPABILITIES,
  admin: ADMIN_CAPABILITIES,
  committee: COMMITTEE_CAPABILITIES,
  coach: COACH_CAPABILITIES,
  volunteer: VOLUNTEER_CAPABILITIES,
  parent: FAMILY_CAPABILITIES,
  player: FAMILY_CAPABILITIES,
};

type RoleTemplate = {
  key: string;
  displayName: string;
  legacyRole: Role;
  description: string;
  capabilities: Capability[];
};

const OWNER_ROLE_TEMPLATE: RoleTemplate = {
  key: "owner",
  displayName: "Owner",
  legacyRole: "owner",
  description: "Full control, including ownership transfer and role design.",
  capabilities: OWNER_CAPABILITIES,
};

const ADMIN_ROLE_TEMPLATE: RoleTemplate = {
  key: "admin",
  displayName: "Admin",
  legacyRole: "admin",
  description: "Administrative control except owner-only role changes.",
  capabilities: ADMIN_CAPABILITIES,
};

const SPORTS_ROLE_TEMPLATES: RoleTemplate[] = [
  OWNER_ROLE_TEMPLATE,
  ADMIN_ROLE_TEMPLATE,
  {
    key: "committee",
    displayName: "Committee",
    legacyRole: "committee",
    description: "Day-to-day organisation administration.",
    capabilities: COMMITTEE_CAPABILITIES,
  },
  {
    key: "coach",
    displayName: "Coach",
    legacyRole: "coach",
    description: "Team, event, asset operation, and grading access.",
    capabilities: COACH_CAPABILITIES,
  },
  {
    key: "volunteer",
    displayName: "Volunteer",
    legacyRole: "volunteer",
    description: "Operational field access with limited writes.",
    capabilities: VOLUNTEER_CAPABILITIES,
  },
  {
    key: "parent",
    displayName: "Parent",
    legacyRole: "parent",
    description: "Mobile-only family access.",
    capabilities: FAMILY_CAPABILITIES,
  },
  {
    key: "player",
    displayName: "Player",
    legacyRole: "player",
    description: "Mobile-only participant access.",
    capabilities: FAMILY_CAPABILITIES,
  },
];

const OPERATIONS_ROLE_TEMPLATES: RoleTemplate[] = [
  OWNER_ROLE_TEMPLATE,
  ADMIN_ROLE_TEMPLATE,
  {
    key: "operations_manager",
    displayName: "Operations manager",
    legacyRole: "committee",
    description: "Runs jobs, crews, fleet, safety, training, and reporting.",
    capabilities: [
      ...COMMITTEE_CAPABILITIES,
      "jobs.dispatch",
      "jobs.complete",
      "fleet.inspect",
      "safety.manage",
    ],
  },
  {
    key: "dispatcher",
    displayName: "Dispatcher",
    legacyRole: "coach",
    description: "Schedules work, assigns crews, and manages job flow.",
    capabilities: [
      "members.read",
      "teams.read",
      "events.read",
      "events.write",
      "assets.read",
      "tasks.manage",
      "jobs.dispatch",
      "reports.export",
      "mobile.offline_sync",
    ],
  },
  {
    key: "crew_lead",
    displayName: "Crew lead",
    legacyRole: "coach",
    description: "Leads field teams and completes assigned work.",
    capabilities: [
      "members.read",
      "teams.read",
      "events.read",
      "events.write",
      "assets.read",
      "assets.operate",
      "jobs.complete",
      "fleet.inspect",
      "mobile.offline_sync",
    ],
  },
  {
    key: "driver",
    displayName: "Driver",
    legacyRole: "volunteer",
    description: "Completes field work and operates assigned assets.",
    capabilities: [
      "events.read",
      "assets.read",
      "assets.operate",
      "jobs.complete",
      "fleet.inspect",
      "mobile.offline_sync",
    ],
  },
  {
    key: "safety_officer",
    displayName: "Safety officer",
    legacyRole: "committee",
    description: "Owns safety checks, incidents, and compliance actions.",
    capabilities: [
      "members.read",
      "events.read",
      "assets.read",
      "training.manage",
      "tasks.manage",
      "safety.manage",
      "reports.export",
      "mobile.offline_sync",
    ],
  },
  {
    key: "customer_contact",
    displayName: "Customer contact",
    legacyRole: "parent",
    description: "Read-only portal style access.",
    capabilities: ["events.read"],
  },
];

export function roleTemplatesForOrg(org: Doc<"organizations">): RoleTemplate[] {
  if (
    org.kind === "field_service" ||
    org.kind === "waste_operator" ||
    org.kind === "logistics"
  ) {
    return OPERATIONS_ROLE_TEMPLATES;
  }
  return SPORTS_ROLE_TEMPLATES;
}

async function rolesForOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
) {
  return await ctx.db
    .query("organizationRoles")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
}

export async function ensureOrganizationRoles(
  ctx: MutationCtx,
  org: Doc<"organizations">,
) {
  const existing = await rolesForOrg(ctx, org._id);
  if (existing.length > 0) return;
  let order = 0;
  const now = Date.now();
  for (const template of roleTemplatesForOrg(org)) {
    await ctx.db.insert("organizationRoles", {
      orgId: org._id,
      key: template.key,
      displayName: template.displayName,
      description: template.description,
      legacyRole: template.legacyRole,
      capabilities: template.capabilities,
      isSystem: true,
      active: true,
      order: order++,
      updatedAt: now,
    });
  }
}

export async function effectiveRoleForMembership(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  membership: Doc<"memberships">,
) {
  const roles = await rolesForOrg(ctx, orgId);
  const role =
    roles.find((row) => row.active && row.key === membership.roleKey) ??
    roles.find((row) => row.active && row.legacyRole === membership.role);
  return {
    roleKey: role?.key ?? membership.role,
    displayName: role?.displayName ?? membership.role,
    capabilities:
      role?.capabilities ?? LEGACY_ROLE_CAPABILITIES[membership.role],
    legacyRole: role?.legacyRole ?? membership.role,
  };
}

export async function effectiveCapabilities(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
) {
  const role = await effectiveRoleForMembership(
    ctx,
    auth.org._id,
    auth.membership,
  );
  return role.capabilities;
}

export async function hasCapability(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  capability: Capability,
) {
  const capabilities = await effectiveCapabilities(ctx, auth);
  return capabilities.includes(capability);
}

export async function requireCapability(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  capability: Capability,
) {
  if (await hasCapability(ctx, auth, capability)) return;
  throw new ConvexError({
    code: "forbidden",
    capability,
    message: `Missing permission: ${capability}.`,
  });
}

export function coerceCapabilityList(values: string[]): Capability[] {
  const allowed = new Set<string>(CAPABILITIES);
  const unique = [...new Set(values)];
  if (unique.some((value) => !allowed.has(value))) {
    throw new ConvexError("One or more capabilities are not valid.");
  }
  return unique as Capability[];
}
