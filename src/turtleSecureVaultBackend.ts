/**
 * Ocean — Secure Vault backend (FEATURE 135)
 * -------------------------------------------
 * A private, passcode-protected vault for encrypted notes & photos.
 *
 * Crypto model (node:crypto only — no new deps):
 *  - The raw passcode is NEVER stored. On setup we persist only a salted hash:
 *      pinSalt = randomBytes(16).hex
 *      pinHash = scryptSync(pin, salt, 64).hex
 *    Verification uses timingSafeEqual on the hex-derived buffers.
 *  - Vault content is encrypted with AES-256-GCM:
 *      key = sha256(pinHash + userId)            <- 32-byte digest used directly
 *      iv  = randomBytes(12)
 *      stored payload = base64(iv + authTag + ciphertext)
 *    NOTE: AES-256 requires a 32-byte key, so we keep the full sha256 digest.
 *    (The "(16-byte key)" note in the spec would only be valid for aes-128 and
 *    would crash Node's cipher, so the full 32-byte digest is used.)
 *  - Decryption happens only server-side for the authenticated owner; the
 *    encrypted payload is what persists — plaintext is NEVER stored.
 *  - "Unlocked" state is a module-level in-memory Set<userId> — deliberately NOT
 *    persisted, so a server restart re-locks every vault.
 *
 * Data model (global db, idempotent ensure on every load):
 *  db.vaultProfiles: [{ userId, pinSalt, pinHash, biometricEnabled, updatedAt }]
 *  db.vaultEntries:  [{ id, userId, kind, title, encryptedContent, pinned, createdAt, updatedAt }]
 *
 * Routes (all guarded by requireAuth):
 *  GET    /api/vault/status              -> { hasProfile, biometricEnabled, entryCount, locked }
 *  POST   /api/vault/setup               -> create/update my profile ({ pin, biometricEnabled })
 *  POST   /api/vault/unlock              -> simulated unlock ({ method: "passcode"|"biometric", pin? })
 *  POST   /api/vault/entries             -> create encrypted entry ({ kind, title, content })
 *  GET    /api/vault/entries             -> MY entries, metadata only (no encryptedContent)
 *  GET    /api/vault/entries/:id         -> owner-only, decrypts -> { entry: { ...meta, content } }
 *  DELETE /api/vault/entries/:id         -> owner-only delete
 *  POST   /api/vault/entries/:id/pin     -> owner-only toggle pinned
 */

import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { getCtx } from './turtleServerContext';

/** In-memory unlocked users — NOT persisted (const per spec). */
const unlocked = new Set<string>();

const PIN_MIN = 4;
const PIN_MAX = 8;
const IV_LEN = 12;
const TAG_LEN = 16;

interface SecureVaultProfile {
  userId: string;
  pinSalt: string;
  pinHash: string;
  biometricEnabled: boolean;
  updatedAt: number;
}

interface VaultEntry {
  id: string;
  userId: string;
  kind: 'note' | 'photo';
  title: string;
  encryptedContent: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/** Idempotent collection ensure — safe to run on every load. */
function ensureCollections(db: any): void {
  if (!Array.isArray(db.vaultEntries)) db.vaultEntries = [];
  if (!Array.isArray(db.vaultProfiles)) db.vaultProfiles = [];
}

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 64).toString('hex');
}

function pinsMatch(pin: string, profile: SecureVaultProfile): boolean {
  try {
    const attempt = Buffer.from(hashPin(pin, profile.pinSalt), 'hex');
    const stored = Buffer.from(profile.pinHash, 'hex');
    if (attempt.length !== stored.length) return false;
    return timingSafeEqual(attempt, stored);
  } catch {
    return false;
  }
}

/** AES-256-GCM key = sha256(pinHash + userId) — full 32-byte digest. */
function deriveKey(pinHash: string, userId: string): Buffer {
  return createHash('sha256').update(pinHash + userId).digest();
}

function encryptContent(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, data]).toString('base64');
}

function decryptContent(payload: string, key: Buffer): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Metadata projection — never leaks encryptedContent. */
function metaOf(e: VaultEntry) {
  return { id: e.id, kind: e.kind, title: e.title, pinned: !!e.pinned, createdAt: e.createdAt };
}

export function registerSecureVaultRoutes(app: any): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // --- Status (unlock not required) ---
  app.get('/api/vault/status', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const profile = (db.vaultProfiles as SecureVaultProfile[]).find(p => p && p.userId === user.id) || null;
    const entryCount = (db.vaultEntries as VaultEntry[]).filter(e => e && e.userId === user.id).length;
    res.json({
      hasProfile: !!profile,
      biometricEnabled: profile ? !!profile.biometricEnabled : false,
      entryCount,
      locked: !unlocked.has(user.id),
    });
  });

  // --- Setup / update profile ---
  app.post('/api/vault/setup', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = (req.body || {}) as any;
    const pin = typeof body.pin === 'string' ? body.pin : '';
    if (pin.length < PIN_MIN || pin.length > PIN_MAX) {
      return res.status(400).json({ error: 'Passcode must be 4-8 characters.' });
    }
    const biometricEnabled = !!body.biometricEnabled;
    const db = loadDatabase();
    ensureCollections(db);
    const salt = randomBytes(16).toString('hex');
    const profile: SecureVaultProfile = {
      userId: user.id,
      pinSalt: salt,
      pinHash: hashPin(pin, salt),
      biometricEnabled,
      updatedAt: Date.now(),
    };
    const list = db.vaultProfiles as SecureVaultProfile[];
    const idx = list.findIndex(p => p && p.userId === user.id);
    if (idx >= 0) list[idx] = profile;
    else list.push(profile);
    saveDatabase(db);
    res.json({ status: 'ok' });
  });

  // --- Simulated unlock (in-memory only) ---
  app.post('/api/vault/unlock', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = (req.body || {}) as any;
    const method = body.method === 'biometric' ? 'biometric' : 'passcode';
    const db = loadDatabase();
    ensureCollections(db);
    const profile = (db.vaultProfiles as SecureVaultProfile[]).find(p => p && p.userId === user.id);
    if (!profile) return res.status(401).json({ error: 'No vault profile. Set one up first.' });
    if (method === 'biometric') {
      // Simulated — accepts any biometric.
      unlocked.add(user.id);
      return res.json({ unlocked: true });
    }
    const pin = typeof body.pin === 'string' ? body.pin : '';
    if (!pin || !pinsMatch(pin, profile)) {
      return res.status(401).json({ error: 'Incorrect passcode.' });
    }
    unlocked.add(user.id);
    res.json({ unlocked: true });
  });

  // --- Create encrypted entry (profile + unlocked required) ---
  app.post('/api/vault/entries', requireAuth, (req, res) => {
    const user = (req as any).user;
    if (!unlocked.has(user.id)) return res.status(401).json({ error: 'Vault is locked. Unlock first.' });
    const db = loadDatabase();
    ensureCollections(db);
    const profile = (db.vaultProfiles as SecureVaultProfile[]).find(p => p && p.userId === user.id);
    if (!profile) return res.status(401).json({ error: 'No vault profile. Set one up first.' });
    const body = (req.body || {}) as any;
    const kind: VaultEntry['kind'] = body.kind === 'photo' ? 'photo' : 'note';
    const title =
      typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : 'Untitled';
    const content = typeof body.content === 'string' ? body.content : '';
    if (!content) return res.status(400).json({ error: 'Content is required.' });
    const key = deriveKey(profile.pinHash, user.id);
    const now = Date.now();
    const entry: VaultEntry = {
      id: uid('vault'),
      userId: user.id,
      kind,
      title,
      encryptedContent: encryptContent(content, key),
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    (db.vaultEntries as VaultEntry[]).push(entry);
    saveDatabase(db);
    res.json({ entry: { ...metaOf(entry) } });
  });

  // --- List MY entries (metadata only — encryptedContent stripped) ---
  app.get('/api/vault/entries', requireAuth, (req, res) => {
    const user = (req as any).user;
    if (!unlocked.has(user.id)) return res.status(401).json({ error: 'Vault is locked. Unlock first.' });
    const db = loadDatabase();
    ensureCollections(db);
    const my = (db.vaultEntries as VaultEntry[])
      .filter(e => e && e.userId === user.id)
      .sort(
        (a, b) =>
          (!!b.pinned ? 1 : 0) - (!!a.pinned ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0)
      );
    res.json({ entries: my.map(metaOf) });
  });

  // --- Get one entry (owner-only, decrypts) ---
  app.get('/api/vault/entries/:id', requireAuth, (req, res) => {
    const user = (req as any).user;
    if (!unlocked.has(user.id)) return res.status(401).json({ error: 'Vault is locked. Unlock first.' });
    const db = loadDatabase();
    ensureCollections(db);
    const profile = (db.vaultProfiles as SecureVaultProfile[]).find(p => p && p.userId === user.id);
    if (!profile) return res.status(401).json({ error: 'No vault profile. Set one up first.' });
    const entry = (db.vaultEntries as VaultEntry[]).find(e => e && e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found.' });
    if (entry.userId !== user.id) return res.status(403).json({ error: 'Not your vault entry.' });
    let content = '';
    try {
      content = decryptContent(entry.encryptedContent, deriveKey(profile.pinHash, user.id));
    } catch {
      return res.status(500).json({ error: 'Failed to decrypt entry.' });
    }
    res.json({ entry: { ...metaOf(entry), content } });
  });

  // --- Delete (owner-only) ---
  app.delete('/api/vault/entries/:id', requireAuth, (req, res) => {
    const user = (req as any).user;
    if (!unlocked.has(user.id)) return res.status(401).json({ error: 'Vault is locked. Unlock first.' });
    const db = loadDatabase();
    ensureCollections(db);
    const list = db.vaultEntries as VaultEntry[];
    const idx = list.findIndex(e => e && e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Entry not found.' });
    if (list[idx].userId !== user.id) return res.status(403).json({ error: 'Not your vault entry.' });
    list.splice(idx, 1);
    saveDatabase(db);
    res.json({ success: true });
  });

  // --- Toggle pinned (owner-only) ---
  app.post('/api/vault/entries/:id/pin', requireAuth, (req, res) => {
    const user = (req as any).user;
    if (!unlocked.has(user.id)) return res.status(401).json({ error: 'Vault is locked. Unlock first.' });
    const db = loadDatabase();
    ensureCollections(db);
    const entry = (db.vaultEntries as VaultEntry[]).find(e => e && e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found.' });
    if (entry.userId !== user.id) return res.status(403).json({ error: 'Not your vault entry.' });
    entry.pinned = !entry.pinned;
    entry.updatedAt = Date.now();
    saveDatabase(db);
    res.json({ entry: { ...metaOf(entry) } });
  });
}
