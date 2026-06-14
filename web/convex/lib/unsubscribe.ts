/**
 * Stateless, signed unsubscribe tokens for notification emails. A token encodes
 * `orgId:email:scope` plus an HMAC-SHA256 signature, so the unsubscribe link
 * works without storing anything until the recipient actually clicks it — and
 * nobody can forge a link for an address they don't control without the secret.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type UnsubscribePayload = {
  orgId: string;
  email: string;
  scope: string;
};

// Encode a string to ArrayBuffer-backed bytes. The explicit ArrayBuffer keeps
// the type as Uint8Array<ArrayBuffer> (a BufferSource crypto.subtle accepts),
// not the wider Uint8Array<ArrayBufferLike> that TextEncoder.encode returns.
function bytesOf(text: string): Uint8Array<ArrayBuffer> {
  const src = encoder.encode(text);
  const out = new Uint8Array(new ArrayBuffer(src.length));
  out.set(src);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    bytesOf(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

/** Canonical signed string for a payload. Emails never contain ':'. */
function canonical(payload: UnsubscribePayload): string {
  return `${payload.orgId}:${payload.email.trim().toLowerCase()}:${payload.scope}`;
}

export async function signUnsubscribe(
  payload: UnsubscribePayload,
  secret: string,
): Promise<string> {
  const data = canonical(payload);
  const key = await hmacKey(secret, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, bytesOf(data));
  return `${toBase64Url(bytesOf(data))}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifyUnsubscribe(
  token: string,
  secret: string,
): Promise<UnsubscribePayload | null> {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const dataPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  let data: string;
  let sig: Uint8Array<ArrayBuffer>;
  try {
    data = decoder.decode(fromBase64Url(dataPart));
    sig = fromBase64Url(sigPart);
  } catch {
    return null;
  }
  const key = await hmacKey(secret, "verify");
  const ok = await crypto.subtle.verify("HMAC", key, sig, bytesOf(data));
  if (!ok) return null;
  const first = data.indexOf(":");
  const last = data.lastIndexOf(":");
  if (first <= 0 || last <= first) return null;
  return {
    orgId: data.slice(0, first),
    email: data.slice(first + 1, last),
    scope: data.slice(last + 1),
  };
}
