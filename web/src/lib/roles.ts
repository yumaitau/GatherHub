/** Client-side role helpers. These mirror convex/lib/auth.ts for UI gating
 *  ONLY — every real permission decision is enforced server-side in Convex. */

export type Role =
  | "owner"
  | "admin"
  | "committee"
  | "coach"
  | "volunteer"
  | "parent"
  | "player";

export const ROLE_RANK: Record<Role, number> = {
  owner: 100,
  admin: 90,
  committee: 70,
  coach: 50,
  volunteer: 40,
  parent: 30,
  player: 20,
};

export const ALL_ROLES: Role[] = [
  "owner",
  "admin",
  "committee",
  "coach",
  "volunteer",
  "parent",
  "player",
];

export function hasAtLeastRole(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const ASSET_MANAGER_ROLES: Role[] = [
  "owner",
  "admin",
  "committee",
  "coach",
  "volunteer",
];

export function canManageAssets(role: Role): boolean {
  return ASSET_MANAGER_ROLES.includes(role);
}
