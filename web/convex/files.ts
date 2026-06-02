import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireOrgMember, type AuthContext } from "./lib/auth";
import { requireCapability, type Capability } from "./lib/capabilities";
import { deleteR2ObjectByKey, headR2Object } from "./lib/r2";
import {
  createOrgImageUpload,
  uploadValidationError,
  validateDeclaredUploadMetadata,
  type UploadOwnerType,
  type UploadPurpose,
} from "./lib/uploads";

const ownerType = v.union(
  v.literal("certifications"),
  v.literal("news"),
  v.literal("qrSettings"),
  v.literal("sponsors"),
);
const purpose = v.union(
  v.literal("coverImage"),
  v.literal("document"),
  v.literal("logo"),
  v.literal("qrLogo"),
);

const uploadUrlArgs = {
  ownerType,
  ownerId: v.string(),
  purpose,
  fileName: v.optional(v.string()),
  contentType: v.string(),
  size: v.number(),
};

type GenerateUploadUrlArgs = {
  ownerType: UploadOwnerType;
  ownerId: string;
  purpose: UploadPurpose;
  fileName?: string;
  contentType: string;
  size: number;
};

function uploadCapabilityFor(ownerType: string, purpose: string): Capability {
  if (ownerType === "certifications" && purpose === "document") {
    return "training.manage";
  }
  if (ownerType === "sponsors" && purpose === "logo") {
    return "sponsors.manage";
  }
  if (ownerType === "news" && purpose === "coverImage") {
    return "news.manage";
  }
  if (ownerType === "qrSettings" && purpose === "qrLogo") {
    return "assets.admin";
  }
  throw new Error("Unsupported upload destination.");
}

async function requireUploadCapability(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  ownerType: string,
  purpose: string,
) {
  await requireCapability(ctx, auth, uploadCapabilityFor(ownerType, purpose));
}

async function authContextForClerkUserId(
  ctx: MutationCtx,
  clerkUserId: string,
): Promise<AuthContext> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();
  if (!user || !user.activeOrgId) {
    throw new Error("Select or create an organisation to continue.");
  }
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_org_and_user", (q) =>
      q.eq("orgId", user.activeOrgId!).eq("userId", user._id),
    )
    .unique();
  const org = await ctx.db.get(user.activeOrgId);
  if (!membership || !org) {
    throw new Error("You are not a member of this organisation.");
  }
  return { user, org, membership, role: membership.role };
}

async function issueOrgUploadUrl(
  ctx: MutationCtx,
  auth: AuthContext,
  args: GenerateUploadUrlArgs,
) {
  await requireUploadCapability(ctx, auth, args.ownerType, args.purpose);
  return await createOrgImageUpload(ctx, auth, args);
}

/**
 * Issue a short-lived R2 PUT URL for an org-scoped file upload. The returned
 * `storageId` is the R2 object key and remains compatible with existing
 * sponsor/news/QR mutation argument names.
 */
export const generateUploadUrl = mutation({
  args: uploadUrlArgs,
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    return await issueOrgUploadUrl(ctx, auth, {
      ownerType: args.ownerType as UploadOwnerType,
      ownerId: args.ownerId,
      purpose: args.purpose as UploadPurpose,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
    });
  },
});

export const generateUploadUrlForHttp = internalMutation({
  args: {
    clerkUserId: v.string(),
    ...uploadUrlArgs,
  },
  handler: async (ctx, args) => {
    const auth = await authContextForClerkUserId(ctx, args.clerkUserId);
    return await issueOrgUploadUrl(ctx, auth, {
      ownerType: args.ownerType as UploadOwnerType,
      ownerId: args.ownerId,
      purpose: args.purpose as UploadPurpose,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
    });
  },
});

/**
 * Verify that the object was actually written to R2 before an owning mutation
 * can attach the returned key to an org record.
 */
export const completeUpload = action({
  args: {
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.runQuery(internal.files.getUploadForVerification, {
      storageId: args.storageId,
    });
    const object = await headR2Object(upload.path);
    if (!object) {
      await ctx.runMutation(internal.files.markUploadDeleted, {
        storageId: args.storageId,
      });
      throw new Error("Uploaded file was not found in R2.");
    }

    if (object.size !== upload.size) {
      await ctx.runMutation(internal.files.markUploadDeleted, {
        storageId: args.storageId,
      });
      await deleteR2ObjectByKey(upload.path).catch(() => undefined);
      throw new Error("Uploaded file size does not match the selected file.");
    }

    const validationError = uploadValidationError(upload.purpose, {
      contentType: upload.contentType,
      size: object.size,
    });
    if (validationError) {
      await ctx.runMutation(internal.files.markUploadDeleted, {
        storageId: args.storageId,
      });
      await deleteR2ObjectByKey(upload.path).catch(() => undefined);
      throw new Error(validationError);
    }

    const metadata = validateDeclaredUploadMetadata(upload.purpose, {
      contentType: upload.contentType,
      size: object.size,
    });
    await ctx.runMutation(internal.files.markUploadVerified, {
      storageId: args.storageId,
      contentType: metadata.contentType,
      size: metadata.size,
    });
    return { storageId: args.storageId };
  },
});

export const getUploadForVerification = internalQuery({
  args: {
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrgMember(ctx);
    const upload = await ctx.db
      .query("uploadedFiles")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!upload || upload.orgId !== auth.org._id || upload.deletedAt) {
      throw new Error("Uploaded file is not available to this organisation.");
    }
    if (upload.uploadedBy !== auth.user._id) {
      throw new Error("Uploaded file belongs to another user.");
    }
    await requireUploadCapability(ctx, auth, upload.ownerType, upload.purpose);
    return {
      path: upload.path,
      purpose: upload.purpose,
      contentType: upload.contentType,
      size: upload.size,
    };
  },
});

export const markUploadVerified = internalMutation({
  args: {
    storageId: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db
      .query("uploadedFiles")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!upload || upload.deletedAt) {
      throw new Error("Uploaded file is not available.");
    }
    const metadata = validateDeclaredUploadMetadata(upload.purpose, {
      contentType: args.contentType,
      size: args.size,
    });
    await ctx.db.patch(upload._id, {
      contentType: metadata.contentType,
      size: metadata.size,
      verifiedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const markUploadDeleted = internalMutation({
  args: {
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db
      .query("uploadedFiles")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!upload || upload.deletedAt) return;
    await ctx.db.patch(upload._id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
