export const IMAGE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
export const DOCUMENT_UPLOAD_ACCEPT =
  "application/pdf,image/png,image/jpeg,image/webp,image/gif";

const IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DOCUMENT_CONTENT_TYPES = new Set([
  ...IMAGE_CONTENT_TYPES,
  "application/pdf",
]);
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export type UploadOwnerType =
  | "certifications"
  | "news"
  | "qrSettings"
  | "sponsors";
export type UploadPurpose = "coverImage" | "document" | "logo" | "qrLogo";

export type UploadedFile = {
  storageId: string;
  fileName: string;
};
export type UploadedImage = UploadedFile;

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

function validateDocument(file: File) {
  if (!DOCUMENT_CONTENT_TYPES.has(file.type)) {
    throw new Error("Upload must be a PDF, PNG, JPEG, WebP, or GIF file.");
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("Document uploads must be 15 MB or smaller.");
  }
}

async function uploadValidatedFile(
  generateUploadUrl: GenerateUploadUrl,
  completeUpload: CompleteUpload,
  file: File,
  destination: UploadDestination,
): Promise<UploadedFile> {
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
  if (!res.ok) throw new Error("File upload failed.");
  await completeUpload({ storageId: generated.storageId });
  return { storageId: generated.storageId, fileName: file.name };
}

export async function uploadImageFile(
  generateUploadUrl: GenerateUploadUrl,
  completeUpload: CompleteUpload,
  file: File,
  destination: UploadDestination,
): Promise<UploadedImage> {
  validateImage(file);
  return await uploadValidatedFile(
    generateUploadUrl,
    completeUpload,
    file,
    destination,
  );
}

export async function uploadDocumentFile(
  generateUploadUrl: GenerateUploadUrl,
  completeUpload: CompleteUpload,
  file: File,
  destination: UploadDestination,
): Promise<UploadedFile> {
  validateDocument(file);
  return await uploadValidatedFile(
    generateUploadUrl,
    completeUpload,
    file,
    destination,
  );
}
