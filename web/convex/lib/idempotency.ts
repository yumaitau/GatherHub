import { MutationCtx } from "../_generated/server";
import { AuthContext } from "./auth";

export async function getClientMutation(
  ctx: MutationCtx,
  auth: AuthContext,
  clientMutationId: string | undefined,
) {
  const id = clientMutationId?.trim();
  if (!id) return null;
  return await ctx.db
    .query("clientMutations")
    .withIndex("by_org_user_client", (q) =>
      q
        .eq("orgId", auth.org._id)
        .eq("userId", auth.user._id)
        .eq("clientMutationId", id),
    )
    .unique();
}

export async function recordClientMutation(
  ctx: MutationCtx,
  auth: AuthContext,
  clientMutationId: string | undefined,
  operation: string,
  resultId?: string,
) {
  const id = clientMutationId?.trim();
  if (!id) return;
  const existing = await getClientMutation(ctx, auth, id);
  if (existing) return;
  await ctx.db.insert("clientMutations", {
    orgId: auth.org._id,
    userId: auth.user._id,
    clientMutationId: id,
    operation,
    resultId,
    createdAt: Date.now(),
  });
}
