/**
 * bitchat-core — identity.ts
 * =====================================================================
 * Long-term cryptographic identity for a mesh device.
 *
 * Port of the bitchat identity model:
 *   - `staticKey`   — X25519 private seed (Noise static key; 32 bytes)
 *   - `signingKey`  — Ed25519 private seed (32 bytes)
 *   - `peerID()`    — 16 lowercase hex chars = first 8 bytes of
 *                     SHA-256(fingerprint) of the Noise static PUBLIC key
 *   - `fingerprint()` — full 64-hex SHA-256 fingerprint (verification UI)
 *
 * In the native app these live in the iOS Keychain. Here they are sealed
 * in whatever storage the host provides (localStorage by default, or a
 * per-device store injected by the headless test harness). At-rest
 * protection of keys + sealed outbox is described in courier.ts.
 */

import {
  Bytes,
  ed25519Keygen,
  ed25519Pub,
  ed25519Sign,
  ed25519Verify,
  fromHex,
  sha256,
  toHex,
  x25519Keygen,
  x25519Pub,
} from './crypto';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const IDENTITY_STORAGE_KEY = 'ocean_bitchat_identity_v1';

export interface IdentitySeed {
  v: 1;
  staticKeyHex: string; // 32-byte X25519 private seed
  signingKeyHex: string; // 32-byte Ed25519 private seed
}

export class BitchatIdentity {
  readonly staticKey: Bytes;
  readonly signingKey: Bytes;

  private constructor(staticKey: Bytes, signingKey: Bytes) {
    this.staticKey = staticKey;
    this.signingKey = signingKey;
  }

  /** Generate a fresh identity. */
  static generate(): BitchatIdentity {
    return new BitchatIdentity(x25519Keygen(), ed25519Keygen());
  }

  // -- Derived keys ----------------------------------------------------------

  get staticPublicKey(): Uint8Array {
    return x25519Pub(this.staticKey);
  }

  get signingPublicKey(): Uint8Array {
    return ed25519Pub(this.signingKey);
  }

  /** 64-hex lowercase SHA-256 fingerprint of the Noise static public key. */
  fingerprint(): string {
    return this.fingerprintOf(this.staticPublicKey);
  }

  /** Full SHA-256 fingerprint of an arbitrary Noise static public key. */
  fingerprintOf(pub: Bytes): string {
    return toHex(sha256(pub));
  }

  /**
   * 16 lowercase hex chars = first 8 bytes of the SHA-256 fingerprint.
   * This is the device's routing/peer ID on the wire.
   */
  peerID(): string {
    return peerIDFromPublicKey(this.staticPublicKey);
  }

  // -- Signing ---------------------------------------------------------------

  sign(data: Bytes): Uint8Array {
    return ed25519Sign(data, this.signingKey);
  }

  verify(data: Bytes, sig: Bytes, pub: Bytes = this.signingPublicKey): boolean {
    return ed25519Verify(pub, data, sig);
  }

  // -- Persistence -----------------------------------------------------------

  toSeed(): IdentitySeed {
    return {
      v: 1,
      staticKeyHex: toHex(this.staticKey),
      signingKeyHex: toHex(this.signingKey),
    };
  }

  /** Load from storage, or generate + persist when absent. */
  static load(storage: KeyValueStore): BitchatIdentity {
    const raw = storage.getItem(IDENTITY_STORAGE_KEY);
    if (raw) {
      try {
        const seed = JSON.parse(raw) as IdentitySeed;
        if (
          seed &&
          typeof seed.staticKeyHex === 'string' &&
          typeof seed.signingKeyHex === 'string' &&
          seed.staticKeyHex.length === 64 &&
          seed.signingKeyHex.length === 64
        ) {
          return new BitchatIdentity(
            fromHex(seed.staticKeyHex),
            fromHex(seed.signingKeyHex),
          );
        }
      } catch {
        // corrupt -> regenerate
      }
    }
    const fresh = BitchatIdentity.generate();
    storage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(fresh.toSeed()));
    return fresh;
  }

  static fromSeed(seed: IdentitySeed): BitchatIdentity {
    return new BitchatIdentity(fromHex(seed.staticKeyHex), fromHex(seed.signingKeyHex));
  }
}

// ---------------------------------------------------------------------------
// Peer ID derivation (shared with the engine so routes use the same bytes)
// ---------------------------------------------------------------------------

/** 16-hex peer ID from a 32-byte Noise static public key. */
export function peerIDFromPublicKey(noiseStaticPublicKey: Bytes): string {
  return toHex(sha256(noiseStaticPublicKey)).slice(0, 16);
}

/** 8 raw routing bytes for the 8-byte wire sender/recipient field. */
export function routingDataFromPublicKey(noiseStaticPublicKey: Bytes): Uint8Array {
  return sha256(noiseStaticPublicKey).subarray(0, 8);
}
