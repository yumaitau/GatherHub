import { AwsClient } from "aws4fetch";

const R2_REGION = "auto";
const R2_SERVICE = "s3";
const DEFAULT_UPLOAD_EXPIRES_SECONDS = 5 * 60;
const DEFAULT_READ_EXPIRES_SECONDS = 5 * 60;

type R2Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type PresignArgs = {
  method: "DELETE" | "GET" | "HEAD" | "PUT";
  key: string;
  expiresSeconds?: number;
  headers?: Record<string, string>;
};

export type R2PresignedUrl = {
  url: string;
  headers: Record<string, string>;
};

export type R2ObjectHead = {
  contentType?: string;
  size: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`Missing required R2 environment variable: ${name}.`);
  return value;
}

function r2Endpoint(): string {
  const explicit =
    process.env.R2_ENDPOINT ?? process.env.CLOUDFLARE_R2_ENDPOINT;
  if (explicit) return explicit.replace(/\/+$/, "");

  const accountId =
    process.env.R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  if (!accountId) {
    throw new Error(
      "Missing required R2 environment variable: R2_ENDPOINT or R2_ACCOUNT_ID.",
    );
  }
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function r2Config(): R2Config {
  return {
    endpoint: r2Endpoint(),
    bucket: requiredEnv("R2_BUCKET"),
    accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
  };
}

export function hasR2Config(): boolean {
  return Boolean(
    (process.env.R2_ENDPOINT ||
      process.env.CLOUDFLARE_R2_ENDPOINT ||
      process.env.R2_ACCOUNT_ID ||
      process.env.CLOUDFLARE_R2_ACCOUNT_ID) &&
    process.env.R2_BUCKET &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY,
  );
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalKeyUri(key: string): string {
  return `/${key
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/")}`;
}

function r2RequestTarget(config: R2Config, key: string) {
  const endpoint = new URL(config.endpoint);
  if (!endpoint.hostname.endsWith(".r2.cloudflarestorage.com")) {
    throw new Error(
      "R2_ENDPOINT must be the Cloudflare R2 S3 API endpoint, not a public bucket URL or custom domain.",
    );
  }

  const bucketHostPrefix = `${config.bucket.toLowerCase()}.`;
  const host = endpoint.hostname.toLowerCase().startsWith(bucketHostPrefix)
    ? endpoint.host
    : `${config.bucket}.${endpoint.host}`;
  const uri = canonicalKeyUri(key);
  const url = new URL(`${endpoint.protocol}//${host}${uri}`);
  return { url, uri, host };
}

export async function presignR2Url({
  method,
  key,
  expiresSeconds,
  headers = {},
}: PresignArgs): Promise<R2PresignedUrl> {
  const config = r2Config();
  const target = r2RequestTarget(config, key);
  target.url.searchParams.set(
    "X-Amz-Expires",
    String(expiresSeconds ?? DEFAULT_UPLOAD_EXPIRES_SECONDS),
  );
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: R2_SERVICE,
    region: R2_REGION,
    retries: 0,
  });
  const signed = await aws.sign(target.url.toString(), {
    method,
    headers,
    aws: { signQuery: true },
  });

  return {
    url: signed.url,
    headers: Object.fromEntries(signed.headers.entries()),
  };
}

export async function presignR2ReadUrl(key: string): Promise<string | null> {
  if (!hasR2Config()) return null;
  const signed = await presignR2Url({
    method: "GET",
    key,
    expiresSeconds: DEFAULT_READ_EXPIRES_SECONDS,
  });
  return signed.url;
}

export async function headR2Object(key: string): Promise<R2ObjectHead | null> {
  if (!hasR2Config()) return null;
  const signed = await presignR2Url({
    method: "HEAD",
    key,
    expiresSeconds: 60,
  });
  const response = await fetch(signed.url, { method: "HEAD" });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`R2 HEAD failed with HTTP ${response.status}.`);
  }
  const size = Number(response.headers.get("content-length") ?? "NaN");
  if (!Number.isFinite(size) || size < 0) {
    throw new Error("R2 object is missing a valid Content-Length.");
  }
  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ||
    undefined;
  return { contentType, size };
}

export async function deleteR2ObjectByKey(key: string): Promise<void> {
  if (!hasR2Config()) return;
  const signed = await presignR2Url({
    method: "DELETE",
    key,
    expiresSeconds: 60,
  });
  const response = await fetch(signed.url, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 delete failed with HTTP ${response.status}.`);
  }
}
