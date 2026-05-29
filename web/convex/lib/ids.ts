/**
 * Opaque, collision-resistant tag id generation for QR / NFC.
 *
 * Tag ids are intentionally meaningless ("tag_ab12cd34ef56") — they carry no
 * private asset data. The backend maps a tag id to an asset only after a
 * permission check. See /docs/security-model.md and /docs/kittrace.md.
 */

// Crockford-ish base32 alphabet (no ambiguous chars i/l/o/u).
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export function generateTagId(): string {
  let body = "";
  // 12 chars of base32 ≈ 60 bits of entropy — ample for per-org tag space.
  const bytes = randomBytes(12);
  for (let i = 0; i < bytes.length; i++) {
    body += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `tag_${body}`;
}

export function generateSlug(seed: string): string {
  const base = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = generateTagId().slice(4, 10);
  return base ? `${base}-${suffix}` : suffix;
}

function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  // Convex runtime provides Web Crypto.
  globalThis.crypto.getRandomValues(arr);
  return arr;
}
