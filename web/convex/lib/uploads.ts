import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalAction, MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { AuthContext } from "./auth";
import {
  deleteR2ObjectByKey,
  hasR2Config,
  presignR2ReadUrl,
  presignR2Url,
} from "./r2";

export const IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type UploadOwnerType = "news" | "qrSettings" | "sponsors";
export type UploadPurpose = "coverImage" | "logo" | "qrLogo";

type StorageMetadata = {
  size: number;
  contentType?: string;
};

const deleteR2ObjectRef = makeFunctionReference<
  "action",
  { key: string },
  null
>("lib/uploads:deleteR2Object");

function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

export function safePathSegment(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return cleaned || fallback;
}

function safeFileName(
  fileName: string | undefined,
  uploadId: string,
  contentType: string,
): string {
  const fallback = `${uploadId}.${extensionForContentType(contentType)}`;
  if (!fileName) return fallback;
  const nameOnly = fileName.split(/[\\/]/).pop();
  return safePathSegment(nameOnly ?? "", fallback);
}

export function orgStoragePath(args: {
  orgId: Id<"organizations">;
  ownerType: UploadOwnerType;
  ownerId: string;
  purpose: UploadPurpose;
  fileName: string | undefined;
  uploadId: string;
  contentType: string;
}): string {
  const file = safeFileName(args.fileName, args.uploadId, args.contentType);
  const upload = safePathSegment(args.uploadId, "upload");
  const ownerType = safePathSegment(args.ownerType, "file");
  const ownerId = safePathSegment(args.ownerId, "unassigned");
  const purpose = safePathSegment(args.purpose, "asset");
  return [
    "orgs",
    args.orgId,
    ownerType,
    ownerId,
    purpose,
    `${upload}-${file}`,
  ].join("/");
}

export function imageValidationError(
  metadata: StorageMetadata | null,
): string | null {
  if (!metadata) return "Uploaded image was not found.";
  const contentType = metadata.contentType ?? "";
  if (!IMAGE_CONTENT_TYPES.has(contentType)) {
    return "Upload must be a PNG, JPEG, WebP, or GIF image.";
  }
  if (metadata.size > MAX_IMAGE_BYTES) {
    return "Image uploads must be 5 MB or smaller.";
  }
  return null;
}

export function validateDeclaredImageMetadata(metadata: StorageMetadata): {
  contentType: string;
  size: number;
} {
  const error = imageValidationError(metadata);
  if (error) throw new Error(error);
  return {
    contentType: metadata.contentType!,
    size: metadata.size,
  };
}

export async function createOrgImageUpload(
  ctx: MutationCtx,
  auth: AuthContext,
  args: {
    ownerType: UploadOwnerType;
    ownerId: string;
    purpose: UploadPurpose;
    fileName?: string;
    contentType: string;
    size: number;
  },
) {
  const metadata = validateDeclaredImageMetadata({
    contentType: args.contentType,
    size: args.size,
  });
  const uploadId = crypto.randomUUID();
  const key = orgStoragePath({
    orgId: auth.org._id,
    ownerType: args.ownerType,
    ownerId: args.ownerId,
    purpose: args.purpose,
    fileName: args.fileName,
    uploadId,
    contentType: metadata.contentType,
  });
  const signed = await presignR2Url({
    method: "PUT",
    key,
    headers: {
      "content-type": metadata.contentType,
      "x-amz-meta-declared-size": String(metadata.size),
    },
  });
  const now = Date.now();
  await ctx.db.insert("uploadedFiles", {
    orgId: auth.org._id,
    storageId: key,
    path: key,
    ownerType: args.ownerType,
    ownerId: args.ownerId,
    purpose: args.purpose,
    fileName: args.fileName,
    contentType: metadata.contentType,
    size: metadata.size,
    uploadedBy: auth.user._id,
    createdAt: now,
    updatedAt: now,
  });
  return {
    uploadUrl: signed.url,
    storageId: key,
    objectKey: key,
    headers: signed.headers,
    expiresInSeconds: 5 * 60,
  };
}

export async function attachOrgImage(
  ctx: MutationCtx,
  auth: AuthContext,
  args: {
    storageId: string;
    ownerType: UploadOwnerType;
    ownerId: string;
    purpose: UploadPurpose;
    fileName?: string;
  },
): Promise<string> {
  const existing = await ctx.db
    .query("uploadedFiles")
    .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
    .first();
  if (!existing) {
    throw new Error("Uploaded image was not issued by this application.");
  }
  if (existing.orgId !== auth.org._id) {
    throw new Error("Uploaded image is not available to this organisation.");
  }
  if (existing.deletedAt) {
    throw new Error("Uploaded image has already been deleted.");
  }
  if (!existing.verifiedAt) {
    throw new Error("Uploaded image has not been verified.");
  }
  if (
    existing.ownerType !== args.ownerType ||
    existing.ownerId !== args.ownerId ||
    existing.purpose !== args.purpose
  ) {
    throw new Error("Uploaded image is already attached to another record.");
  }
  const metadata = validateDeclaredImageMetadata({
    contentType: existing.contentType,
    size: existing.size,
  });
  await ctx.db.patch(existing._id, {
    fileName: args.fileName ?? existing.fileName,
    contentType: metadata.contentType,
    size: metadata.size,
    attachedAt: Date.now(),
    updatedAt: Date.now(),
  });
  return existing.path;
}

export async function deleteOrgImage(
  ctx: MutationCtx,
  auth: AuthContext,
  storageId: string | undefined,
): Promise<void> {
  if (!storageId) return;
  const existing = await ctx.db
    .query("uploadedFiles")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (!existing) return;
  if (existing.orgId !== auth.org._id) {
    throw new Error("Uploaded image is not available to this organisation.");
  }
  if (!existing.deletedAt) {
    await ctx.db.patch(existing._id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  if (hasR2Config()) {
    await ctx.scheduler.runAfter(0, deleteR2ObjectRef, {
      key: existing.path,
    });
  }
}

async function imageUrlForOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  storageId: string,
): Promise<string | null> {
  const existing = await ctx.db
    .query("uploadedFiles")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (!existing) return null;
  if (existing.orgId !== orgId || existing.deletedAt) return null;
  if (
    imageValidationError({
      contentType: existing.contentType,
      size: existing.size,
    })
  ) {
    return null;
  }
  return await presignR2ReadUrl(existing.path);
}

export async function orgImageUrl(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  storageId: string,
): Promise<string | null> {
  return await imageUrlForOrg(ctx, auth.org._id, storageId);
}

export async function publicImageUrlForOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  storageId: string,
): Promise<string | null> {
  return await imageUrlForOrg(ctx, orgId, storageId);
}

export const deleteR2Object = internalAction({
  args: { key: v.string() },
  handler: async (_ctx, args) => {
    await deleteR2ObjectByKey(args.key);
    return null;
  },
});
