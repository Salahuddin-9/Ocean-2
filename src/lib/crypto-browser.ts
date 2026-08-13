// Browser-side encryption for encrypted backup export (AES-GCM + PBKDF2 via
// SubtleCrypto). Ported verbatim from arena-ai-glm5.2-social-media.

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 150000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function encryptBackup(data: unknown, passphrase: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plaintext = enc.encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );
  const payload = {
    v: 1,
    kdf: "PBKDF2-SHA256",
    cipher: "AES-GCM",
    salt: toB64(salt),
    iv: toB64(iv),
    data: toB64(cipher),
  };
  return JSON.stringify(payload, null, 2);
}

export async function decryptBackup(blob: string, passphrase: string): Promise<unknown> {
  const payload = JSON.parse(blob);
  const iv = fromB64(payload.iv);
  const key = await deriveKey(passphrase, fromB64(payload.salt));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    fromB64(payload.data) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
