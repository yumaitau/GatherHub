import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { AuthContext } from "./auth";

const IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type UploadOwnerType = "news" | "qrSettings" | "sponsors";
type UploadPurpose = "coverImage" | "logo" | "qrLogo";

type StorageMetadata = {
  size: number;
  contentType?: string;
};

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

function safePathSegment(value: string, fallback: string): string {
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
  storageId: Id<"_storage">,
  contentType: string,
): string {
  const fallback = `${storageId}.${extensionForContentType(contentType)}`;
  if (!fileName) return fallback;
  const nameOnly = fileName.split(/[\\/]/).pop();
  return safePathSegment(nameOnly ?? "", fallback);
}

function orgStoragePath(args: {
  orgId: Id<"organizations">;
  ownerType: UploadOwnerType;
  ownerId: string;
  purpose: UploadPurpose;
  fileName: string | undefined;
  storageId: Id<"_storage">;
  contentType: string;
}): string {
  const file = safeFileName(args.fileName, args.storageId, args.contentType);
  const ownerType = safePathSegment(args.ownerType, "file");
  const ownerId = safePathSegment(args.ownerId, "unassigned");
  const purpose = safePathSegment(args.purpose, "asset");
  const storage = safePathSegment(args.storageId, "storage");
  return [
    "organizations",
    args.orgId,
    ownerType,
    ownerId,
    purpose,
    `${Date.now()}-${storage}-${file}`,
  ].join("/");
}

function imageValidationError(metadata: StorageMetadata | null): string | null {
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

async function imageMetadata(
  ctx: QueryCtx | MutationCtx,
  storageId: Id<"_storage">,
) {
  return await ctx.db.system.get("_storage", storageId);
}

async function validatedImageMetadata(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
) {
  const metadata = await imageMetadata(ctx, storageId);
  async function reject(message: string): Promise<never> {
    try {
      await ctx.storage.delete(storageId);
    } catch {
      // Best-effort cleanup; keep the validation error as the caller signal.
    }
    throw new Error(message);
  }
  if (!metadata) return await reject("Uploaded image was not found.");
  const contentType = metadata.contentType ?? "";
  if (!IMAGE_CONTENT_TYPES.has(contentType)) {
    return await reject("Upload must be a PNG, JPEG, WebP, or GIF image.");
  }
  if (metadata.size > MAX_IMAGE_BYTES) {
    return await reject("Image uploads must be 5 MB or smaller.");
  }
  return { size: metadata.size, contentType };
}

export async function attachOrgImage(
  ctx: MutationCtx,
  auth: AuthContext,
  args: {
    storageId: Id<"_storage">;
    ownerType: UploadOwnerType;
    ownerId: string;
    purpose: UploadPurpose;
    fileName?: string;
  },
): Promise<string> {
  const metadata = await validatedImageMetadata(ctx, args.storageId);
  const existing = await ctx.db
    .query("uploadedFiles")
    .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
    .first();
  if (existing) {
    if (existing.orgId !== auth.org._id) {
      throw new Error("Uploaded image is not available to this organisation.");
    }
    if (existing.deletedAt) {
      throw new Error("Uploaded image has already been deleted.");
    }
    if (
      existing.ownerType !== args.ownerType ||
      existing.ownerId !== args.ownerId ||
      existing.purpose !== args.purpose
    ) {
      throw new Error("Uploaded image is already attached to another record.");
    }
    await ctx.db.patch(existing._id, {
      fileName: args.fileName,
      contentType: metadata.contentType,
      size: metadata.size,
      updatedAt: Date.now(),
    });
    return existing.path;
  }

  const path = orgStoragePath({
    orgId: auth.org._id,
    ownerType: args.ownerType,
    ownerId: args.ownerId,
    purpose: args.purpose,
    fileName: args.fileName,
    storageId: args.storageId,
    contentType: metadata.contentType,
  });
  const now = Date.now();
  await ctx.db.insert("uploadedFiles", {
    orgId: auth.org._id,
    storageId: args.storageId,
    path,
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
  return path;
}

export async function deleteOrgImage(
  ctx: MutationCtx,
  auth: AuthContext,
  storageId: Id<"_storage"> | undefined,
): Promise<void> {
  if (!storageId) return;
  const existing = await ctx.db
    .query("uploadedFiles")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (existing) {
    if (existing.orgId !== auth.org._id) {
      throw new Error("Uploaded image is not available to this organisation.");
    }
    if (!existing.deletedAt) {
      await ctx.db.patch(existing._id, {
        deletedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }
  try {
    await ctx.storage.delete(storageId);
  } catch {
    // Legacy attachments may point at a missing storage object. The owner row
    // has still been detached, so deletion stays best-effort.
  }
}

async function imageUrlForOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  storageId: Id<"_storage">,
): Promise<string | null> {
  const existing = await ctx.db
    .query("uploadedFiles")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (existing) {
    if (existing.orgId !== orgId || existing.deletedAt) return null;
    return await ctx.storage.getUrl(storageId);
  }

  // Legacy rows from before org-scoped upload metadata still only resolve
  // through the owning record's org-checked query.
  const metadata = await imageMetadata(ctx, storageId);
  if (imageValidationError(metadata)) return null;
  return await ctx.storage.getUrl(storageId);
}

export async function orgImageUrl(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  storageId: Id<"_storage">,
): Promise<string | null> {
  return await imageUrlForOrg(ctx, auth.org._id, storageId);
}

export async function publicImageUrlForOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  storageId: Id<"_storage">,
): Promise<string | null> {
  return await imageUrlForOrg(ctx, orgId, storageId);
}
