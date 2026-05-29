import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { ConvexError, Infer } from "convex/values";
import { roleValidator } from "../schema";

export type Role = Infer<typeof roleValidator>;

/**
 * Typed error codes thrown by the auth guards. The frontend pattern-matches on
 * `code` (via `ConvexError.data`) to render the right UI (sign-in screen vs.
 * access-denied screen vs. empty-org state) without leaking record existence.
 *
 * See web/src/lib/errors.ts for the matching client helper.
 */
export type AuthErrorCode =
  | "unauthenticated" // no Clerk session at all
  | "no_active_org" // signed in, but no active org selected
  | "not_member" // signed in, active org exists, but caller is not a member
  | "forbidden" // signed in, member, but missing the required role
  | "not_found"; // record absent OR belongs to another org (do not distinguish)

export type AuthErrorData = {
  code: AuthErrorCode;
  message: string;
  [key: string]: string;
};

function authError(
  code: AuthErrorCode,
  message: string,
): ConvexError<AuthErrorData> {
  return new ConvexError<AuthErrorData>({ code, message });
}

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

/**
 * Return the authenticated Convex user record, or throw a typed
 * `unauthenticated` error. Use when an operation needs *some* signed-in user
 * but does not require an active organisation (e.g. accepting an invite).
 */
export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw authError("unauthenticated", "Sign in to continue.");
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (!user) {
    throw authError(
      "unauthenticated",
      "Your account is still being created — refresh in a moment.",
    );
  }
  return user;
}

/**
 * Throw a typed error unless the caller is authenticated AND a member of an
 * active organisation. Distinguishes unauthenticated / no_active_org /
 * not_member so the UI can render the correct screen.
 */
export async function requireOrgMember(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthContext> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw authError("unauthenticated", "Sign in to continue.");
  }
  const clerkOrgId =
    (identity.orgId as string | undefined) ??
    (identity as unknown as { org_id?: string }).org_id;
  if (!clerkOrgId) {
    throw authError(
      "no_active_org",
      "Select or create an organisation to continue.",
    );
  }
  const auth = await getAuthContext(ctx);
  if (!auth) {
    throw authError("not_member", "You are not a member of this organisation.");
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
    throw authError(
      "forbidden",
      `Insufficient permission: requires ${minimum} or higher (you are ${auth.role}).`,
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
    throw authError(
      "forbidden",
      `Insufficient permission: requires one of [${allowed.join(", ")}] (you are ${auth.role}).`,
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
    // Deliberately collapse "absent" and "cross-org" into the same error so a
    // valid id from another tenant cannot be probed for existence.
    throw authError("not_found", "Not found.");
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
