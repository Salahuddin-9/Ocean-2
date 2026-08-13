/**
 * bitchat-core — noise.ts
 * =====================================================================
 * A faithful TypeScript port of the bitchat Noise implementation
 * (NoiseProtocol.swift / NoiseSession.swift).
 *
 *   Pattern XX  → interactive E2E sessions  (protocol "Noise_XX_25519_ChaChaPoly_SHA256")
 *   Pattern X   → one-way courier seals     (protocol "Noise_X_25519_ChaChaPoly_SHA256")
 *   DH Curve25519 | Cipher ChaCha20-Poly1305 | Hash SHA-256 | HKDF-SHA256
 *
 * Wire specifics that matter (verified against the Swift source):
 *   - Handshake ciphertext carries NO nonce prefix (useExtractedNonce=false).
 *   - Transport ciphertext carries a 4-byte big-endian nonce prefix
 *     (useExtractedNonce=true) + 1024-entry sliding-window replay guard.
 *   - The 12-byte ChaCha nonce = [0,0,0,0] || u64 little-endian counter.
 *   - Prologue is always mixed (MixHash), then pattern pre-message keys.
 *   - Noise X: responder static key is pre-mixed into the handshake hash,
 *     so the sealed box authenticates the SENDER via the `s` token.
 */

import {
  Bytes,
  chachaOpen,
  chachaSeal,
  concatBytes,
  ctEqual,
  hkdfSha256,
  randomBytes,
  sha256,
  x25519Keygen,
  x25519Pub,
  x25519Shared,
} from './crypto';

export const PROTOCOL_NAME_XX = 'Noise_XX_25519_ChaChaPoly_SHA256';
export const PROTOCOL_NAME_X = 'Noise_X_25519_ChaChaPoly_SHA256';

/** Prologue used for v1 static-sealed courier envelopes. */
export const COURIER_PROLOGUE_V1 = 'bitchat-courier-v1';

const HASH_LEN = 32;
const NONCE_SIZE = 12;
const NONCE_PREFIX_BYTES = 4;
const TAG_SIZE = 16;
const REPLAY_WINDOW_SIZE = 1024;

export class NoiseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoiseError';
  }
}

// ---------------------------------------------------------------------------
// CipherState — ChaCha20-Poly1305 with nonce tracking + replay window
// ---------------------------------------------------------------------------

interface CipherKey {
  key: Bytes;
  useExtractedNonce: boolean;
}

export class CipherState {
  private key: Bytes | null = null;
  private useExtractedNonce: boolean;
  private nonce = 0; // UInt64 in Swift; JS number is safe up to 2^53
  private highestReceivedNonce = -1;
  private replayWindow: Uint8Array = new Uint8Array(REPLAY_WINDOW_SIZE / 8);

  constructor(useExtractedNonce = false) {
    this.useExtractedNonce = useExtractedNonce;
  }

  initializeKey(key: Bytes): void {
    this.key = new Uint8Array(key);
    this.nonce = 0;
  }

  hasKey(): boolean {
    return this.key !== null;
  }

  getNonce(): number {
    return this.nonce;
  }

  /** 4-byte big-endian representation of the low 32 bits of a nonce. */
  private nonceToBytes(nonce: number): Uint8Array {
    const out = new Uint8Array(4);
    out[0] = (nonce >>> 24) & 0xff;
    out[1] = (nonce >>> 16) & 0xff;
    out[2] = (nonce >>> 8) & 0xff;
    out[3] = nonce & 0xff;
    return out;
  }

  /** 12-byte ChaCha nonce = [0,0,0,0] || u64 little-endian counter. */
  private nonceData(): Uint8Array {
    const out = new Uint8Array(NONCE_SIZE);
    // 8-byte little-endian at offset 4
    let v = this.nonce;
    for (let i = 0; i < 8; i++) {
      out[4 + i] = v & 0xff;
      v = Math.floor(v / 256);
    }
    return out;
  }

  encrypt(plaintext: Bytes, associatedData: Bytes = new Uint8Array()): Uint8Array {
    if (!this.key) throw new NoiseError('uninitializedCipher');
    const currentNonce = this.nonce;
    if (currentNonce > 0xffffffff - 1) throw new NoiseError('nonceExceeded');

    const ct = chachaSeal(this.key, this.nonceData(), associatedData, plaintext);
    this.nonce += 1;

    if (this.useExtractedNonce) {
      return concatBytes(this.nonceToBytes(currentNonce), ct);
    }
    return ct;
  }

  decrypt(data: Bytes, associatedData: Bytes = new Uint8Array()): Uint8Array {
    if (!this.key) throw new NoiseError('uninitializedCipher');
    if (data.length < 16) throw new NoiseError('invalidCiphertext');

    let decryptionNonce: number;
    let body: Bytes;

    if (this.useExtractedNonce) {
      if (data.length < NONCE_PREFIX_BYTES + 16) throw new NoiseError('invalidCiphertext');
      decryptionNonce =
        ((data[0] << 24) >>> 0) + (data[1] << 16) + (data[2] << 8) + data[3];
      if (decryptionNonce > 0xffffffff) throw new NoiseError('invalidCiphertext');
      if (!this.isValidNonce(decryptionNonce)) throw new NoiseError('replayDetected');
      body = data.subarray(NONCE_PREFIX_BYTES);
    } else {
      decryptionNonce = this.nonce;
      body = data;
    }

    // build the 12-byte nonce for the extracted counter
    const nonceBuf = new Uint8Array(NONCE_SIZE);
    let v = decryptionNonce;
    for (let i = 0; i < 8; i++) {
      nonceBuf[4 + i] = v & 0xff;
      v = Math.floor(v / 256);
    }

    const pt = chachaOpen(this.key, nonceBuf, associatedData, body);
    if (pt === null) throw new NoiseError('decryptionFailed');
    if (this.useExtractedNonce) {
      this.markNonce(decryptionNonce);
    } else {
      this.nonce += 1;
    }
    return pt;
  }

  // -- replay window (transport receive only) -------------------------------

  private isValidNonce(nonce: number): boolean {
    if (this.highestReceivedNonce >= REPLAY_WINDOW_SIZE && nonce <= this.highestReceivedNonce - REPLAY_WINDOW_SIZE) {
      return false; // too old, outside window
    }
    if (nonce <= this.highestReceivedNonce) {
      const bitIndex = this.highestReceivedNonce - nonce;
      const byteIndex = Math.floor(bitIndex / 8);
      const bit = bitIndex % 8;
      if ((this.replayWindow[byteIndex] & (1 << bit)) !== 0) return false; // replay
    }
    return true;
  }

  private markNonce(nonce: number): void {
    if (nonce > this.highestReceivedNonce) {
      const shift = nonce - this.highestReceivedNonce;
      if (shift >= REPLAY_WINDOW_SIZE) {
        this.replayWindow.fill(0);
      } else {
        // shift right by `shift` bits
        for (let i = this.replayWindow.length - 1; i >= 0; i--) {
          const byteShift = Math.floor(shift / 8);
          const bitShift = shift % 8;
          let val = 0;
          const srcIdx = i - byteShift;
          if (srcIdx >= 0) {
            val |= this.replayWindow[srcIdx] << bitShift;
            if (bitShift > 0 && srcIdx - 1 >= 0) {
              val |= this.replayWindow[srcIdx - 1] >>> (8 - bitShift);
            }
          }
          this.replayWindow[i] = val & 0xff;
        }
      }
      this.replayWindow[0] |= 1; // mark current nonce
      this.highestReceivedNonce = nonce;
    } else {
      const bitIndex = this.highestReceivedNonce - nonce;
      const byteIndex = Math.floor(bitIndex / 8);
      const bit = bitIndex % 8;
      this.replayWindow[byteIndex] |= 1 << bit;
    }
  }
}

// ---------------------------------------------------------------------------
// SymmetricState — chaining key + hash + handshake cipher
// ---------------------------------------------------------------------------

export class SymmetricState {
  private chainingKey: Uint8Array;
  private hash: Uint8Array;
  private cipherState = new CipherState(false);

  constructor(protocolName: string) {
    const nameData = new TextEncoder().encode(protocolName);
    if (nameData.length <= HASH_LEN) {
      const padded = new Uint8Array(HASH_LEN);
      padded.set(nameData);
      this.hash = padded;
    } else {
      this.hash = sha256(nameData);
    }
    this.chainingKey = new Uint8Array(this.hash);
  }

  mixKey(inputKeyMaterial: Bytes): void {
    const [ck, tempKey] = splitHkdf(this.chainingKey, inputKeyMaterial, 2);
    this.chainingKey = ck;
    this.cipherState.initializeKey(tempKey);
  }

  mixHash(data: Bytes): void {
    this.hash = sha256(concatBytes(this.hash, data));
  }

  mixKeyAndHash(inputKeyMaterial: Bytes): void {
    const [ck, h1, tempKey] = splitHkdf(this.chainingKey, inputKeyMaterial, 3);
    this.chainingKey = ck;
    this.mixHash(h1);
    this.cipherState.initializeKey(tempKey);
  }

  getHandshakeHash(): Uint8Array {
    return new Uint8Array(this.hash);
  }

  hasCipherKey(): boolean {
    return this.cipherState.hasKey();
  }

  encryptAndHash(plaintext: Bytes): Uint8Array {
    if (this.cipherState.hasKey()) {
      const ciphertext = this.cipherState.encrypt(plaintext, this.hash);
      this.mixHash(ciphertext);
      return ciphertext;
    }
    this.mixHash(plaintext);
    return plaintext;
  }

  decryptAndHash(ciphertext: Bytes): Uint8Array {
    if (this.cipherState.hasKey()) {
      const plaintext = this.cipherState.decrypt(ciphertext, this.hash);
      this.mixHash(ciphertext);
      return plaintext;
    }
    this.mixHash(ciphertext);
    return ciphertext;
  }

  split(useExtractedNonce: boolean): { send: CipherState; receive: CipherState } {
    const [k1, k2] = splitHkdf(this.chainingKey, new Uint8Array(), 2);
    const c1 = new CipherState(useExtractedNonce);
    c1.initializeKey(k1);
    const c2 = new CipherState(useExtractedNonce);
    c2.initializeKey(k2);
    return { send: c1, receive: c2 };
  }
}

function splitHkdf(ck: Bytes, ikm: Bytes, n: number): Uint8Array[] {
  const out = hkdfSha256(ck, ikm, new Uint8Array(), 32 * n);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < n; i++) parts.push(out.subarray(i * 32, (i + 1) * 32));
  return parts;
}

// ---------------------------------------------------------------------------
// HandshakeState — token processing for XX / X patterns
// ---------------------------------------------------------------------------

export type NoiseRole = 'initiator' | 'responder';

export type NoisePattern = 'XX' | 'X';

type Token = 'e' | 's' | 'ee' | 'es' | 'se' | 'ss';

const PATTERNS: Record<NoisePattern, Token[][]> = {
  XX: [['e'], ['e', 'ee', 's', 'es'], ['s', 'se']],
  X: [['e', 'es', 's', 'ss']],
};

export class HandshakeState {
  readonly pattern: NoisePattern;
  readonly role: NoiseRole;
  readonly prologue: Bytes;

  private symmetricState: SymmetricState;
  private messagePatterns: Token[][];
  private currentPattern = 0;
  private localStaticKey: Bytes | null;
  private localStaticPublic: Bytes | null;
  private localEphemeralKey: Bytes | null = null;
  private localEphemeralPublic: Bytes | null = null;
  private remoteStaticPublic: Bytes | null = null;
  private remoteEphemeralPublic: Bytes | null = null;
  private remoteStaticPublicFromPayload: Bytes | null = null;

  /** Test hook: deterministic ephemeral key for protocol-vector verification. */
  predeterminedEphemeralKey: Bytes | null = null;

  constructor(opts: {
    pattern: NoisePattern;
    role: NoiseRole;
    prologue?: Bytes;
    localStaticKey?: Bytes | null;
    remoteStaticKey?: Bytes | null;
    predeterminedEphemeralKey?: Bytes | null;
  }) {
    this.pattern = opts.pattern;
    this.role = opts.role;
    this.prologue = opts.prologue ? new Uint8Array(opts.prologue) : new Uint8Array();
    this.localStaticKey = opts.localStaticKey ? new Uint8Array(opts.localStaticKey) : null;
    this.localStaticPublic = this.localStaticKey ? x25519Pub(this.localStaticKey) : null;
    this.remoteStaticPublic = opts.remoteStaticKey ? new Uint8Array(opts.remoteStaticKey) : null;
    this.predeterminedEphemeralKey = opts.predeterminedEphemeralKey
      ? new Uint8Array(opts.predeterminedEphemeralKey)
      : null;
    this.messagePatterns = PATTERNS[opts.pattern];
    this.symmetricState = new SymmetricState(
      opts.pattern === 'XX' ? PROTOCOL_NAME_XX : PROTOCOL_NAME_X,
    );
    this.mixPreMessageKeys();
  }

  private mixPreMessageKeys(): void {
    // Mix prologue first (always).
    this.symmetricState.mixHash(this.prologue);
    if (this.pattern === 'X') {
      if (this.role === 'initiator' && this.remoteStaticPublic) {
        this.symmetricState.mixHash(this.remoteStaticPublic);
      } else if (this.role === 'responder' && this.localStaticPublic) {
        this.symmetricState.mixHash(this.localStaticPublic);
      }
    }
    // XX has no pre-message keys.
  }

  writeMessage(payload: Bytes = new Uint8Array()): Uint8Array {
    if (this.currentPattern >= this.messagePatterns.length) {
      throw new NoiseError('handshakeComplete');
    }
    let messageBuffer = new Uint8Array();
    for (const token of this.messagePatterns[this.currentPattern]) {
      switch (token) {
        case 'e': {
          let eph: Bytes;
          if (this.predeterminedEphemeralKey) {
            eph = this.predeterminedEphemeralKey;
            this.predeterminedEphemeralKey = null;
          } else {
            eph = x25519Keygen();
          }
          const epub = x25519Pub(eph);
          this.localEphemeralKey = eph;
          this.localEphemeralPublic = epub;
          messageBuffer = concatBytes(messageBuffer, epub);
          this.symmetricState.mixHash(epub);
          break;
        }
        case 's': {
          if (!this.localStaticPublic) throw new NoiseError('missingLocalStaticKey');
          const encrypted = this.symmetricState.encryptAndHash(this.localStaticPublic);
          messageBuffer = concatBytes(messageBuffer, encrypted);
          break;
        }
        case 'ee':
          if (!this.localEphemeralKey || !this.remoteEphemeralPublic) {
            throw new NoiseError('missingKeys');
          }
          this.symmetricState.mixKey(x25519Shared(this.localEphemeralKey, this.remoteEphemeralPublic));
          break;
        case 'es':
          if (this.role === 'initiator') {
            if (!this.localEphemeralKey || !this.remoteStaticPublic) throw new NoiseError('missingKeys');
            this.symmetricState.mixKey(x25519Shared(this.localEphemeralKey, this.remoteStaticPublic));
          } else {
            if (!this.localStaticKey || !this.remoteEphemeralPublic) throw new NoiseError('missingKeys');
            this.symmetricState.mixKey(x25519Shared(this.localStaticKey, this.remoteEphemeralPublic));
          }
          break;
        case 'se':
          if (this.role === 'initiator') {
            if (!this.localStaticKey || !this.remoteEphemeralPublic) throw new NoiseError('missingKeys');
            this.symmetricState.mixKey(x25519Shared(this.localStaticKey, this.remoteEphemeralPublic));
          } else {
            if (!this.localEphemeralKey || !this.remoteStaticPublic) throw new NoiseError('missingKeys');
            this.symmetricState.mixKey(x25519Shared(this.localEphemeralKey, this.remoteStaticPublic));
          }
          break;
        case 'ss':
          if (!this.localStaticKey || !this.remoteStaticPublic) throw new NoiseError('missingKeys');
          this.symmetricState.mixKey(x25519Shared(this.localStaticKey, this.remoteStaticPublic));
          break;
      }
    }

    // Encrypt the payload after all tokens (always — matches the Swift
    // implementation, which appends a 16-byte tag even for empty payloads
    // whenever the cipher has a key).
    const encryptedPayload = this.symmetricState.encryptAndHash(payload);
    messageBuffer = concatBytes(messageBuffer, encryptedPayload);

    this.currentPattern += 1;
    return messageBuffer;
  }

  readMessage(ciphertext: Bytes): Uint8Array {
    if (this.currentPattern >= this.messagePatterns.length) {
      throw new NoiseError('handshakeComplete');
    }
    let messageBuffer = new Uint8Array(ciphertext);
    for (const token of this.messagePatterns[this.currentPattern]) {
      switch (token) {
        case 'e': {
          if (messageBuffer.length < 32) throw new NoiseError('invalidMessage');
          const epub = messageBuffer.subarray(0, 32);
          this.remoteEphemeralPublic = epub;
          this.symmetricState.mixHash(epub);
          messageBuffer = messageBuffer.subarray(32);
          break;
        }
        case 's': {
          // static key may be encrypted (48 bytes) or plaintext (32 bytes)
          const plainOrCipherLen = this.symmetricState.hasCipherKey() ? 48 : 32;
          if (messageBuffer.length < plainOrCipherLen) throw new NoiseError('invalidMessage');
          const enc = messageBuffer.subarray(0, plainOrCipherLen);
          const plain = this.symmetricState.decryptAndHash(enc);
          this.remoteStaticPublicFromPayload = plain;
          this.remoteStaticPublic = plain;
          messageBuffer = messageBuffer.subarray(plainOrCipherLen);
          break;
        }
        case 'ee':
          if (!this.localEphemeralKey || !this.remoteEphemeralPublic) throw new NoiseError('missingKeys');
          this.symmetricState.mixKey(x25519Shared(this.localEphemeralKey, this.remoteEphemeralPublic));
          break;
        case 'es':
          // es: initiator DH(e, rs); responder DH(s, re)
          if (this.role === 'initiator') {
            if (!this.localEphemeralKey || !this.remoteStaticPublic) throw new NoiseError('missingKeys');
            this.symmetricState.mixKey(x25519Shared(this.localEphemeralKey, this.remoteStaticPublic));
          } else {
            if (!this.localStaticKey || !this.remoteEphemeralPublic) throw new NoiseError('missingKeys');
            this.symmetricState.mixKey(x25519Shared(this.localStaticKey, this.remoteEphemeralPublic));
          }
          break;
        case 'se':
          // se: initiator DH(s, re); responder DH(e, rs)
          if (this.role === 'initiator') {
            if (!this.localStaticKey || !this.remoteEphemeralPublic) throw new NoiseError('missingKeys');
            this.symmetricState.mixKey(x25519Shared(this.localStaticKey, this.remoteEphemeralPublic));
          } else {
            if (!this.localEphemeralKey || !this.remoteStaticPublic) throw new NoiseError('missingKeys');
            this.symmetricState.mixKey(x25519Shared(this.localEphemeralKey, this.remoteStaticPublic));
          }
          break;
        case 'ss':
          if (!this.localStaticKey || !this.remoteStaticPublic) throw new NoiseError('missingKeys');
          this.symmetricState.mixKey(x25519Shared(this.localStaticKey, this.remoteStaticPublic));
          break;
      }
    }

    // Decrypt the payload (always — matches the Swift implementation).
    const payload = this.symmetricState.decryptAndHash(messageBuffer);

    this.currentPattern += 1;
    return payload;
  }

  getRemoteStaticPublicKey(): Bytes | null {
    return this.remoteStaticPublicFromPayload
      ? new Uint8Array(this.remoteStaticPublicFromPayload)
      : this.remoteStaticPublic
        ? new Uint8Array(this.remoteStaticPublic)
        : null;
  }

  getHandshakeHash(): Uint8Array {
    return this.symmetricState.getHandshakeHash();
  }

  isComplete(): boolean {
    return this.currentPattern >= this.messagePatterns.length;
  }

  split(useExtractedNonce = true): { send: CipherState; receive: CipherState } {
    return this.symmetricState.split(useExtractedNonce);
  }

  /**
   * Complete the handshake and obtain transport ciphers.
   * Initiator sends with c1 / receives with c2; responder swaps (matches
   * the Swift getTransportCiphers).
   */
  getTransportCiphers(
    useExtractedNonce = true,
  ): { send: CipherState; receive: CipherState; handshakeHash: Uint8Array } {
    if (!this.isComplete()) throw new NoiseError('handshakeNotComplete');
    const finalHandshakeHash = this.symmetricState.getHandshakeHash();
    const { send, receive } = this.symmetricState.split(useExtractedNonce);
    if (this.role === 'responder') {
      return { send: receive, receive: send, handshakeHash: finalHandshakeHash };
    }
    return { send, receive, handshakeHash: finalHandshakeHash };
  }
}

// ---------------------------------------------------------------------------
// Interactive session helpers (Noise XX)
// ---------------------------------------------------------------------------

export interface TransportCiphers {
  send: CipherState;
  receive: CipherState;
  handshakeHash: Bytes;
}

/** Initiator step 1: create the handshake, return the first message. */
export function startXXInitiator(opts: {
  localStaticKey: Bytes;
  remoteStaticKey?: Bytes | null;
  prologue?: Bytes;
}): { handshake: HandshakeState; msg1: Uint8Array } {
  const handshake = new HandshakeState({
    pattern: 'XX',
    role: 'initiator',
    prologue: opts.prologue,
    localStaticKey: opts.localStaticKey,
    remoteStaticKey: opts.remoteStaticKey ?? null,
  });
  const msg1 = handshake.writeMessage();
  return { handshake, msg1 };
}

/** Responder: create responder handshake, consume msg1, return msg2. */
export function startXXResponder(opts: {
  localStaticKey: Bytes;
  remoteStaticKey?: Bytes | null;
  prologue?: Bytes;
}): { handshake: HandshakeState; msg1Consumed: boolean; write: (payload?: Bytes) => Uint8Array } {
  const handshake = new HandshakeState({
    pattern: 'XX',
    role: 'responder',
    prologue: opts.prologue,
    localStaticKey: opts.localStaticKey,
    remoteStaticKey: opts.remoteStaticKey ?? null,
  });
  return {
    handshake,
    msg1Consumed: false,
    write: (payload = new Uint8Array()) => handshake.writeMessage(payload),
  };
}

// ---------------------------------------------------------------------------
// One-way courier seal (Noise X)
// ---------------------------------------------------------------------------

/**
 * Seal a courier payload to a recipient's Noise static key (v1, no forward
 * secrecy — matches bitchat's static-sealed envelope). The sender's identity
 * is authenticated inside the ciphertext via the `s` token + `ss` DH.
 *
 * Returns `[32B e][48B enc static][len+16 enc payload]` = 96 + len(payload).
 */
export function sealCourierXWithKey(
  plaintext: Bytes,
  localStaticKey: Bytes,
  recipientStaticPublic: Bytes,
  prologue: Bytes,
): Uint8Array {
  const handshake = new HandshakeState({
    pattern: 'X',
    role: 'initiator',
    prologue,
    localStaticKey,
    remoteStaticKey: recipientStaticPublic,
  });
  return handshake.writeMessage(plaintext);
}

/**
 * Open a Noise X sealed box as the recipient. Returns the plaintext and the
 * sender's Noise static public key extracted from the `s` token.
 */
export function openCourierX(
  box: Bytes,
  localStaticKey: Bytes,
  prologue: Bytes,
): { plaintext: Uint8Array; senderStaticPublic: Uint8Array } | null {
  try {
    const handshake = new HandshakeState({
      pattern: 'X',
      role: 'responder',
      prologue,
      localStaticKey,
      remoteStaticKey: null,
    });
    const plaintext = handshake.readMessage(box);
    const sender = handshake.getRemoteStaticPublicKey();
    if (!sender) return null;
    return { plaintext, senderStaticPublic: sender };
  } catch {
    return null;
  }
}

export { ctEqual };
