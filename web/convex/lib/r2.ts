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

function canonicalUri(bucket: string, key: string): string {
  return `/${encodeRfc3986(bucket)}/${key
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/")}`;
}

function amzDate(now: Date): { date: string; dateTime: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { date: iso.slice(0, 8), dateTime: iso };
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function hmacSha256(
  key: string | Uint8Array,
  value: string,
): Promise<Uint8Array> {
  const rawKey = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    exactArrayBuffer(rawKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(value),
  );
  return new Uint8Array(signature);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function canonicalQuery(params: [string, string][]): string {
  return params
    .slice()
    .sort(([aKey, aValue], [bKey, bValue]) =>
      aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey),
    )
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

function canonicalHeaders(headers: Record<string, string>) {
  const entries: [string, string][] = Object.entries(headers)
    .map(([name, value]): [string, string] => [
      name.toLowerCase(),
      value.trim().replace(/\s+/g, " "),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    canonical: entries.map(([name, value]) => `${name}:${value}\n`).join(""),
    signedHeaders: entries.map(([name]) => name).join(";"),
  };
}

async function signingKey(secretAccessKey: string, date: string) {
  const dateKey = await hmacSha256(`AWS4${secretAccessKey}`, date);
  const regionKey = await hmacSha256(dateKey, R2_REGION);
  const serviceKey = await hmacSha256(regionKey, R2_SERVICE);
  return await hmacSha256(serviceKey, "aws4_request");
}

export async function presignR2Url({
  method,
  key,
  expiresSeconds,
  headers = {},
}: PresignArgs): Promise<R2PresignedUrl> {
  const config = r2Config();
  const endpoint = new URL(config.endpoint);
  const now = new Date();
  const { date, dateTime } = amzDate(now);
  const credentialScope = `${date}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
  const signedHeaderInput = {
    host: endpoint.host,
    ...headers,
  };
  const { canonical, signedHeaders } = canonicalHeaders(signedHeaderInput);
  const queryParams: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", dateTime],
    ["X-Amz-Expires", String(expiresSeconds ?? DEFAULT_UPLOAD_EXPIRES_SECONDS)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];
  const canonicalRequest = [
    method,
    canonicalUri(config.bucket, key),
    canonicalQuery(queryParams),
    canonical,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    dateTime,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = bytesToHex(
    await hmacSha256(
      await signingKey(config.secretAccessKey, date),
      stringToSign,
    ),
  );
  queryParams.push(["X-Amz-Signature", signature]);

  const url = new URL(`${endpoint.origin}${canonicalUri(config.bucket, key)}`);
  url.search = canonicalQuery(queryParams);
  const { host: _host, ...clientHeaders } = signedHeaderInput;
  return { url: url.toString(), headers: clientHeaders };
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
