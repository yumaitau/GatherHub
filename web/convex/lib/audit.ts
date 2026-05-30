import { MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import { Infer } from "convex/values";
import { assetActionValidator, assetStatusValidator } from "../schema";

type AssetAction = Infer<typeof assetActionValidator>;
type AssetStatus = Infer<typeof assetStatusValidator>;

/**
 * Append an entry to the immutable asset audit log. There is intentionally no
 * update/delete path for audit rows anywhere in the codebase — the log is
 * append-only. See /docs/security-model.md.
 */
export async function writeAudit(
  ctx: MutationCtx,
  params: {
    orgId: Id<"organizations">;
    assetId: Id<"assets">;
    action: AssetAction;
    performedBy: Id<"users">;
    fromStatus?: AssetStatus;
    toStatus?: AssetStatus;
    fromCustodianMemberId?: Id<"members">;
    toCustodianMemberId?: Id<"members">;
    fromLocation?: string;
    toLocation?: string;
    notes?: string;
    geoLatitude?: number;
    geoLongitude?: number;
    geoAccuracy?: number;
  },
): Promise<Id<"assetAuditLog">> {
  return await ctx.db.insert("assetAuditLog", {
    orgId: params.orgId,
    assetId: params.assetId,
    action: params.action,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    fromCustodianMemberId: params.fromCustodianMemberId,
    toCustodianMemberId: params.toCustodianMemberId,
    fromLocation: params.fromLocation,
    toLocation: params.toLocation,
    notes: params.notes,
    geoLatitude: params.geoLatitude,
    geoLongitude: params.geoLongitude,
    geoAccuracy: params.geoAccuracy,
    performedBy: params.performedBy,
    performedAt: Date.now(),
  });
}

/** Convenience: snapshot of the fields the audit log tracks for an asset. */
export function assetSnapshot(asset: Doc<"assets">) {
  return {
    status: asset.status,
    custodianMemberId: asset.custodianMemberId,
    location: asset.location,
  };
}
