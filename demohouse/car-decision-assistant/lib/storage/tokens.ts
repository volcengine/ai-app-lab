const RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureRandomBytes(length: number) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function createStorageId(prefix: string) {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

export function createEditToken() {
  return bytesToHex(secureRandomBytes(32));
}

export function normalizeRecoveryCode(value: string) {
  return value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, "");
}

export function createRecoveryCode() {
  const characters = Array.from(
    secureRandomBytes(16),
    (byte) => RECOVERY_ALPHABET[byte & 31]
  ).join("");

  return characters.match(/.{1,4}/g)?.join("-") ?? characters;
}

export async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return bytesToHex(new Uint8Array(digest));
}

export function hashRecoveryCode(value: string) {
  return sha256Hex(normalizeRecoveryCode(value));
}
