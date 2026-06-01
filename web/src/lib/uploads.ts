export const IMAGE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

const IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type UploadOwnerType = "news" | "qrSettings" | "sponsors";
export type UploadPurpose = "coverImage" | "logo" | "qrLogo";

export type UploadedImage = {
  storageId: string;
  fileName: string;
};

type UploadDestination = {
  ownerType: UploadOwnerType;
  ownerId: string;
  purpose: UploadPurpose;
};

type GeneratedUpload = {
  uploadUrl: string;
  storageId: string;
  headers?: Record<string, string>;
};

type GenerateUploadUrl = (args: {
  ownerType: UploadOwnerType;
  ownerId: string;
  purpose: UploadPurpose;
  fileName?: string;
  contentType: string;
  size: number;
}) => Promise<GeneratedUpload>;

type CompleteUpload = (args: { storageId: string }) => Promise<{
  storageId: string;
}>;

function validateImage(file: File) {
  if (!IMAGE_CONTENT_TYPES.has(file.type)) {
    throw new Error("Upload must be a PNG, JPEG, WebP, or GIF image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image uploads must be 5 MB or smaller.");
  }
}

export async function uploadImageFile(
  generateUploadUrl: GenerateUploadUrl,
  completeUpload: CompleteUpload,
  file: File,
  destination: UploadDestination,
): Promise<UploadedImage> {
  validateImage(file);
  const generated = await generateUploadUrl({
    ...destination,
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  });
  const res = await fetch(generated.uploadUrl, {
    method: "PUT",
    headers: generated.headers ?? { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("Image upload failed.");
  await completeUpload({ storageId: generated.storageId });
  return { storageId: generated.storageId, fileName: file.name };
}
