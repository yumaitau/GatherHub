import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { Infer } from "convex/values";
import { roleValidator } from "../schema";

export type Role = Infer<typeof roleValidator>;

/**
 * Role precedence — higher number == more privilege. Used by `hasAtLeastRole`.
 * Note: Coach/Volunteer/Parent/Player are largely parallel "operational" roles;
 * ranking exists so committee-and-above checks are simple.
 */
const ROLE_RANK: Record<Role, number> = {
  owner: 100,
  admin: 90,
  committee: 70,
  coach: 50,
  volunteer: 40,
  parent: 30,
  player: 20,
};

export interface AuthContext {
  user: Doc<"users">;
  org: Doc<"organizations">;
  membership: Doc<"memberships">;
  role: Role;
}

/**
 * Resolve the authenticated user, their active organisation, and their role
 * WITHIN that organisation — derived entirely from the verified Clerk JWT.
 *
 * The Clerk JWT (template "convex") carries:
 *   - subject              → Clerk user id
 *   - org_id (claim "o.id")→ active Clerk organisation id
 *
 * We never trust an orgId passed by the client. This is the single chokepoint
 * for tenant isolation; see /docs/security-model.md.
 */
export async function getAuthContext(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthContext | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const clerkUserId = identity.subject;

  // Clerk puts the active org id in the `org_id` claim when an org is active.
  // Convex exposes custom claims on the identity object.
  const clerkOrgId =
    (identity.orgId as string | undefined) ??
    (identity as unknown as { org_id?: string }).org_id;
  if (!clerkOrgId) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();
  if (!user) return null;

  const org = await ctx.db
    .query("organizations")
    .withIndex("by_clerk_id", (q) => q.eq("clerkOrgId", clerkOrgId))
    .unique();
  if (!org) return null;

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_org_and_clerk_user", (q) =>
      q.eq("orgId", org._id).eq("clerkUserId", clerkUserId),
    )
    .unique();
  if (!membership) return null;

  return { user, org, membership, role: membership.role };
}

/** Throw if the request is not authenticated and a member of an org. */
export async function requireOrgMember(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthContext> {
  const auth = await getAuthContext(ctx);
  if (!auth) {
    throw new Error("Not authenticated or not a member of an organisation.");
  }
  return auth;
}

export function hasAtLeastRole(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** Throw unless the caller holds at least `minimum` role in their active org. */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  minimum: Role,
): Promise<AuthContext> {
  const auth = await requireOrgMember(ctx);
  if (!hasAtLeastRole(auth.role, minimum)) {
    throw new Error(
      `Insufficient permissions: requires ${minimum} or higher (you are ${auth.role}).`,
    );
  }
  return auth;
}

/** Throw unless the caller holds one of the explicitly allowed roles. */
export async function requireAnyRole(
  ctx: QueryCtx | MutationCtx,
  allowed: Role[],
): Promise<AuthContext> {
  const auth = await requireOrgMember(ctx);
  if (!allowed.includes(auth.role)) {
    throw new Error(
      `Insufficient permissions: requires one of [${allowed.join(", ")}].`,
    );
  }
  return auth;
}

/**
 * Assert a fetched document belongs to the caller's organisation. Guards every
 * by-id read/mutation so a valid id from another tenant cannot leak.
 */
export function assertSameOrg(
  auth: AuthContext,
  doc: { orgId: Id<"organizations"> } | null,
): void {
  if (!doc || doc.orgId !== auth.org._id) {
    throw new Error("Not found.");
  }
}

/** Can the caller view restricted data such as medical notes? */
export function canViewRestricted(role: Role): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "committee" ||
    role === "coach"
  );
}

/** Roles permitted to manage (mutate) assets and run asset operations. */
export const ASSET_MANAGER_ROLES: Role[] = [
  "owner",
  "admin",
  "committee",
  "coach",
  "volunteer",
];
