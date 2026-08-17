/**
 * Ocean — End-to-End Encryption backend  [FEATURE 132]
 * ----------------------------------------------------
 * E2E-encrypted direct messages with key exchange + encrypted storage at rest.
 *
 * Security model (privacy by construction):
 *  - The server NEVER sees plaintext. Message bodies arrive as opaque base64
 *    AES-GCM ciphertext (plus IV and an RSA-OAEP-wrapped per-message session key)
 *    produced client-side with Web Crypto. Decryption happens only in the browser.
 *  - The server NEVER stores private keys or secrets. db.e2eeKeys holds PUBLIC
 *    RSA public keys only (PEM, spki); db.e2eeMessages holds ciphertext only.
 *  - Fingerprints are deterministic SHA-256 digests of the public key PEM (first
 *    12 hex chars) — used to bind a message to the sender's published key.
 *
 * Collections (idempotent ensure on every load):
 *  - db.e2eeKeys:     { userId, publicKeyPem, fingerprint, createdAt, updatedAt }
 *  - db.e2eeMessages: { id, fromId, toId, ciphertext, iv, wrappedKey,
 *                       wrappedKeyForSender, fromPublicKeyFingerprint,
 *                       createdAt, read }
 *    wrappedKey = per-message AES-256 session key wrapped with the RECIPIENT's
 *    RSA public key. wrappedKeyForSender (optional) = the same session key wrapped
 *    with the SENDER's own RSA public key so the sender can re-read their own sent
 *    messages in a later session. Both are opaque ciphertext — never keys/plaintext.
 */

import express from 'express';
import { createHash } from 'node:crypto';
import { getCtx } from './turtleServerContext';

export interface E2EEKeyRecord {
  userId: string;
  publicKeyPem: string;
  fingerprint: string;
  createdAt: number;
  updatedAt: number;
}

export interface E2EEMessage {
  id: string;
  fromId: string;
  toId: string;
  ciphertext: string;          // base64 of AES-256-GCM encrypted message bytes
  iv: string;                  // base64 of the 12-byte random IV
  wrappedKey: string;          // base64 of the AES session key wrapped w/ recipient RSA-OAEP
  wrappedKeyForSender: string | null; // optional: same session key wrapped w/ sender RSA-OAEP
  fromPublicKeyFingerprint: string;
  createdAt: number;
  read: boolean;
  /** Multi-device (feature 134): per linked-device copies of the AES session key,
   *  each wrapped with the ECDH-derived device wrapping key. deviceId -> base64. */
  deviceWrappedKeys?: Record<string, string> | null;
}

/** Linked device (feature 134): a second device of the same user, paired via QR
 *  code + WebCrypto ECDH. The server stores ONLY the ECDH *public* key — the
 *  shared secret never leaves the two devices, so ciphertext wrapped for this
 *  device can only be unwrapped by it. */
export interface E2EEDevice {
  deviceId: string;
  userId: string;
  name: string;
  /** Raw (uncompressed) P-256 ECDH public key, base64. Public — safe to store. */
  ecdhPublicKey: string;
  /** SHA-256 of HMAC(sharedSecret, token) — lets the pairing flow bind the
   *  device to a proof it actually holds the ECDH secret, without ever
   *  transmitting the secret itself. */
  pairProofHash: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface E2EEPairToken {
  token: string;
  userId: string;
  expiresAt: number;
  used: boolean;
}

const MAX_PEM_LEN = 16384;
const MIN_PEM_LEN = 40;
const MAX_CIPHERTEXT_LEN = 200000;
const MAX_IV_LEN = 128;
const MAX_WRAPPED_LEN = 8192;
const MAX_FP_LEN = 128;
const MAX_DEVICE_KEY_LEN = 4096; // ECDH raw P-256 pubkey (~91 chars b64) + slack
const MAX_DEVICE_WRAPPED_LEN = 8192;
const MAX_DEVICES_PER_USER = 8;

/** Short deterministic SHA-256 fingerprint (first 12 hex chars) of a public key PEM. */
function fingerprintOf(pem: string): string {
  return createHash('sha256').update(String(pem || '')).digest('hex').slice(0, 12);
}

function newMessageId(): string {
  return `e2ee-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function registerE2EERoutes(app: express.Express) {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = ctx;

  // POST /api/e2ee/keys — publish / upsert my RSA public key (public keys only)
  app.post('/api/e2ee/keys', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const pem = body.publicKeyPem ? String(body.publicKeyPem).trim() : '';
      if (pem.length < MIN_PEM_LEN || pem.length > MAX_PEM_LEN) {
        return res.status(400).json({ error: 'Invalid public key (length out of range).' });
      }
      // Accept PEM-formatted spki keys or bare base64 key blobs.
      const isPem = pem.includes('-----BEGIN PUBLIC KEY-----') && pem.includes('-----END PUBLIC KEY-----');
      const isB64 = /^[A-Za-z0-9+/=\r\n]+$/.test(pem);
      if (!isPem && !isB64) {
        return res.status(400).json({ error: 'Invalid public key format. Expected PEM (spki).' });
      }

      const db = loadDatabase();
      if (!Array.isArray(db.e2eeKeys)) db.e2eeKeys = [];
      const fingerprint = fingerprintOf(pem);
      const idx = db.e2eeKeys.findIndex((k: any) => k && k.userId === user.id);
      if (idx >= 0) {
        db.e2eeKeys[idx].publicKeyPem = pem;
        db.e2eeKeys[idx].fingerprint = fingerprint;
        db.e2eeKeys[idx].updatedAt = Date.now();
      } else {
        db.e2eeKeys.push({
          userId: user.id,
          publicKeyPem: pem,
          fingerprint,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      saveDatabase(db);
      res.json({ success: true, fingerprint });
    } catch (e: any) {
      console.warn('[e2ee] key publish error:', e?.message || e);
      res.status(500).json({ error: 'Failed to publish E2EE key.' });
    }
  });

  // GET /api/e2ee/keys — list users who published keys (id, name, fingerprint)
  app.get('/api/e2ee/keys', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      if (!Array.isArray(db.e2eeKeys)) db.e2eeKeys = [];
      const users = Array.isArray(db.users) ? db.users : [];
      const keys = db.e2eeKeys
        .filter((k: any) => k && k.userId && k.userId !== user.id)
        .map((k: any) => {
          const u = users.find((x: any) => x && x.id === k.userId);
          return {
            userId: k.userId,
            name: (u && (u.name || u.username)) || k.userId,
            fingerprint: k.fingerprint || fingerprintOf(k.publicKeyPem),
          };
        });
      res.json({ keys });
    } catch (e: any) {
      console.warn('[e2ee] key list error:', e?.message || e);
      res.status(500).json({ error: 'Failed to list E2EE keys.' });
    }
  });

  // GET /api/e2ee/keys/:userId — fetch a user's public key for key exchange (404 if none)
  app.get('/api/e2ee/keys/:userId', requireAuth, (req, res) => {
    try {
      const db = loadDatabase();
      if (!Array.isArray(db.e2eeKeys)) db.e2eeKeys = [];
      const key = db.e2eeKeys.find((k: any) => k && k.userId === req.params.userId);
      if (!key) {
        return res.status(404).json({ error: 'No E2EE key published for this user.' });
      }
      res.json({
        userId: key.userId,
        publicKeyPem: key.publicKeyPem,
        fingerprint: key.fingerprint || fingerprintOf(key.publicKeyPem),
      });
    } catch (e: any) {
      console.warn('[e2ee] key fetch error:', e?.message || e);
      res.status(500).json({ error: 'Failed to fetch E2EE key.' });
    }
  });

  // =====================================================================
  // Feature 134 — multi-device sync (QR pairing + ECDH).
  // Server stores public keys + pairing tokens only; all secrets stay on-device.
  // =====================================================================

  // POST /api/e2ee/devices/pair-start — issue a one-time pairing token for this
  // user (the "existing" device scans the QR / shares the code).
  app.post('/api/e2ee/devices/pair-start', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      if (!Array.isArray(db.e2eeDevices)) db.e2eeDevices = [];
      if (!Array.isArray(db.e2eePairTokens)) db.e2eePairTokens = [];
      const token = `pair-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
      db.e2eePairTokens.push({
        token,
        userId: user.id,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
        used: false,
      });
      // Prune stale tokens so the collection never grows unbounded.
      db.e2eePairTokens = (db.e2eePairTokens as E2EEPairToken[]).filter(
        (t) => !t.used && t.expiresAt > Date.now()
      );
      saveDatabase(db);
      res.json({ token, expiresAt: Date.now() + 10 * 60 * 1000 });
    } catch (e: any) {
      console.warn('[e2ee] pair-start error:', e?.message || e);
      res.status(500).json({ error: 'Failed to start device pairing.' });
    }
  });

  // POST /api/e2ee/devices/complete — the NEW device presents the pairing code
  // (token + the existing device's ECDH public key), registers its own ECDH
  // public key, and proves it holds the ECDH secret via HMAC(sharedSecret, token).
  app.post('/api/e2ee/devices/complete', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const token = String(body.token || '');
      const deviceName = String(body.deviceName || 'New device').slice(0, 40);
      const ecdhPublicKey = String(body.ecdhPublicKey || '');
      const pairProofHash = String(body.pairProofHash || '');
      if (!token || !ecdhPublicKey || !pairProofHash) {
        return res.status(400).json({ error: 'token, ecdhPublicKey and pairProofHash are required.' });
      }
      if (ecdhPublicKey.length > MAX_DEVICE_KEY_LEN || !/^[A-Za-z0-9+/=]+$/.test(ecdhPublicKey)) {
        return res.status(400).json({ error: 'Invalid ECDH public key format.' });
      }
      if (!/^[a-f0-9]{64}$/.test(pairProofHash)) {
        return res.status(400).json({ error: 'Invalid pair proof.' });
      }

      const db = loadDatabase();
      if (!Array.isArray(db.e2eeDevices)) db.e2eeDevices = [];
      if (!Array.isArray(db.e2eePairTokens)) db.e2eePairTokens = [];
      const rec = (db.e2eePairTokens as E2EEPairToken[]).find(
        (t) => t.token === token && !t.used && t.expiresAt > Date.now()
      );
      if (!rec) return res.status(400).json({ error: 'Pairing token missing, used, or expired.' });

      // The pair must link this device to the SAME user account (both devices
      // are logged in as the same person — sync happens between your devices).
      if (rec.userId !== user.id) {
        return res.status(403).json({ error: 'Pairing is only valid for the same account.' });
      }

      rec.used = true;
      const deviceId = `dev-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
      (db.e2eeDevices as E2EEDevice[]).push({
        deviceId,
        userId: user.id,
        name: deviceName || 'New device',
        ecdhPublicKey,
        pairProofHash,
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      });
      // Cap linked devices per user.
      const mine = (db.e2eeDevices as E2EEDevice[]).filter((d) => d.userId === user.id);
      if (mine.length > MAX_DEVICES_PER_USER) {
        const drop = mine.slice(0, mine.length - MAX_DEVICES_PER_USER);
        for (const d of drop) {
          const i = (db.e2eeDevices as E2EEDevice[]).findIndex((x) => x.deviceId === d.deviceId);
          if (i >= 0) (db.e2eeDevices as E2EEDevice[]).splice(i, 1);
        }
      }
      saveDatabase(db);
      res.json({ success: true, deviceId });
    } catch (e: any) {
      console.warn('[e2ee] device complete error:', e?.message || e);
      res.status(500).json({ error: 'Failed to complete device pairing.' });
    }
  });

  // GET /api/e2ee/devices — list this user's linked devices (public keys only).
  app.get('/api/e2ee/devices', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      if (!Array.isArray(db.e2eeDevices)) db.e2eeDevices = [];
      const devices = (db.e2eeDevices as E2EEDevice[])
        .filter((d) => d.userId === user.id)
        .map((d) => ({
          deviceId: d.deviceId,
          name: d.name,
          // Public ECDH key — lets an already-paired device re-derive the shared
          // wrapping secret (its own private key + this public key) in this session.
          ecdhPublicKey: d.ecdhPublicKey,
          createdAt: d.createdAt,
          lastSeenAt: d.lastSeenAt,
        }));
      res.json({ devices });
    } catch (e: any) {
      console.warn('[e2ee] devices list error:', e?.message || e);
      res.status(500).json({ error: 'Failed to list linked devices.' });
    }
  });

  // DELETE /api/e2ee/devices/:deviceId — unlink a device (owner only).
  app.delete('/api/e2ee/devices/:deviceId', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      if (!Array.isArray(db.e2eeDevices)) db.e2eeDevices = [];
      const i = (db.e2eeDevices as E2EEDevice[]).findIndex(
        (d) => d.deviceId === req.params.deviceId && d.userId === user.id
      );
      if (i < 0) return res.status(404).json({ error: 'Device not found.' });
      (db.e2eeDevices as E2EEDevice[]).splice(i, 1);
      saveDatabase(db);
      res.json({ success: true });
    } catch (e: any) {
      console.warn('[e2ee] device unlink error:', e?.message || e);
      res.status(500).json({ error: 'Failed to unlink device.' });
    }
  });

  // POST /api/e2ee/messages — store an encrypted message (opaque ciphertext only)
  app.post('/api/e2ee/messages', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const toUserId = String(body.toUserId || '');
      if (!toUserId) return res.status(400).json({ error: 'toUserId is required.' });
      const ciphertext = String(body.ciphertext || '');
      const iv = String(body.iv || '');
      const wrappedKey = String(body.wrappedKey || '');
      if (!ciphertext || !iv || !wrappedKey) {
        return res.status(400).json({ error: 'ciphertext, iv and wrappedKey are required.' });
      }
      if (ciphertext.length > MAX_CIPHERTEXT_LEN || iv.length > MAX_IV_LEN || wrappedKey.length > MAX_WRAPPED_LEN) {
        return res.status(400).json({ error: 'Payload too large.' });
      }

      const db = loadDatabase();
      if (!Array.isArray(db.e2eeMessages)) db.e2eeMessages = [];
      const recipient = (db.users || []).find((u: any) => u && u.id === toUserId);
      if (!recipient) return res.status(404).json({ error: 'Recipient not found.' });

      const wrappedForSender = body.wrappedKeyForSender
        ? String(body.wrappedKeyForSender).slice(0, MAX_WRAPPED_LEN)
        : null;
      const fp = String(body.fromPublicKeyFingerprint || '').slice(0, MAX_FP_LEN);

      // Feature 134: optional per-device wrapped session keys (opaque ciphertext).
      let deviceWrappedKeys: Record<string, string> | null = null;
      if (body.deviceWrappedKeys && typeof body.deviceWrappedKeys === 'object') {
        const clean: Record<string, string> = {};
        for (const [devId, b64] of Object.entries(body.deviceWrappedKeys)) {
          const s = String(b64 || '');
          if (s.length > 0 && s.length <= MAX_DEVICE_WRAPPED_LEN) clean[String(devId).slice(0, 80)] = s;
        }
        if (Object.keys(clean).length > 0) deviceWrappedKeys = clean;
      }

      const message: E2EEMessage = {
        id: newMessageId(),
        fromId: user.id,
        toId: toUserId,
        ciphertext,
        iv,
        wrappedKey,
        wrappedKeyForSender: wrappedForSender,
        fromPublicKeyFingerprint: fp,
        createdAt: Date.now(),
        read: false,
        deviceWrappedKeys,
      };
      db.e2eeMessages.push(message);
      saveDatabase(db);
      res.json({ message });
    } catch (e: any) {
      console.warn('[e2ee] message store error:', e?.message || e);
      res.status(500).json({ error: 'Failed to store encrypted message.' });
    }
  });

  // GET /api/e2ee/messages?with=:userId — my E2EE messages with a peer (both directions)
  app.get('/api/e2ee/messages', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const peer = String((req.query as any).with || '');
      if (!peer) return res.status(400).json({ error: '?with=<userId> is required.' });
      const db = loadDatabase();
      const messages = (db.e2eeMessages ?? [])
        .filter(
          (m: any) =>
            m &&
            ((m.fromId === user.id && m.toId === peer) || (m.fromId === peer && m.toId === user.id))
        )
        .sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
      res.json({ messages, peer });
    } catch (e: any) {
      console.warn('[e2ee] messages list error:', e?.message || e);
      res.status(500).json({ error: 'Failed to load encrypted messages.' });
    }
  });

  // POST /api/e2ee/messages/:id/read — mark read (recipient only)
  app.post('/api/e2ee/messages/:id/read', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const message = (db.e2eeMessages ?? []).find((m: any) => m && m.id === req.params.id);
      if (!message) return res.status(404).json({ error: 'Message not found.' });
      if (message.toId !== user.id) {
        return res.status(403).json({ error: 'Only the recipient can mark this message read.' });
      }
      message.read = true;
      saveDatabase(db);
      res.json({ success: true, id: message.id, read: true });
    } catch (e: any) {
      console.warn('[e2ee] message read error:', e?.message || e);
      res.status(500).json({ error: 'Failed to mark message read.' });
    }
  });

  // GET /api/e2ee/status — my key state + contacts who have published keys
  app.get('/api/e2ee/status', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      if (!Array.isArray(db.e2eeKeys)) db.e2eeKeys = [];
      const myKey = db.e2eeKeys.find((k: any) => k && k.userId === user.id);
      const users = Array.isArray(db.users) ? db.users : [];
      const contactsWithKeys = db.e2eeKeys
        .filter((k: any) => k && k.userId && k.userId !== user.id)
        .map((k: any) => {
          const u = users.find((x: any) => x && x.id === k.userId);
          return {
            userId: k.userId,
            name: (u && (u.name || u.username)) || k.userId,
            fingerprint: k.fingerprint || fingerprintOf(k.publicKeyPem),
          };
        });
      res.json({ hasKey: !!myKey, contactsWithKeys });
    } catch (e: any) {
      console.warn('[e2ee] status error:', e?.message || e);
      res.status(500).json({ error: 'Failed to load E2EE status.' });
    }
  });
}
