import { mutation } from "./_generated/server";
import { requireOrgMember } from "./lib/auth";
import { hasCapability, requireCapability } from "./lib/capabilities";

/**
 * Generate a short-lived upload URL for file storage (e.g. sponsor logos, news
 * cover images). The client POSTs the file directly to this URL and receives a
 * storageId back, which it then attaches via the relevant mutation.
 *
 * Validation note: Convex enforces auth here; the consuming mutation validates
 * that the resulting storageId is attached only to records in the caller's org.
 * Size/content-type limits are enforced client-side and re-checked on display.
 * See /docs/security-model.md (secure file upload validation).
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrgMember(ctx);
    const canUpload =
      (await hasCapability(ctx, auth, "sponsors.manage")) ||
      (await hasCapability(ctx, auth, "news.manage")) ||
      (await hasCapability(ctx, auth, "settings.admin"));
    if (!canUpload) {
      await requireCapability(ctx, auth, "assets.admin");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

// Note: there is no public storageId → URL resolver. Callers that need a
// served URL for an attached file (sponsor logo, news cover image) get it
// back from the owning record's query, which performs the org check.
// Exposing a generic resolver would oracle every storageId in the deployment
// to any client. See security review (Critical #1) for context.
