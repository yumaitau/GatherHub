import { Id } from "../../convex/_generated/dataModel";

export const IMAGE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

const IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type UploadedImage = {
  storageId: Id<"_storage">;
  fileName: string;
};

function validateImage(file: File) {
  if (!IMAGE_CONTENT_TYPES.has(file.type)) {
    throw new Error("Upload must be a PNG, JPEG, WebP, or GIF image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image uploads must be 5 MB or smaller.");
  }
}

export async function uploadImageFile(
  generateUploadUrl: () => Promise<string>,
  file: File,
): Promise<UploadedImage> {
  validateImage(file);
  const url = await generateUploadUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("Image upload failed.");
  const json = (await res.json()) as { storageId: Id<"_storage"> };
  return { storageId: json.storageId, fileName: file.name };
}
