/**
 * bitchat-core — crypto.ts
 * =====================================================================
 * Cryptographic primitives for the TypeScript port of the bitchat E2E
 * offline-messaging core. Pure wrappers over the @noble family (audited,
 * pure-JS, work identically in the browser and Node).
 *
 * Mirrors the Swift CryptoKit usage in the bitchat app:
 *   - X25519 (Curve25519.KeyAgreement) for Noise static/ephemeral keys + DH
 *   - Ed25519 (Curve25519.Signing) for packet/announcement signatures
 *   - ChaCha20-Poly1305 (ChaChaPoly) for Noise cipher states + outbox seal
 *   - XChaCha20-Poly1305 for the NIP-44-style nostr private envelopes
 *   - SHA-256, HMAC-SHA256, HKDF-SHA256 for Noise key schedule
 *
 * All functions are pure; nothing is persisted here.
 */

import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import { chacha20poly1305, xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes as nobleRandomBytes } from '@noble/ciphers/utils.js';
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';
import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js';
import { hmac as nobleHmac } from '@noble/hashes/hmac.js';

// ---------------------------------------------------------------------------
// Bytes / hex helpers
// ---------------------------------------------------------------------------

export type Bytes = Uint8Array;

export function toHex(data: Bytes | number[]): string {
  let out = '';
  for (let i = 0; i < data.length; i++) {
    out += data[i].toString(16).padStart(2, '0');
  }
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, '');
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function concatBytes(...arrays: (Bytes | number[])[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/** Truncate or zero-pad `data` to exactly `size` bytes (8-byte routing IDs). */
export function sanitize8(data: Bytes): Uint8Array {
  const out = new Uint8Array(8);
  out.set(data.subarray(0, 8));
  return out;
}

/** Constant-time equality. */
export function ctEqual(a: Bytes, b: Bytes): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function randomBytes(n: number): Uint8Array {
  return nobleRandomBytes(n);
}

// ---------------------------------------------------------------------------
// Hashing / KDF
// ---------------------------------------------------------------------------

export function sha256(data: Bytes | number[]): Uint8Array {
  // Normalize number[] to Uint8Array — nobleSha256 only accepts typed arrays.
  return nobleSha256(Uint8Array.from(data));
}

export function sha256Hex(data: Bytes | number[]): string {
  return toHex(sha256(data));
}

export function hmacSha256(key: Bytes, msg: Bytes): Uint8Array {
  return nobleHmac(nobleSha256, key, msg);
}

/** HKDF-SHA256 expand. Empty salt/info are valid. */
export function hkdfSha256(
  ikm: Bytes,
  salt: Bytes,
  info: Bytes,
  length: number,
): Uint8Array {
  return nobleHkdf(nobleSha256, ikm, salt, info, length);
}

// ---------------------------------------------------------------------------
// X25519 (Curve25519.KeyAgreement)
// ---------------------------------------------------------------------------

/** 32-byte random private seed (CSPRNG). Clamping happens inside noble. */
export function x25519Keygen(): Uint8Array {
  return randomBytes(32);
}

export function x25519Pub(priv: Bytes): Uint8Array {
  return x25519.getPublicKey(priv);
}

export function x25519Shared(priv: Bytes, pub: Bytes): Uint8Array {
  return x25519.getSharedSecret(priv, pub);
}

// ---------------------------------------------------------------------------
// Ed25519 (Curve25519.Signing)
// ---------------------------------------------------------------------------

export function ed25519Keygen(): Uint8Array {
  return randomBytes(32);
}

export function ed25519Pub(priv: Bytes): Uint8Array {
  return ed25519.getPublicKey(priv);
}

export function ed25519Sign(msg: Bytes, priv: Bytes): Uint8Array {
  return ed25519.sign(msg, priv);
}

export function ed25519Verify(pub: Bytes, msg: Bytes, sig: Bytes): boolean {
  try {
    return ed25519.verify(sig, msg, pub);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// ChaCha20-Poly1305 / XChaCha20-Poly1305
// ---------------------------------------------------------------------------

/**
 * Seal: returns ciphertext || 16-byte tag.
 * Mirrors CryptoKit's ChaChaPoly.seal(...).combined.
 */
export function chachaSeal(
  key: Bytes,
  nonce: Bytes, // 12 bytes
  aad: Bytes,
  plaintext: Bytes,
): Uint8Array {
  return chacha20poly1305(key, nonce, aad).encrypt(plaintext);
}

/** Open a combined box; returns null on auth failure (constant-ish). */
export function chachaOpen(
  key: Bytes,
  nonce: Bytes, // 12 bytes
  aad: Bytes,
  combined: Bytes,
): Uint8Array | null {
  try {
    return chacha20poly1305(key, nonce, aad).decrypt(combined);
  } catch {
    return null;
  }
}

/** XChaCha20-Poly1305 with a 24-byte nonce. */
export function xchachaSeal(
  key: Bytes,
  nonce: Bytes, // 24 bytes
  aad: Bytes,
  plaintext: Bytes,
): Uint8Array {
  return xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
}

export function xchachaOpen(
  key: Bytes,
  nonce: Bytes, // 24 bytes
  aad: Bytes,
  combined: Bytes,
): Uint8Array | null {
  try {
    return xchacha20poly1305(key, nonce, aad).decrypt(combined);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// zlib (deflate) compression — matches CompressionUtil zlib on the wire
// ---------------------------------------------------------------------------

/**
 * Deflate (zlib-wrapped, RFC1950) via the platform CompressionStream API.
 * Works in modern browsers and Node >= 18. Returns null if unsupported.
 */
export async function zlibCompress(data: Bytes): Promise<Uint8Array | null> {
  const cs = (globalThis as unknown as { CompressionStream?: new (fmt: string) => { readable: ReadableStream; writable: WritableStream } }).CompressionStream;
  if (!cs) return null;
  try {
    const stream = new cs('deflate');
    const writer = stream.writable.getWriter();
    void writer.write(data as unknown as Uint8Array);
    void writer.close();
    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return concatBytes(...chunks);
  } catch {
    return null;
  }
}

/** Inflate (zlib-wrapped). Returns null on error / unsupported. */
export async function zlibDecompress(data: Bytes): Promise<Uint8Array | null> {
  const ds = (globalThis as unknown as { DecompressionStream?: new (fmt: string) => { readable: ReadableStream; writable: WritableStream } }).DecompressionStream;
  if (!ds) return null;
  try {
    const stream = new ds('deflate');
    const writer = stream.writable.getWriter();
    void writer.write(data as unknown as Uint8Array);
    void writer.close();
    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return concatBytes(...chunks);
  } catch {
    return null;
  }
}
